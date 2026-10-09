import {
  GoogleGenerativeAI,
  SchemaType,
  type Content,
  type FunctionDeclaration,
  type Part,
} from '@google/generative-ai';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';

import type { AuthUser } from '../auth/auth.types.js';
import { OrderAccessService } from '../order/order-access.service.js';
import { OrderService } from '../order/order.service.js';
import { db } from '../prisma/db.js';
import { RbacService } from '../rbac/rbac.service.js';
import { RedisService } from '../redis/redis.service.js';
import {
  buildCustomerTools,
  buildStaffTools,
  confirmPendingOrderAction,
  executeCustomerTool,
  executeStaffTool,
  getStaffToolOptions,
  type PendingOrderAction,
  type StaffToolContext,
} from './ai-agent-tools.js';
import { AI_AGENT_CONFIG } from './ai-agent.config.js';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

const CUSTOMER_SYSTEM_PROMPT = `তুমি একটা বাংলাদেশি e-commerce সাইটের সহায়ক গ্রাহক-সেবা সহকারী। গ্রাহককে তার order status, product খোঁজা, এবং shipping/return policy নিয়ে সাহায্য করো। শুধু বাংলায় বা গ্রাহক যে ভাষায় লিখেছে সেই ভাষায় উত্তর দাও। কখনো অন্য কোনো গ্রাহকের তথ্য প্রকাশ করবে না।

Shipping policy: ঢাকার ভেতরে ৬০৳, ঢাকার বাইরে ১২০৳ শিপিং চার্জ। ডেলিভারির সময় ২-৫ কার্যদিবস। পণ্য ফেরত DELIVERED হওয়ার ৭ দিনের মধ্যে করা যায়।`;

const STAFF_SYSTEM_PROMPT = `তুমি একটা e-commerce প্ল্যাটফর্মের স্টাফ সহকারী। স্টাফকে order খুঁজতে, status পরিবর্তন করতে, risk-flag বুঝতে, inventory check করতে, এবং sales summary বানাতে সাহায্য করো। সংক্ষিপ্ত, কার্যকর উত্তর দাও।

গুরুত্বপূর্ণ: update_order_status টুল কল করলে status সঙ্গে সঙ্গে বদলায় না — এটা শুধু একটা নিশ্চিতকরণের অনুরোধ তৈরি করে। ব্যবহারকারীকে স্পষ্ট করে জানাও কোন order-এ কোন পরিবর্তন হবে এবং নিশ্চিত করার বাটনে চাপ দিতে বলো। কখনোই বলবে না যে কাজটা সম্পন্ন হয়ে গেছে।`;

const JSON_TYPE_TO_SCHEMA_TYPE: Record<string, SchemaType> = {
  object: SchemaType.OBJECT,
  string: SchemaType.STRING,
  number: SchemaType.NUMBER,
  integer: SchemaType.INTEGER,
  boolean: SchemaType.BOOLEAN,
  array: SchemaType.ARRAY,
};

function toGeminiSchema(node: any): any {
  if (!node || typeof node !== 'object') {
    return node;
  }

  const converted: any = {
    ...node,
    type: JSON_TYPE_TO_SCHEMA_TYPE[node.type] ?? SchemaType.STRING,
  };

  if (node.properties) {
    converted.properties = Object.fromEntries(
      Object.entries(node.properties).map(([key, value]) => [
        key,
        toGeminiSchema(value),
      ]),
    );
  }

  if (node.items) {
    converted.items = toGeminiSchema(node.items);
  }

  return converted;
}

function toGeminiTools(anthropicTools: any[]): FunctionDeclaration[] {
  return anthropicTools.map((t) => ({
    name: t.name,
    description: t.description,
    parameters: toGeminiSchema(t.input_schema),
  }));
}

function toGeminiHistory(history: ChatMessage[]): Content[] {
  return history.map((h) => ({
    role: h.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: h.content }],
  }));
}

function isRetryableStatus(status: unknown): boolean {
  return status === 503 || status === 429;
}

async function withRetry<T>(
  fn: () => Promise<T>,
  maxAttempts = 3,
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      const status = (error as { status?: unknown })?.status;

      if (!isRetryableStatus(status) || attempt === maxAttempts) {
        throw error;
      }

      const delayMs = 500 * 2 ** (attempt - 1);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  throw lastError;
}

@Injectable()
export class AiAgentService {
  private readonly client: GoogleGenerativeAI;

  constructor(
    private readonly rbacService: RbacService,
    private readonly orderService: OrderService,
    private readonly orderAccess: OrderAccessService,
    private readonly redisService: RedisService,
  ) {
    this.client = new GoogleGenerativeAI(AI_AGENT_CONFIG.apiKey);
  }

  private buildStaffContext(user: AuthUser): StaffToolContext {
    return {
      user,
      organizationId: user.organizationId,
      orderService: this.orderService,
      orderAccess: this.orderAccess,
      rbac: this.rbacService,
      redis: this.redisService.getClient(),
    };
  }

  async chat(
    user: AuthUser,
    message: string | undefined,
    history: ChatMessage[],
    confirmActionId?: string,
  ): Promise<{
    reply: string;
    history: ChatMessage[];
    pendingActions?: PendingOrderAction[];
  }> {
    const { id: userId, organizationId } = user;

    const isStaff = await this.rbacService.hasPermission(
      userId,
      organizationId,
      'order.update',
    );

    // ---- ব্যবহারকারী বাটন চেপে একটা pending action নিশ্চিত করেছে ----
    // এই পথে LLM জড়িত নয়; action সরাসরি server-এ চলে।
    if (confirmActionId) {
      if (!isStaff) {
        throw new ForbiddenException('এই কাজের অনুমতি নেই');
      }

      const outcome = await confirmPendingOrderAction(
        this.buildStaffContext(user),
        confirmActionId,
      );

      const reply = outcome.success
        ? `✅ Order ${outcome.orderNumber}: "${outcome.action}" সম্পন্ন হয়েছে। নতুন status: ${outcome.status}`
        : `❌ ${outcome.error}`;

      return {
        reply,
        history: [
          ...history,
          { role: 'user', content: '[action নিশ্চিত করা হয়েছে]' },
          { role: 'assistant', content: reply },
        ],
      };
    }

    const userMessage = (message ?? '').trim();

    if (!userMessage) {
      throw new BadRequestException('message প্রয়োজন');
    }

    let systemPrompt: string;
    let tools: FunctionDeclaration[];
    let customerId: number | undefined;
    let staffContext: StaffToolContext | undefined;

    if (isStaff) {
      const options = await getStaffToolOptions(user, this.rbacService);

      staffContext = this.buildStaffContext(user);
      systemPrompt = STAFF_SYSTEM_PROMPT;
      tools = toGeminiTools(buildStaffTools(options));
    } else {
      const customer = await db.orm.public.Customer
        .where({ organizationId, userId })
        .first();

      if (!customer) {
        throw new ForbiddenException(
          'এই account-এর সাথে কোনো customer profile যুক্ত নেই',
        );
      }

      customerId = customer.id;
      systemPrompt = CUSTOMER_SYSTEM_PROMPT;
      tools = toGeminiTools(buildCustomerTools());
    }

    const model = this.client.getGenerativeModel({
      model: AI_AGENT_CONFIG.model,
      systemInstruction: systemPrompt,
      tools: [{ functionDeclarations: tools }],
      generationConfig: {
        maxOutputTokens: AI_AGENT_CONFIG.maxOutputTokens,
      },
    });

    const contents: Content[] = [
      ...toGeminiHistory(history),
      { role: 'user', parts: [{ text: userMessage }] },
    ];

    let finalText = '';
    const pendingActions: PendingOrderAction[] = [];

    for (let turn = 0; turn < 5; turn++) {
      const result = await withRetry(() =>
        model.generateContent({ contents }),
      );
      const response = result.response;

      const functionCalls = response.functionCalls() ?? [];
      const text = response.text();

      if (text) {
        finalText = text;
      }

      const modelParts = response.candidates?.[0]?.content?.parts;

      if (modelParts) {
        contents.push({ role: 'model', parts: modelParts });
      }

      if (functionCalls.length === 0) {
        break;
      }

      const functionResponses: Part[] = [];

      for (const call of functionCalls) {
        const rawResult = staffContext
          ? await executeStaffTool(call.name, call.args, staffContext)
          : await executeCustomerTool(
              call.name,
              call.args,
              organizationId,
              customerId!,
            );

        // String response-কে Parsed JSON-এ রূপান্তর
        let parsedResult: Record<string, any>;
        try {
          parsedResult = JSON.parse(rawResult);
        } catch {
          parsedResult = { result: rawResult };
        }

        if (staffContext && parsedResult.pendingConfirmation === true) {
          pendingActions.push({
            actionId: parsedResult.actionId,
            orderNumber: parsedResult.orderNumber,
            action: parsedResult.action,
            currentStatus: parsedResult.currentStatus,
          });
        }

        functionResponses.push({
          functionResponse: {
            name: call.name,
            response: parsedResult,
          },
        });
      }

      // role: 'user' ব্যবহার করতে হবে, কারণ TypeScript definitions-এ role টাইপ হলো 'user' | 'model'
      contents.push({ role: 'user', parts: functionResponses });
    }

    if (!finalText && pendingActions.length > 0) {
      finalText =
        'নিচের পরিবর্তনগুলো নিশ্চিত করলে কার্যকর হবে। এখনো কিছুই বদলায়নি।';
    }

    const updatedHistory: ChatMessage[] = [
      ...history,
      { role: 'user', content: userMessage },
      { role: 'assistant', content: finalText },
    ];

    return {
      reply: finalText,
      history: updatedHistory,
      ...(pendingActions.length > 0 ? { pendingActions } : {}),
    };
  }
}