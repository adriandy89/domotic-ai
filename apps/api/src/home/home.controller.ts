import {
  CreateHomeDto,
  UpdateHomeDto,
  HomePageOptionsDto,
  LinksUUIDsDto,
} from '@app/models';
import { HomeService } from './home.service';
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

@Controller('homes')
@UseGuards(AuthenticatedGuard)
export class HomeController {
  constructor(private readonly homeService: HomeService) { }

  @Get('statistics/organization')
  @Permissions([Role.MANAGER])
  @UseGuards(PermissionsGuard)
  async statisticsOrgHomes(@GetUserInfo() user: SessionUser) {
    try {
      return await this.homeService.statisticsOrgHomes(user.organization_id);
    } catch (error) {
      throw new BadRequestException('Bad request');
    }
  }

  @Post()
  @Permissions([Role.ADMIN])
  @UseGuards(PermissionsGuard)
  async create(@Body() homeDTO: CreateHomeDto, @GetUserInfo() user: SessionUser) {
    try {
      return await this.homeService.create(homeDTO, user.organization_id);
    } catch (error) {
      if (error.code === 'P2002') {
        throw new ConflictException('Duplicate, already exist');
      }
      throw error;
    }
  }

  @Put(':id')
  @Permissions([Role.ADMIN])
  @UseGuards(PermissionsGuard)
  async update(
    @Param('id') id: string,
    @Body() homeDTO: UpdateHomeDto,
    @GetUserInfo() user: SessionUser
  ) {
    try {
      return await this.homeService.update(id, homeDTO, user.organization_id);
    } catch (error) {
      throw new BadRequestException('Bad request');
    }
  }

  @Delete(':id')
  @Permissions([Role.ADMIN])
  @UseGuards(PermissionsGuard)
  async delete(@Param('id') id: string, @GetUserInfo() user: SessionUser) {
    try {
      return await this.homeService.delete(id, user.organization_id);
    } catch (error) {
      throw new BadRequestException('Bad request');
    }
  }

  @Get('mqtt/config')
  @Permissions([Role.MANAGER])
  @UseGuards(PermissionsGuard)
  async getMqttConfig() {
    return this.homeService.getMqttConfig();
  }


  @Get()
  @Permissions([Role.MANAGER])
  @UseGuards(PermissionsGuard)
  async findAll(@Query() optionsDto: HomePageOptionsDto, @GetUserInfo() user: SessionUser) {
    return this.homeService.findAll(optionsDto, user.organization_id);
  }

  @Get('me')
  async findAllByCurrentUser(@GetUserInfo() user: SessionUser) {
    try {
      return await this.homeService.findAllByUserId(user.id);
    } catch (error) {
      throw new BadRequestException('Bad request');
    }
  }

  @Get('unique/:uniqueId')
  @Permissions([Role.MANAGER])
  @UseGuards(PermissionsGuard)
  async findByUniqueId(@Param('uniqueId') uniqueId: string, @GetUserInfo() user: SessionUser) {
    const found = await this.homeService.findByUniqueId(uniqueId, user.organization_id);
    if (!found) {
      throw new NotFoundException('Not Found');
    }
    return found;
  }

  @Get(':id')
  @Permissions([Role.MANAGER])
  @UseGuards(PermissionsGuard)
  async findOne(@Param('id') id: string, @GetUserInfo() user: SessionUser) {
    const found = await this.homeService.findOne(id, user.organization_id);
    if (!found) {
      throw new NotFoundException('Not Found');
    }
    return found;
  }

  @Put('disable/many')
  @Permissions([Role.MANAGER])
  @UseGuards(PermissionsGuard)
  async disableMany(@Body('homes_ids') homesIds: string[], @GetUserInfo() user: SessionUser) {
    try {
      return await this.homeService.disableMany(homesIds, user.organization_id);
    } catch (error) {
      throw new BadRequestException('Bad request');
    }
  }

  @Put('enable/many')
  @Permissions([Role.MANAGER])
  @UseGuards(PermissionsGuard)
  async enableMany(@Body('homes_ids') homesIds: string[], @GetUserInfo() user: SessionUser) {
    try {
      return await this.homeService.enableMany(homesIds, user.organization_id);
    } catch (error) {
      throw new BadRequestException('Bad request');
    }
  }

  // ! Home - User Links

  @Get(':id/users')
  @Permissions([Role.ADMIN])
  @UseGuards(PermissionsGuard)
  async findAllUserLinks(@Param('id') id: string, @GetUserInfo() user: SessionUser) {
    return this.homeService.findUsersAllLinks(id, user.organization_id);
  }

  @Post('users/link')
  @Permissions([Role.ADMIN])
  @UseGuards(PermissionsGuard)
  async linkUsers(@Body() data: LinksUUIDsDto, @GetUserInfo() user: SessionUser) {
    try {
      return await this.homeService.linksUserHomes(data, user.organization_id);
    } catch (error) {
      throw new BadRequestException('Bad request');
    }
  }

  // ! Home - Device Links

  @Get(':id/devices')
  @Permissions([Role.ADMIN])
  @UseGuards(PermissionsGuard)
  async findAllDeviceLinks(@Param('id') id: string, @GetUserInfo() user: SessionUser) {
    return this.homeService.findDevicesAllLinks(id, user.organization_id);
  }

  @Post('devices/link')
  @Permissions([Role.ADMIN])
  @UseGuards(PermissionsGuard)
  async linkDevices(@Body() data: LinksUUIDsDto, @GetUserInfo() user: SessionUser) {
    try {
      return await this.homeService.linksDeviceHomes(data, user.organization_id);
    } catch (error) {
      throw new BadRequestException('Bad request');
    }
  }
}
