import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { EdgeService, EdgeExecutionInput } from './edge.service';
import { EdgeTokenGuard } from './edge-token.guard';

interface UploadExecutionsDto {
  homeUniqueId: string;
  executions: EdgeExecutionInput[];
}

/**
 * Edge-facing endpoints (token-auth, no session):
 *   GET  /api/v1/edge/rules/:homeUniqueId  → signed offline bundle (pull fallback)
 *   POST /api/v1/edge/executions           → upload buffered executions (idempotent)
 */
@Controller('edge')
@UseGuards(EdgeTokenGuard)
export class EdgeController {
  constructor(private readonly edgeService: EdgeService) {}

  @Get('rules/:homeUniqueId')
  async getRules(@Param('homeUniqueId') homeUniqueId: string) {
    const signed = await this.edgeService.getSignedBundle(homeUniqueId);
    if (!signed) throw new NotFoundException('home not found');
    return signed;
  }

  @Post('executions')
  async uploadExecutions(@Body() body: UploadExecutionsDto) {
    return this.edgeService.ingestExecutions(
      body.homeUniqueId,
      body.executions ?? [],
    );
  }
}
