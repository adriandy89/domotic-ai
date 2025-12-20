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

  @Get()
  async findAll(@Query() optionsDto: DevicePageOptionsDto, @GetUserInfo() user: SessionUser) {
    return this.deviceService.findAll(optionsDto, user);
  }

  @Get('me')
  async findAllByCurrentUser(@GetUserInfo() user: SessionUser) {
    try {
      return await this.deviceService.findAllByCurrentUser(user.id);
    } catch (error) {
      throw new BadRequestException('Bad request');
    }
  }

  @Get('unique/:uniqueId')
  async findByUniqueId(@Param('uniqueId') uniqueId: string, @GetUserInfo() user: SessionUser) {
    const found = await this.deviceService.findByUniqueId(uniqueId, user);
    if (!found) {
      throw new NotFoundException('Not Found');
    }
    return found;
  }

  @Get('home/:homeId')
  async findAllByHomeId(@Param('homeId') homeId: string, @GetUserInfo() user: SessionUser) {
    const found = await this.deviceService.findAllByHomeId(homeId, user);
    if (!found) {
      throw new NotFoundException('Not Found');
    }
    return found;
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @GetUserInfo() user: SessionUser) {
    const found = await this.deviceService.findOne(id, user);
    if (!found) {
      throw new NotFoundException('Not Found');
    }
    return found;
  }

  @Put(':id')
  @Permissions([Role.ADMIN, Role.MANAGER])
  @UseGuards(PermissionsGuard)
  async update(
    @Param('id') id: string,
    @Body() deviceDTO: UpdateDeviceDto,
    @GetUserInfo() user: SessionUser
  ) {
    try {
      return await this.deviceService.update(id, deviceDTO, user);
    } catch (error) {
      throw new BadRequestException('Bad request');
    }
  }

  @Delete(':id')
  @Permissions([Role.ADMIN, Role.MANAGER])
  @UseGuards(PermissionsGuard)
  async delete(@Param('id') id: string, @GetUserInfo() user: SessionUser) {
    try {
      return await this.deviceService.delete(id, user);
    } catch (error) {
      throw new BadRequestException('Bad request');
    }
  }

  @Delete()
  @Permissions([Role.ADMIN, Role.MANAGER])
  @UseGuards(PermissionsGuard)
  async deleteMany(@Body('devices_ids') devicesIds: string[], @GetUserInfo() user: SessionUser) {
    try {
      return await this.deviceService.deleteMany(devicesIds, user);
    } catch (error) {
      throw new BadRequestException('Bad request');
    }
  }

  @Put('disable/many')
  @Permissions([Role.ADMIN, Role.MANAGER])
  @UseGuards(PermissionsGuard)
  async disableMany(@Body('devices_ids') devicesIds: string[], @GetUserInfo() user: SessionUser) {
    try {
      return await this.deviceService.disableMany(devicesIds, user);
    } catch (error) {
      throw new BadRequestException('Bad request');
    }
  }

  @Put('enable/many')
  @Permissions([Role.ADMIN, Role.MANAGER])
  @UseGuards(PermissionsGuard)
  async enableMany(@Body('devices_ids') devicesIds: string[], @GetUserInfo() user: SessionUser) {
    try {
      return await this.deviceService.enableMany(devicesIds, user);
    } catch (error) {
      throw new BadRequestException('Bad request');
    }
  }

  @Post('command/send')
  async sendCommand(@Body() commandDTO: CommandDeviceDto, @GetUserInfo() user: SessionUser) {
    return this.deviceService.sendCommand({ commandDTO, meta: user });
  }

  @Post('command')
  @Permissions([Role.ADMIN, Role.MANAGER])
  @UseGuards(PermissionsGuard)
  async createCommand(@Body() commandDTO: CreateCommandDeviceDto, @GetUserInfo() user: SessionUser) {
    return this.deviceService.createCommand({ commandDTO, meta: user });
  }

  @Put('command/:id')
  @Permissions([Role.ADMIN, Role.MANAGER])
  @UseGuards(PermissionsGuard)
  async updateCommandName(
    @Param('id') id: string,
    @Body() commandDTO: UpdateCommandNameDto,
    @GetUserInfo() user: SessionUser
  ) {
    return this.deviceService.updateCommandName({ id, commandDTO, meta: user });
  }

  @Delete('command/:id')
  @Permissions([Role.ADMIN, Role.MANAGER])
  @UseGuards(PermissionsGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteCommand(@Param('id') id: string, @GetUserInfo() user: SessionUser) {
    return this.deviceService.deleteCommand({ id, meta: user });
  }

  // ! ==============================
  @Get('statistics/total')
  @Permissions([Role.ADMIN, Role.MANAGER])
  @UseGuards(PermissionsGuard)
  async countTotalOrganizationDevices(@GetUserInfo() user: SessionUser) {
    return this.deviceService.countTotalOrganizationDevices(user);
  }

  @Get('statistics/organization')
  @Permissions([Role.ADMIN, Role.MANAGER])
  @UseGuards(PermissionsGuard)
  async statisticsOrgDevices(@GetUserInfo() user: SessionUser) {
    try {
      return await this.deviceService.statisticsOrgDevices(user.organization_id);
    } catch (error) {
      throw new BadRequestException('Bad request');
    }
  }
}
