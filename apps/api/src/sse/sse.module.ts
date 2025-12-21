import { Global, Module } from '@nestjs/common';
import { SSEController } from './sse.controller';

@Global()
@Module({
  imports: [],
  controllers: [SSEController],
  providers: [],
})
export class SSEModule {}
