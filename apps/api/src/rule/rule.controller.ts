import {
  CreateRuleDto,
  UpdateRuleDto,
  ToggleRuleDto,
  RuleApiPaginatedResponse,
} from '@app/models';
import { RuleService } from './rule.service';
import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  NotFoundException,
  BadRequestException,
  ParseUUIDPipe,
  Query,
} from '@nestjs/common';
import { AuthenticatedGuard, PermissionsGuard } from '../auth/guards';
import { GetUserInfo, Permissions } from '../auth/decorators';
import { Role } from 'generated/prisma/enums';
import type { RulePageOptionsDto, SessionUser } from '@app/models';
import { ApiBody } from '@nestjs/swagger';

@Controller('rules')
@UseGuards(AuthenticatedGuard)
export class RuleController {
  constructor(private readonly ruleService: RuleService) { }

  @Post()
  @ApiBody({
    type: CreateRuleDto,
    examples: {
      example1: {
        value: {
          name: 'Turn off child light',
          description: 'description',
          active: true,
          all: true,
          interval: 60,
          type: 'RECURRENT',
          home_id: 'uuid',
          conditions: [
            {
              device_id: 'uuid',
              attribute: 'child_lock',
              operation: 'EQ',
              data: { value: 'UNLOCK' },
            },
          ],
          results: [
            {
              device_id: 'uuid',
              event: 'event lock device id test',
              type: 'COMMAND',
              attribute: 'child_lock',
              data: { value: 'LOCK' },
              channel: ['EMAIL'],
              resend_after: 60,
            },
          ],
        } satisfies CreateRuleDto,
      },
    },
  })
  @Permissions([Role.MANAGER])
  @UseGuards(PermissionsGuard)
  async create(@Body() ruleDTO: CreateRuleDto, @GetUserInfo() user: SessionUser) {
    try {
      return await this.ruleService.createRule(ruleDTO, user.id);
    } catch (error) {
      console.log(error);
      throw new BadRequestException('Bad request');
    }
  }

  @Get()
  @Permissions([Role.USER, Role.MANAGER])
  @UseGuards(PermissionsGuard)
  @RuleApiPaginatedResponse()
  async findAll(
    @Query() optionsDto: RulePageOptionsDto,
    @GetUserInfo() user: SessionUser,
  ) {
    return await this.ruleService.findAll(optionsDto, user.id);
  }

  @Get('all/user')
  @Permissions([Role.MANAGER])
  @UseGuards(PermissionsGuard)
  async findAllByCurrentUser(@GetUserInfo() user: SessionUser) {
    return this.ruleService.findAllByCurrentUser(user.id);
  }

  @Get(':id')
  @Permissions([Role.MANAGER])
  @UseGuards(PermissionsGuard)
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @GetUserInfo() user: SessionUser,
  ) {
    const found = await this.ruleService.getRuleById(id, user.id);
    if (!found) {
      throw new NotFoundException('Rule not found');
    }
    return found;
  }

  @Put(':id')
  @Permissions([Role.MANAGER])
  @UseGuards(PermissionsGuard)
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() ruleDTO: UpdateRuleDto,
    @GetUserInfo() user: SessionUser,
  ) {
    try {
      // Verify user owns the rule
      const existing = await this.ruleService.getRuleById(id, user.id);
      if (!existing) {
        throw new NotFoundException('Rule not found');
      }
      return await this.ruleService.updateRule(id, ruleDTO);
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      throw new BadRequestException('Bad request');
    }
  }

  @Put('toggle/:id')
  @Permissions([Role.MANAGER])
  @UseGuards(PermissionsGuard)
  async toggle(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() ruleDTO: ToggleRuleDto,
    @GetUserInfo() user: SessionUser,
  ) {
    try {
      return await this.ruleService.toggle(id, ruleDTO, user.id);
    } catch (error) {
      throw new BadRequestException('Bad request');
    }
  }

  @Delete(':id')
  @Permissions([Role.MANAGER])
  @UseGuards(PermissionsGuard)
  async delete(
    @Param('id', ParseUUIDPipe) id: string,
    @GetUserInfo() user: SessionUser,
  ) {
    try {
      return await this.ruleService.delete(id, user.id);
    } catch (error) {
      throw new BadRequestException('Bad request');
    }
  }
}
