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

@Controller('homes')
@UseGuards(AuthenticatedGuard)
export class HomeController {
  constructor(private readonly homeService: HomeService) { }

  @Get('statistics/total')
  @Permissions([Role.ADMIN, Role.MANAGER])
  @UseGuards(PermissionsGuard)
  async countTotalOrganizationHomes(@GetUserInfo() user: any) {
    return this.homeService.countTotalOrganizationHomes(user);
  }

  @Get('statistics/organization')
  @Permissions([Role.ADMIN, Role.MANAGER])
  @UseGuards(PermissionsGuard)
  async statisticsOrgHomes(@GetUserInfo() user: any) {
    try {
      return await this.homeService.statisticsOrgHomes(user.organization_id);
    } catch (error) {
      throw new BadRequestException('Bad request');
    }
  }

  @Get('mqtt/config')
  async getMqttConfig(@GetUserInfo() user: any) {
    return this.homeService.getMqttConfig();
  }

  @Post()
  @Permissions([Role.ADMIN, Role.MANAGER])
  @UseGuards(PermissionsGuard)
  async create(@Body() homeDTO: CreateHomeDto, @GetUserInfo() user: any) {
    try {
      return await this.homeService.create(homeDTO, user);
    } catch (error) {
      if (error.code === 'P2002') {
        throw new ConflictException('Duplicate, already exist');
      }
      throw error;
    }
  }

  @Get()
  async findAll(@Query() optionsDto: HomePageOptionsDto, @GetUserInfo() user: any) {
    return this.homeService.findAll(optionsDto, user);
  }

  @Get('select')
  async findAllSelect(@GetUserInfo() user: any) {
    return this.homeService.findAllSelect(user);
  }

  @Get('me')
  async findAllByCurrentUser(@GetUserInfo() user: any) {
    try {
      return await this.homeService.findAllByCurrentUser(user.id);
    } catch (error) {
      throw new BadRequestException('Bad request');
    }
  }

  @Get('unique/:uniqueId')
  async findByUniqueId(@Param('uniqueId') uniqueId: string, @GetUserInfo() user: any) {
    const found = await this.homeService.findByUniqueId(uniqueId, user);
    if (!found) {
      throw new NotFoundException('Not Found');
    }
    return found;
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @GetUserInfo() user: any) {
    const found = await this.homeService.findOne(id, user);
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
    @Body() homeDTO: UpdateHomeDto,
    @GetUserInfo() user: any
  ) {
    try {
      return await this.homeService.update(id, homeDTO, user);
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
      return await this.homeService.delete(id, user);
    } catch (error) {
      throw new BadRequestException('Bad request');
    }
  }

  @Delete()
  @Permissions([Role.ADMIN, Role.MANAGER])
  @UseGuards(PermissionsGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteMany(@Body('homes_ids') homesIds: string[], @GetUserInfo() user: any) {
    try {
      return await this.homeService.deleteMany(homesIds, user);
    } catch (error) {
      throw new BadRequestException('Bad request');
    }
  }

  @Put('disable/many')
  @Permissions([Role.ADMIN, Role.MANAGER])
  @UseGuards(PermissionsGuard)
  async disableMany(@Body('homes_ids') homesIds: string[], @GetUserInfo() user: any) {
    try {
      return await this.homeService.disableMany(homesIds, user);
    } catch (error) {
      throw new BadRequestException('Bad request');
    }
  }

  @Put('enable/many')
  @Permissions([Role.ADMIN, Role.MANAGER])
  @UseGuards(PermissionsGuard)
  async enableMany(@Body('homes_ids') homesIds: string[], @GetUserInfo() user: any) {
    try {
      return await this.homeService.enableMany(homesIds, user);
    } catch (error) {
      throw new BadRequestException('Bad request');
    }
  }

  // ! Home - User Links

  @Get(':id/users')
  @Permissions([Role.ADMIN, Role.MANAGER])
  @UseGuards(PermissionsGuard)
  async findAllUserLinks(@Param('id') id: string, @GetUserInfo() user: any) {
    return this.homeService.findUsersAllLinks(user, id);
  }

  @Post(':id/users/link')
  @Permissions([Role.ADMIN, Role.MANAGER])
  @UseGuards(PermissionsGuard)
  async linkUsers(@Param('id') id: string, @Body() data: LinksUUIDsDto, @GetUserInfo() user: any) {
    try {
      return await this.homeService.linksUserHomes(data, user);
    } catch (error) {
      throw new BadRequestException('Bad request');
    }
  }

  // ! Home - Device Links

  @Get(':id/devices')
  @Permissions([Role.ADMIN, Role.MANAGER])
  @UseGuards(PermissionsGuard)
  async findAllDeviceLinks(@Param('id') id: string, @GetUserInfo() user: any) {
    return this.homeService.findDevicesAllLinks(user, id);
  }

  @Post(':id/devices/link')
  @Permissions([Role.ADMIN, Role.MANAGER])
  @UseGuards(PermissionsGuard)
  async linkDevices(@Param('id') id: string, @Body() data: LinksUUIDsDto, @GetUserInfo() user: any) {
    try {
      return await this.homeService.linksDeviceHomes(data, user);
    } catch (error) {
      throw new BadRequestException('Bad request');
    }
  }
}
