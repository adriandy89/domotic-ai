import {
  CreateScheduleDto,
  ScheduleApiPaginatedResponse,
  ToggleScheduleDto,
  UpdateScheduleDto,
} from '@app/models';
import { ScheduleService } from './schedule.service';
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
import type { SchedulePageOptionsDto, SessionUser } from '@app/models';
import { ApiBody } from '@nestjs/swagger';

@Controller('schedules')
@UseGuards(AuthenticatedGuard)
export class ScheduleController {
  constructor(private readonly scheduleService: ScheduleService) {}

  @Post()
  @ApiBody({
    type: CreateScheduleDto,
    examples: {
      example1: {
        value: {
          name: 'Turn off bedroom lights at night',
          active: true,
          date: '2026-05-04T23:00:00.000Z',
          frequency: 'DAILY',
          days: [],
          channel: ['PUSH'],
          actions: [
            {
              device_id: 'uuid',
              attribute: 'state',
              data: { value: 'OFF' },
            },
          ],
          home_id: 'uuid',
        } satisfies CreateScheduleDto,
      },
    },
  })
  @Permissions([Role.MANAGER])
  @UseGuards(PermissionsGuard)
  async create(
    @Body() scheduleDTO: CreateScheduleDto,
    @GetUserInfo() user: SessionUser,
  ) {
    try {
      return await this.scheduleService.createSchedule(scheduleDTO, user.id);
    } catch (error: any) {
      console.log(error);
      throw new BadRequestException('Bad request');
    }
  }

  @Get()
  @Permissions([Role.USER, Role.MANAGER])
  @UseGuards(PermissionsGuard)
  @ScheduleApiPaginatedResponse()
  async findAll(
    @Query() optionsDto: SchedulePageOptionsDto,
    @GetUserInfo() user: SessionUser,
  ) {
    return await this.scheduleService.findAll(optionsDto, user.id);
  }

  @Get('all/user')
  @Permissions([Role.MANAGER])
  @UseGuards(PermissionsGuard)
  async findAllByCurrentUser(@GetUserInfo() user: SessionUser) {
    return this.scheduleService.findAllByCurrentUser(user.id);
  }

  @Get(':id')
  @Permissions([Role.MANAGER])
  @UseGuards(PermissionsGuard)
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @GetUserInfo() user: SessionUser,
  ) {
    const found = await this.scheduleService.getScheduleById(id, user.id);
    if (!found) {
      throw new NotFoundException('Schedule not found');
    }
    return found;
  }

  @Put(':id')
  @Permissions([Role.MANAGER])
  @UseGuards(PermissionsGuard)
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() scheduleDTO: UpdateScheduleDto,
    @GetUserInfo() user: SessionUser,
  ) {
    try {
      const existing = await this.scheduleService.getScheduleById(id, user.id);
      if (!existing) {
        throw new NotFoundException('Schedule not found');
      }
      return await this.scheduleService.updateSchedule(id, scheduleDTO);
    } catch (error: any) {
      console.log(error);
      if (error instanceof NotFoundException) throw error;
      throw new BadRequestException('Bad request');
    }
  }

  @Put('toggle/:id')
  @Permissions([Role.MANAGER])
  @UseGuards(PermissionsGuard)
  async toggle(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() scheduleDTO: ToggleScheduleDto,
    @GetUserInfo() user: SessionUser,
  ) {
    try {
      return await this.scheduleService.toggle(id, scheduleDTO, user.id);
    } catch (error: any) {
      console.log(error);
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
      return await this.scheduleService.delete(id, user.id);
    } catch (error: any) {
      console.log(error);
      throw new BadRequestException('Bad request');
    }
  }
}
