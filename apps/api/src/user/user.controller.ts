import {
  CreateUserDto,
  LinksUUIDsDto,
  UpdateUserAttributesDto,
  UpdateUserDto,
  UpdateUserFmcTokenDto,
  UserPageOptionsDto,
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

@Controller('users')
@UseGuards(AuthenticatedGuard)
export class UserController {
  constructor(private readonly userService: UserService) { }

  @Get('statistics/total')
  @Permissions([Role.ADMIN, Role.MANAGER])
  @UseGuards(PermissionsGuard)
  async countTotalOrganizationUsers(@GetUserInfo() user: SessionUser) {
    return this.userService.countTotalOrganizationUsers(user);
  }

  @Get('statistics/organization')
  @Permissions([Role.ADMIN, Role.MANAGER])
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
      return await this.userService.create(userDTO, user);
    } catch (error) {
      if (error.code === 11000 || error.code === 'P2002') {
        throw new ConflictException('Duplicate, already exist');
      }
      throw error;
    }
  }

  @Get()
  @Permissions([Role.ADMIN, Role.MANAGER])
  @UseGuards(PermissionsGuard)
  async findAll(@Query() optionsDto: UserPageOptionsDto, @GetUserInfo() user: SessionUser) {
    return this.userService.findAll(optionsDto, user);
  }

  @Get(':id')
  @Permissions([Role.ADMIN, Role.MANAGER])
  @UseGuards(PermissionsGuard)
  async findOne(@Param('id') id: string, @GetUserInfo() user: SessionUser) {
    const found = await this.userService.findOne(id, user);
    if (!found) {
      throw new NotFoundException('Not Found');
    }
    return found;
  }

  @Put('attributes')
  async updateAttributes(
    @Body() userDTO: UpdateUserAttributesDto,
    @GetUserInfo() user: SessionUser
  ) {
    return this.userService.updateAttributes(userDTO, user);
  }

  @Put('fmc-tokens')
  async updateFmcTokens(
    @Body() fmcDTO: UpdateUserFmcTokenDto,
    @GetUserInfo() user: SessionUser
  ) {
    return this.userService.updateFmcTokens(fmcDTO, user);
  }

  @Delete('fmc-tokens')
  @HttpCode(HttpStatus.NO_CONTENT)
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
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Param('id') id: string, @GetUserInfo() user: SessionUser) {
    return this.userService.delete(id, user);
  }

  @Delete()
  @Permissions([Role.ADMIN])
  @UseGuards(PermissionsGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteMany(@Body('users_ids') usersIds: string[], @GetUserInfo() user: SessionUser) {
    try {
      return await this.userService.deleteMany(usersIds, user);
    } catch (error) {
      throw new BadRequestException('Bad request');
    }
  }

  @Put('disable/many')
  @Permissions([Role.ADMIN])
  @UseGuards(PermissionsGuard)
  async disableMany(@Body('users_ids') usersIds: string[], @GetUserInfo() user: SessionUser) {
    try {
      return await this.userService.disableMany(usersIds, user);
    } catch (error) {
      throw new BadRequestException('Bad request');
    }
  }

  @Put('enable/many')
  @Permissions([Role.ADMIN])
  @UseGuards(PermissionsGuard)
  async enableMany(@Body('users_ids') usersIds: string[], @GetUserInfo() user: SessionUser) {
    try {
      return await this.userService.enableMany(usersIds, user);
    } catch (error) {
      throw new BadRequestException('Bad request');
    }
  }

  // ! User - Home Links

  @Get(':id/homes')
  @Permissions([Role.ADMIN, Role.MANAGER])
  @UseGuards(PermissionsGuard)
  async findAllHomeLinks(@Param('id') id: string, @GetUserInfo() user: SessionUser) {
    return this.userService.findAllHomesLinks(user, id);
  }

  @Post(':id/homes/link')
  @Permissions([Role.ADMIN, Role.MANAGER])
  @UseGuards(PermissionsGuard)
  async linkHomes(@Param('id') id: string, @Body() data: LinksUUIDsDto, @GetUserInfo() user: SessionUser) {
    try {
      return await this.userService.linksHomesUser(data, user);
    } catch (error) {
      throw new BadRequestException('Bad request');
    }
  }
}
