import {
  CreateDeviceDto,
  UpdateDeviceDto,
  DevicePageOptionsDto,
  CommandDeviceDto,
  CreateCommandDeviceDto,
  UpdateCommandNameDto,
} from '@app/models';
import { DeviceService } from './device.service';
import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  NotFoundException,
  BadRequestException,
  ConflictException
} from '@nestjs/common';
import { AuthenticatedGuard, PermissionsGuard } from '../auth/guards';
import { GetUserInfo, Permissions } from '../auth/decorators';
import { Role } from 'generated/prisma/enums';
import type { SessionUser } from '@app/models';

@Controller('devices')
@UseGuards(AuthenticatedGuard)
export class DeviceController {
  constructor(private readonly deviceService: DeviceService) { }

  @Post()
  @Permissions([Role.MANAGER])
  @UseGuards(PermissionsGuard)
  async create(@Body() deviceDTO: CreateDeviceDto, @GetUserInfo() user: SessionUser) {
    try {
      return await this.deviceService.create(deviceDTO, user.organization_id);
    } catch (error) {
      console.log(error);
      if (error.code === 'P2002') {
        throw new ConflictException('Duplicate, already exist');
      }
      throw new BadRequestException('Bad request');
    }
  }

  @Put(':id')
  @Permissions([Role.MANAGER])
  @UseGuards(PermissionsGuard)
  async update(
    @Param('id') id: string,
    @Body() deviceDTO: UpdateDeviceDto,
    @GetUserInfo() user: SessionUser
  ) {
    try {
      return await this.deviceService.update(id, deviceDTO, user.organization_id);
    } catch (error) {
      throw new BadRequestException('Bad request');
    }
  }

  @Delete(':id')
  @Permissions([Role.MANAGER])
  @UseGuards(PermissionsGuard)
  async delete(@Param('id') id: string, @GetUserInfo() user: SessionUser) {
    try {
      return await this.deviceService.delete(id, user.organization_id);
    } catch (error) {
      throw new BadRequestException('Bad request');
    }
  }

  @Get()
  @Permissions([Role.MANAGER])
  @UseGuards(PermissionsGuard)
  async findAll(@Query() optionsDto: DevicePageOptionsDto, @GetUserInfo() user: SessionUser) {
    return this.deviceService.findAll(optionsDto, user.organization_id);
  }

  @Get('unique/:uniqueId')
  @Permissions([Role.MANAGER])
  @UseGuards(PermissionsGuard)
  async findByUniqueId(@Param('uniqueId') uniqueId: string, @GetUserInfo() user: SessionUser) {
    const found = await this.deviceService.findByUniqueId(uniqueId, user.organization_id);
    if (!found) {
      throw new NotFoundException('Not Found');
    }
    return found;
  }

  @Get('home/:homeId')
  @Permissions([Role.MANAGER])
  @UseGuards(PermissionsGuard)
  async findAllByHomeId(@Param('homeId') homeId: string, @GetUserInfo() user: SessionUser) {
    const found = await this.deviceService.findAllByHomeId(homeId, user.organization_id);
    if (!found) {
      throw new NotFoundException('Not Found');
    }
    return found;
  }

  @Get(':id')
  @Permissions([Role.MANAGER])
  @UseGuards(PermissionsGuard)
  async findOne(@Param('id') id: string, @GetUserInfo() user: SessionUser) {
    const found = await this.deviceService.findOne(id, user.organization_id);
    if (!found) {
      throw new NotFoundException('Not Found');
    }
    return found;
  }

  @Put('disable/many')
  @Permissions([Role.MANAGER])
  @UseGuards(PermissionsGuard)
  async disableMany(@Body('devices_ids') devicesIds: string[], @GetUserInfo() user: SessionUser) {
    try {
      return await this.deviceService.disableMany(devicesIds, user.organization_id);
    } catch (error) {
      throw new BadRequestException('Bad request');
    }
  }

  @Put('enable/many')
  @Permissions([Role.MANAGER])
  @UseGuards(PermissionsGuard)
  async enableMany(@Body('devices_ids') devicesIds: string[], @GetUserInfo() user: SessionUser) {
    try {
      return await this.deviceService.enableMany(devicesIds, user.organization_id);
    } catch (error) {
      throw new BadRequestException('Bad request');
    }
  }

  @Post('command/send')
  @Permissions([Role.MANAGER])
  @UseGuards(PermissionsGuard)
  async sendCommand(@Body() commandDTO: CommandDeviceDto, @GetUserInfo() user: SessionUser) {
    return this.deviceService.sendCommand({ commandDTO, organization_id: user.organization_id });
  }

  @Post('command')
  @Permissions([Role.MANAGER])
  @UseGuards(PermissionsGuard)
  async createCommand(@Body() commandDTO: CreateCommandDeviceDto, @GetUserInfo() user: SessionUser) {
    return this.deviceService.createCommand({ commandDTO, organization_id: user.organization_id });
  }

  @Put('command/:id')
  @Permissions([Role.MANAGER])
  @UseGuards(PermissionsGuard)
  async updateCommandName(
    @Param('id') id: string,
    @Body() commandDTO: UpdateCommandNameDto,
    @GetUserInfo() user: SessionUser
  ) {
    return this.deviceService.updateCommandName({ id, commandDTO, organization_id: user.organization_id });
  }

  @Delete('command/:id')
  @Permissions([Role.MANAGER])
  @UseGuards(PermissionsGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteCommand(@Param('id') id: string, @GetUserInfo() user: SessionUser) {
    return this.deviceService.deleteCommand({ id, organization_id: user.organization_id });
  }

  // ! ==============================

  @Get('statistics/organization')
  @Permissions([Role.MANAGER])
  @UseGuards(PermissionsGuard)
  async statisticsOrgDevices(@GetUserInfo() user: SessionUser) {
    try {
      return await this.deviceService.statisticsOrgDevices(user.organization_id);
    } catch (error) {
      throw new BadRequestException('Bad request');
    }
  }
}
