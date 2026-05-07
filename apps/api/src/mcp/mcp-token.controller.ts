import type { SessionUser } from '@app/models';
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { GetUserInfo } from '../auth/decorators';
import { AuthenticatedGuard } from '../auth/guards';
import { CreateMcpTokenDto } from './dto/create-mcp-token.dto';
import { McpTokenService } from './mcp-token.service';

@ApiTags('MCP')
@Controller('users/me/mcp/tokens')
@UseGuards(AuthenticatedGuard)
export class McpTokenController {
  constructor(private readonly svc: McpTokenService) {}

  @Get()
  list(@GetUserInfo() user: SessionUser) {
    return this.svc.listForUser(user.id);
  }

  @Post()
  create(@GetUserInfo() user: SessionUser, @Body() dto: CreateMcpTokenDto) {
    return this.svc.create(user.id, dto.name);
  }

  @Delete(':id')
  async revoke(@GetUserInfo() user: SessionUser, @Param('id') id: string) {
    await this.svc.revoke(user.id, id);
    return { ok: true };
  }
}
