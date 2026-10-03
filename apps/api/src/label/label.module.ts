import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { OrderModule } from '../order/order.module.js';
import { LabelPdfService } from './label-pdf.service.js';
import { LabelController } from './label.controller.js';

@Module({
  imports: [AuthModule, OrderModule],
  controllers: [LabelController],
  providers: [LabelPdfService],
})
export class LabelModule {}