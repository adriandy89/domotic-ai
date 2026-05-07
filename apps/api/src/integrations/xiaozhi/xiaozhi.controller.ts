import type { SessionUser } from '@app/models';
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { GetUserInfo } from '../../auth/decorators';
import { AuthenticatedGuard } from '../../auth/guards';
import { CreateXiaozhiIntegrationDto } from './dto/create-xiaozhi-integration.dto';
import { UpdateXiaozhiIntegrationDto } from './dto/update-xiaozhi-integration.dto';
import { XiaozhiIntegrationService } from './xiaozhi-integration.service';

@ApiTags('Integrations')
@Controller('users/me/integrations/xiaozhi')
@UseGuards(AuthenticatedGuard)
export class XiaozhiIntegrationController {
  constructor(private readonly svc: XiaozhiIntegrationService) {}

  @Get()
  list(@GetUserInfo() user: SessionUser) {
    return this.svc.listForUser(user.id);
  }

  @Post()
  create(
    @GetUserInfo() user: SessionUser,
    @Body() dto: CreateXiaozhiIntegrationDto,
  ) {
    return this.svc.create(user.id, dto);
  }

  @Patch(':id')
  update(
    @GetUserInfo() user: SessionUser,
    @Param('id') id: string,
    @Body() dto: UpdateXiaozhiIntegrationDto,
  ) {
    return this.svc.update(user.id, id, dto);
  }

  @Delete(':id')
  async remove(@GetUserInfo() user: SessionUser, @Param('id') id: string) {
    await this.svc.delete(user.id, id);
    return { ok: true };
  }

  @Post(':id/test')
  async test(@GetUserInfo() user: SessionUser, @Param('id') id: string) {
    await this.svc.test(user.id, id);
    return { ok: true };
  }
}
