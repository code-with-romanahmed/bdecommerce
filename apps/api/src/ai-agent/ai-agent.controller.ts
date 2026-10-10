import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import type { AuthenticatedRequest } from '../auth/jwt-auth.guard.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RateLimit } from '../rate-limit/rate-limit.decorator.js';
import { RateLimitGuard } from '../rate-limit/rate-limit.guard.js';
import { AiAgentService } from './ai-agent.service.js';

class ChatMessageDto {
  @IsIn(['user', 'assistant'])
  role!: 'user' | 'assistant';

  @IsString()
  @MaxLength(4000)
  content!: string;
}

class ChatDto {
  // নতুন মেসেজ। confirmActionId পাঠালে এটা বাদ দেওয়া যায়।
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  message?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => ChatMessageDto)
  history?: ChatMessageDto[];

  // আগের উত্তরের pendingActions[].actionId — ব্যবহারকারী "নিশ্চিত করুন"
  // বাটনে চাপলে frontend এটা পাঠাবে।
  @IsOptional()
  @IsUUID()
  confirmActionId?: string;
}

// JwtAuthGuard আগে চলে, তাই RateLimitGuard ইউজার id পায় (Gemini খরচ ঠেকাতে)
@Controller('agent')
@UseGuards(JwtAuthGuard, RateLimitGuard)
export class AiAgentController {
  constructor(private readonly aiAgentService: AiAgentService) {}

  @Post('chat')
  @RateLimit(
    { name: 'agent-chat-1m', by: 'user', limit: 10, windowSeconds: 60 },
    { name: 'agent-chat-1h', by: 'user', limit: 100, windowSeconds: 3600 },
  )
  async chat(
    @Req() request: AuthenticatedRequest,
    @Body() dto: ChatDto,
  ) {
    return this.aiAgentService.chat(
      request.authUser!,
      dto.message,
      dto.history ?? [],
      dto.confirmActionId,
    );
  }
}