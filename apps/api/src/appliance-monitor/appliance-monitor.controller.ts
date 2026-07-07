import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Role } from 'generated/prisma/enums';
import type { SessionUser } from '@app/models';
import {
  CreateApplianceMonitorDto,
  ToggleApplianceMonitorDto,
  UpdateApplianceMonitorDto,
} from '@app/models';
import { AuthenticatedGuard, PermissionsGuard } from '../auth/guards';
import { GetUserInfo, Permissions } from '../auth/decorators';
import { ApplianceMonitorService } from './appliance-monitor.service';

@Controller('appliance-monitors')
@UseGuards(AuthenticatedGuard)
export class ApplianceMonitorController {
  constructor(private readonly service: ApplianceMonitorService) {}

  @Post()
  @Permissions([Role.MANAGER])
  @UseGuards(PermissionsGuard)
  create(
    @Body() dto: CreateApplianceMonitorDto,
    @GetUserInfo() user: SessionUser,
  ) {
    return this.service.create(dto, user.organization_id);
  }

  @Get()
  @Permissions([Role.USER, Role.MANAGER])
  @UseGuards(PermissionsGuard)
  findAll(@GetUserInfo() user: SessionUser, @Query('home_id') homeId?: string) {
    return this.service.findAll(user.organization_id, homeId);
  }

  @Get(':id')
  @Permissions([Role.USER, Role.MANAGER])
  @UseGuards(PermissionsGuard)
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @GetUserInfo() user: SessionUser,
  ) {
    return this.service.findOne(id, user.organization_id);
  }

  @Put(':id')
  @Permissions([Role.MANAGER])
  @UseGuards(PermissionsGuard)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateApplianceMonitorDto,
    @GetUserInfo() user: SessionUser,
  ) {
    return this.service.update(id, dto, user.organization_id);
  }

  @Put('toggle/:id')
  @Permissions([Role.MANAGER])
  @UseGuards(PermissionsGuard)
  toggle(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ToggleApplianceMonitorDto,
    @GetUserInfo() user: SessionUser,
  ) {
    return this.service.toggle(id, dto.active, user.organization_id);
  }

  @Delete(':id')
  @Permissions([Role.MANAGER])
  @UseGuards(PermissionsGuard)
  delete(
    @Param('id', ParseUUIDPipe) id: string,
    @GetUserInfo() user: SessionUser,
  ) {
    return this.service.delete(id, user.organization_id);
  }
}
