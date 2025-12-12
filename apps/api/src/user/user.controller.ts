import {
  CreateUserDto,
  LinksIdsDto,
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

@Controller('users')
@UseGuards(AuthenticatedGuard)
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get('statistics/total')
  @Permissions([Role.ADMIN, Role.MANAGER])
  @UseGuards(PermissionsGuard)
  async countTotalOrganizationUsers(@GetUserInfo() user: any) {
    return this.userService.countTotalOrganizationUsers(user);
  }

  @Get('statistics/organization')
  @Permissions([Role.ADMIN, Role.MANAGER])
  @UseGuards(PermissionsGuard)
  async statisticsOrgUsers(@GetUserInfo() user: any) {
    try {
      return await this.userService.statisticsOrgUsers(user.organization_id);
    } catch (error) {
      throw new BadRequestException('Bad request');
    }
  }

  @Post()
  @Permissions([Role.ADMIN])
  @UseGuards(PermissionsGuard)
  async create(@Body() userDTO: CreateUserDto, @GetUserInfo() user: any) {
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
  async findAll(@Query() optionsDto: UserPageOptionsDto, @GetUserInfo() user: any) {
    return this.userService.findAll(optionsDto, user);
  }

  @Get(':id')
  @Permissions([Role.ADMIN, Role.MANAGER])
  @UseGuards(PermissionsGuard)
  async findOne(@Param('id') id: string, @GetUserInfo() user: any) {
    const found = await this.userService.findOne(id, user);
    if (!found) {
      throw new NotFoundException('Not Found');
    }
    return found;
  }

  @Put('attributes')
  async updateAttributes(
    @Body() userDTO: UpdateUserAttributesDto,
    @GetUserInfo() user: any
  ) {
    return this.userService.updateAttributes(userDTO, user);
  }

  @Put('fmc-tokens')
  async updateFmcTokens(
    @Body() fmcDTO: UpdateUserFmcTokenDto,
    @GetUserInfo() user: any
  ) {
    return this.userService.updateFmcTokens(fmcDTO, user);
  }

  @Delete('fmc-tokens')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteFmcToken(
    @Body() fmcDTO: UpdateUserFmcTokenDto,
    @GetUserInfo() user: any
  ) {
    return this.userService.deleteFmcToken(fmcDTO, user);
  }

  @Put(':id')
  @Permissions([Role.ADMIN])
  @UseGuards(PermissionsGuard)
  async update(
    @Param('id') id: string,
    @Body() userDTO: UpdateUserDto,
    @GetUserInfo() user: any
  ) {
    return this.userService.update(id, userDTO, user);
  }

  @Delete(':id')
  @Permissions([Role.ADMIN])
  @UseGuards(PermissionsGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Param('id') id: string, @GetUserInfo() user: any) {
    return this.userService.delete(id, user);
  }

  @Delete()
  @Permissions([Role.ADMIN])
  @UseGuards(PermissionsGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteMany(@Body('user_home_ids') userHomeIds: string[], @GetUserInfo() user: any) {
    try {
      return await this.userService.deleteMany(userHomeIds, user);
    } catch (error) {
      throw new BadRequestException('Bad request');
    }
  }

  @Put('disable/many')
  @Permissions([Role.ADMIN])
  @UseGuards(PermissionsGuard)
  async disableMany(@Body('user_home_ids') userHomeIds: string[], @GetUserInfo() user: any) {
    try {
      return await this.userService.disableMany(userHomeIds, user);
    } catch (error) {
      throw new BadRequestException('Bad request');
    }
  }

  @Put('enable/many')
  @Permissions([Role.ADMIN])
  @UseGuards(PermissionsGuard)
  async enableMany(@Body('user_home_ids') userHomeIds: string[], @GetUserInfo() user: any) {
    try {
      return await this.userService.enableMany(userHomeIds, user);
    } catch (error) {
      throw new BadRequestException('Bad request');
    }
  }

  // ! User - Home Links

  @Get(':id/homes')
  @Permissions([Role.ADMIN, Role.MANAGER])
  @UseGuards(PermissionsGuard)
  async findAllHomeLinks(@Param('id') id: string, @GetUserInfo() user: any) {
    return this.userService.findAllHomesLinks(user, id);
  }

  @Post(':id/homes/link')
  @Permissions([Role.ADMIN, Role.MANAGER])
  @UseGuards(PermissionsGuard)
  async linkHomes(@Param('id') id: string, @Body() data: LinksIdsDto, @GetUserInfo() user: any) {
    try {
      return await this.userService.linksHomesUser(data, user);
    } catch (error) {
      throw new BadRequestException('Bad request');
    }
  }
}
