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

@Controller('devices')
@UseGuards(AuthenticatedGuard)
export class DeviceController {
  constructor(private readonly deviceService: DeviceService) { }

  @Get('statistics/total')
  @Permissions([Role.ADMIN, Role.MANAGER])
  @UseGuards(PermissionsGuard)
  async countTotalOrganizationDevices(@GetUserInfo() user: any) {
    return this.deviceService.countTotalOrganizationDevices(user);
  }

  @Get('statistics/organization')
  @Permissions([Role.ADMIN, Role.MANAGER])
  @UseGuards(PermissionsGuard)
  async statisticsOrgDevices(@GetUserInfo() user: any) {
    try {
      return await this.deviceService.statisticsOrgDevices(user.organization_id);
    } catch (error) {
      throw new BadRequestException('Bad request');
    }
  }

  @Post()
  @Permissions([Role.ADMIN, Role.MANAGER])
  @UseGuards(PermissionsGuard)
  async create(@Body() deviceDTO: CreateDeviceDto, @GetUserInfo() user: any) {
    try {
      return await this.deviceService.create(deviceDTO, user);
    } catch (error) {
      if (error.code === 'P2002') {
        throw new ConflictException('Duplicate, already exist');
      }
      throw error;
    }
  }

  @Get()
  async findAll(@Query() optionsDto: DevicePageOptionsDto, @GetUserInfo() user: any) {
    return this.deviceService.findAll(optionsDto, user);
  }

  @Get('me')
  async findAllByCurrentUser(@GetUserInfo() user: any) {
    try {
      return await this.deviceService.findAllByCurrentUser(user.id);
    } catch (error) {
      throw new BadRequestException('Bad request');
    }
  }

  @Get('unique/:uniqueId')
  async findByUniqueId(@Param('uniqueId') uniqueId: string, @GetUserInfo() user: any) {
    const found = await this.deviceService.findByUniqueId(uniqueId, user);
    if (!found) {
      throw new NotFoundException('Not Found');
    }
    return found;
  }

  @Get('home/:homeId')
  async findAllByHomeId(@Param('homeId') homeId: string, @GetUserInfo() user: any) {
    const found = await this.deviceService.findAllByHomeId(homeId, user);
    if (!found) {
      throw new NotFoundException('Not Found');
    }
    return found;
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @GetUserInfo() user: any) {
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
    @GetUserInfo() user: any
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
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Param('id') id: string, @GetUserInfo() user: any) {
    try {
      return await this.deviceService.delete(id, user);
    } catch (error) {
      throw new BadRequestException('Bad request');
    }
  }

  @Delete()
  @Permissions([Role.ADMIN, Role.MANAGER])
  @UseGuards(PermissionsGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteMany(@Body('devices_ids') devicesIds: string[], @GetUserInfo() user: any) {
    try {
      return await this.deviceService.deleteMany(devicesIds, user);
    } catch (error) {
      throw new BadRequestException('Bad request');
    }
  }

  @Put('disable/many')
  @Permissions([Role.ADMIN, Role.MANAGER])
  @UseGuards(PermissionsGuard)
  async disableMany(@Body('devices_ids') devicesIds: string[], @GetUserInfo() user: any) {
    try {
      return await this.deviceService.disableMany(devicesIds, user);
    } catch (error) {
      throw new BadRequestException('Bad request');
    }
  }

  @Put('enable/many')
  @Permissions([Role.ADMIN, Role.MANAGER])
  @UseGuards(PermissionsGuard)
  async enableMany(@Body('devices_ids') devicesIds: string[], @GetUserInfo() user: any) {
    try {
      return await this.deviceService.enableMany(devicesIds, user);
    } catch (error) {
      throw new BadRequestException('Bad request');
    }
  }

  @Post('command/send')
  async sendCommand(@Body() commandDTO: CommandDeviceDto, @GetUserInfo() user: any) {
    return this.deviceService.sendCommand({ commandDTO, meta: user });
  }

  @Post('command')
  @Permissions([Role.ADMIN, Role.MANAGER])
  @UseGuards(PermissionsGuard)
  async createCommand(@Body() commandDTO: CreateCommandDeviceDto, @GetUserInfo() user: any) {
    return this.deviceService.createCommand({ commandDTO, meta: user });
  }

  @Put('command/:id')
  @Permissions([Role.ADMIN, Role.MANAGER])
  @UseGuards(PermissionsGuard)
  async updateCommandName(
    @Param('id') id: string,
    @Body() commandDTO: UpdateCommandNameDto,
    @GetUserInfo() user: any
  ) {
    return this.deviceService.updateCommandName({ id, commandDTO, meta: user });
  }

  @Delete('command/:id')
  @Permissions([Role.ADMIN, Role.MANAGER])
  @UseGuards(PermissionsGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteCommand(@Param('id') id: string, @GetUserInfo() user: any) {
    return this.deviceService.deleteCommand({ id, meta: user });
  }
}
