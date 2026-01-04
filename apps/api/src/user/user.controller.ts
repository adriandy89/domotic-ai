import type { SessionUser } from '@app/models';
import {
  AiProvider,
  CreateUserDto,
  LinksUUIDsDto, OrgAiConfigDto, UpdateUserAttributesDto,
  UpdateUserDto,
  UpdateUserFmcTokenDto,
  UserPageOptionsDto,
  UUIDArrayDto
} from '@app/models';
import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBody } from '@nestjs/swagger';
import type { Request } from 'express';
import { Role } from 'generated/prisma/enums';
import { GetUserInfo, Permissions } from '../auth/decorators';
import { AuthenticatedGuard, PermissionsGuard } from '../auth/guards';
import { UserService } from './user.service';

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
    @GetUserInfo() user: SessionUser,
    @Req() req: Request
  ) {
    try {
      const result = await this.userService.updateAttributes(userDTO, user);
      if (result.ok) {
        // 1. Update current session immediately
        const session = (req as any).session;
        if (session && session.passport && session.passport.user) {
          session.passport.user.attributes = result.data.attributes;
        }

        // 2. Lazy index the current session
        const sessionId = (req as any).sessionID;
        if (sessionId) {
          await this.userService.saveUserSession(user.id, sessionId);
        }

        // 3. Update all OTHER active sessions
        await this.userService.updateAllUserSessions(user.id, result.data.attributes);
      }
      return result;
    } catch (error) {
      console.error('Error updating attributes:', error);
      throw new BadRequestException('Bad request');
    }
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

  @Get('me/attributes')
  @Permissions([Role.MANAGER])
  @UseGuards(PermissionsGuard)
  async findMeAttributes(@GetUserInfo() user: SessionUser) {
    return user.attributes || {};
  }

  @Get('sessions/active')
  @Permissions([Role.MANAGER])
  @UseGuards(PermissionsGuard)
  async countActiveSessions(
    @GetUserInfo() user: SessionUser,
    @Req() req: Request
  ) {
    const sessionId = (req as any).sessionID;
    const count = await this.userService.countOtherSessions(user.id, sessionId);
    return { ok: true, count };
  }

  @Delete('sessions/others')
  @Permissions([Role.ADMIN])
  @UseGuards(PermissionsGuard)
  async revokeOtherSessions(
    @GetUserInfo() user: SessionUser,
    @Req() req: Request
  ) {
    const sessionId = (req as any).sessionID;
    await this.userService.revokeOtherSessions(user.id, sessionId);
    return { ok: true };
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

  @Put('org/attributes/ai')
  @ApiBody({
    type: OrgAiConfigDto,
    examples: {
      example1: {
        value: {
          provider: AiProvider.OPENAI,
          model: 'gpt-4.1-nano',
          apiKey: 'sk-...',
          temperature: 0.5,
          enabled: true,
        } satisfies OrgAiConfigDto,
      },
    },
  })

  @Permissions([Role.ADMIN])
  @UseGuards(PermissionsGuard)
  async updateAiConfig(
    @Body() aiConfig: OrgAiConfigDto,
    @GetUserInfo() user: SessionUser
  ) {
    try {
      return await this.userService.updateAiConfig(aiConfig, user.organization_id);
    } catch (error) {
      throw new BadRequestException('Bad request');
    }
  }

  @Get('org/attributes/ai')
  @Permissions([Role.ADMIN])
  @UseGuards(PermissionsGuard)
  async findAiConfig(@GetUserInfo() user: SessionUser) {
    return this.userService.findAiConfig(user.organization_id);
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
