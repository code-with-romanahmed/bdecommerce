import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { Type } from 'class-transformer';
import {
    IsArray,
    IsOptional,
    IsString,
    ValidateNested,
} from 'class-validator';
import type { AuthenticatedRequest } from '../auth/jwt-auth.guard.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { OrganizationId } from '../auth/organization-context.decorator.js';
import { AiAgentService } from './ai-agent.service.js';

class ChatMessageDto {
  @IsString()
  role!: 'user' | 'assistant';

  @IsString()
  content!: string;
}

class ChatDto {
  @IsString()
  message!: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ChatMessageDto)
  history?: ChatMessageDto[];
}
@Controller('agent')
@UseGuards(JwtAuthGuard)
export class AiAgentController {
  constructor(private readonly aiAgentService: AiAgentService) {}

  @Post('chat')
  async chat(
    @OrganizationId() organizationId: number,
    @Req() request: AuthenticatedRequest,
    @Body() dto: ChatDto,
  ) {
    return this.aiAgentService.chat(
      organizationId,
      request.authUser!.id,
      dto.message,
      dto.history ?? [],
    );
  }
}