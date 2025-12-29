import {
  CreateUserDto,
  LinksUUIDsDto,
  UpdateUserAttributesDto,
  UpdateUserDto,
  UpdateUserFmcTokenDto,
  UserPageOptionsDto,
  UUIDArrayDto,
} from '@app/models';
import { UserService } from './user.service';
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
  NotFoundException,
  BadRequestException,
  ConflictException
} from '@nestjs/common';
import { AuthenticatedGuard, PermissionsGuard } from '../auth/guards';
import { GetUserInfo, Permissions } from '../auth/decorators';
import { Role } from 'generated/prisma/enums';
import type { SessionUser } from '@app/models';

@Controller('users')
@UseGuards(AuthenticatedGuard)
export class UserController {
  constructor(private readonly userService: UserService) { }

  @Get('statistics/organization')
  @Permissions([Role.MANAGER])
  @UseGuards(PermissionsGuard)
  async statisticsOrgUsers(@GetUserInfo() user: SessionUser) {
    try {
      return await this.userService.statisticsOrgUsers(user.organization_id);
    } catch (error) {
      throw new BadRequestException('Bad request');
    }
  }

  @Post()
  @Permissions([Role.ADMIN])
  @UseGuards(PermissionsGuard)
  async create(@Body() userDTO: CreateUserDto, @GetUserInfo() user: SessionUser) {
    try {
      return await this.userService.create(userDTO, user.organization_id);
    } catch (error) {
      if (error.code === 11000 || error.code === 'P2002') {
        throw new ConflictException('Duplicate, already exist');
      }
      throw error;
    }
  }

  @Put('attributes')
  @Permissions([Role.MANAGER])
  @UseGuards(PermissionsGuard)
  async updateAttributes(
    @Body() userDTO: UpdateUserAttributesDto,
    @GetUserInfo() user: SessionUser
  ) {
    return this.userService.updateAttributes(userDTO, user);
  }

  @Put('fmc-tokens')
  @Permissions([Role.MANAGER])
  @UseGuards(PermissionsGuard)
  async updateFmcTokens(
    @Body() fmcDTO: UpdateUserFmcTokenDto,
    @GetUserInfo() user: SessionUser
  ) {
    return this.userService.updateFmcTokens(fmcDTO, user);
  }

  @Delete('fmc/tokens')
  @Permissions([Role.MANAGER])
  @UseGuards(PermissionsGuard)
  async deleteFmcToken(
    @Body() fmcDTO: UpdateUserFmcTokenDto,
    @GetUserInfo() user: SessionUser
  ) {
    return this.userService.deleteFmcToken(fmcDTO, user);
  }

  @Put(':id')
  @Permissions([Role.ADMIN])
  @UseGuards(PermissionsGuard)
  async update(
    @Param('id') id: string,
    @Body() userDTO: UpdateUserDto,
    @GetUserInfo() user: SessionUser
  ) {
    return this.userService.update(id, userDTO, user);
  }

  @Delete(':id')
  @Permissions([Role.ADMIN])
  @UseGuards(PermissionsGuard)
  async delete(@Param('id') id: string, @GetUserInfo() user: SessionUser) {
    return this.userService.delete(id, user);
  }


  @Get()
  @Permissions([Role.MANAGER])
  @UseGuards(PermissionsGuard)
  async findAll(@Query() optionsDto: UserPageOptionsDto, @GetUserInfo() user: SessionUser) {
    return this.userService.findAll(optionsDto, user.organization_id);
  }

  @Get(':id')
  @Permissions([Role.MANAGER])
  @UseGuards(PermissionsGuard)
  async findOne(@Param('id') id: string, @GetUserInfo() user: SessionUser) {
    const found = await this.userService.findOne(id, user.organization_id);
    if (!found) {
      throw new NotFoundException('Not Found');
    }
    return found;
  }

  @Put('disable/many')
  @Permissions([Role.ADMIN])
  @UseGuards(PermissionsGuard)
  async disableMany(@Body() uuidArrayDto: UUIDArrayDto, @GetUserInfo() user: SessionUser) {
    try {
      return await this.userService.disableMany(uuidArrayDto.uuids, user);
    } catch (error) {
      throw new BadRequestException('Bad request');
    }
  }

  @Put('enable/many')
  @Permissions([Role.ADMIN])
  @UseGuards(PermissionsGuard)
  async enableMany(@Body() uuidArrayDto: UUIDArrayDto, @GetUserInfo() user: SessionUser) {
    try {
      return await this.userService.enableMany(uuidArrayDto.uuids, user.organization_id);
    } catch (error) {
      throw new BadRequestException('Bad request');
    }
  }

  // ! User - Home Links

  @Get(':id/homes')
  @Permissions([Role.ADMIN])
  @UseGuards(PermissionsGuard)
  async findAllHomeLinks(@Param('id') id: string, @GetUserInfo() user: SessionUser) {
    return this.userService.findAllHomesLinks(id, user.organization_id);
  }

  @Post('homes/link')
  @Permissions([Role.ADMIN])
  @UseGuards(PermissionsGuard)
  async linkHomes(@Body() data: LinksUUIDsDto, @GetUserInfo() user: SessionUser) {
    try {
      return await this.userService.linksHomesUsers(data, user.organization_id);
    } catch (error) {
      throw new BadRequestException('Bad request');
    }
  }
}
