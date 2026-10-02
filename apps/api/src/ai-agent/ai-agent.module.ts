import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { OrderModule } from '../order/order.module.js';
import { AiAgentController } from './ai-agent.controller.js';
import { AiAgentService } from './ai-agent.service.js';

@Module({
  imports: [AuthModule, OrderModule],
  controllers: [AiAgentController],
  providers: [AiAgentService],
})
export class AiAgentModule {}