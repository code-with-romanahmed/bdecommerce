import { Global, Module } from '@nestjs/common';
import { CourierCheckService } from './courier-check.service.js';

@Global()
@Module({
  providers: [CourierCheckService],
  exports: [CourierCheckService],
})
export class CourierCheckModule {}