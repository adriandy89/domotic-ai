import { Module } from '@nestjs/common';
import { RuleService } from './rule.service';
import { RuleController } from './rule.controller';
import { EdgeModule } from '../edge/edge.module';

@Module({
  imports: [EdgeModule],
  controllers: [RuleController],
  providers: [RuleService],
})
export class RuleModule {}
