import { Injectable } from '@nestjs/common';

import { DbService } from '@app/db';
import { Prisma } from 'generated/prisma/client';
import {
  CreateScheduleDto,
  ICreateScheduleAction,
  SchedulePageMetaDto,
  SchedulePageOptionsDto,
  UpdateScheduleDto,
} from '@app/models';

@Injectable()
export class ScheduleService {
  selectSchedule: Prisma.ScheduleSelect = {
    id: true,
    name: true,
    active: true,
    date: true,
    frequency: true,
    days: true,
    channel: true,
    home_id: true,
    user_id: true,
    created_at: true,
    updated_at: true,
  };

  constructor(private dbService: DbService) {}

  private sanitizeActions(actions?: ICreateScheduleAction[]) {
    return (
      actions?.map((action) => ({
        ...action,
        device_id:
          action.device_id === '' || action.device_id === undefined
            ? null
            : action.device_id,
      })) ?? []
    );
  }

  async createSchedule(createScheduleDto: CreateScheduleDto, user_id: string) {
    const { actions, home_id, date, ...scheduleData } = createScheduleDto;
    const sanitizedActions = this.sanitizeActions(actions);

    return await this.dbService.schedule.create({
      data: {
        ...scheduleData,
        date: date ? new Date(date) : null,
        home: { connect: { id: home_id } },
        user: { connect: { id: user_id } },
        actions: {
          createMany: {
            data: sanitizedActions.map((a) => ({
              attribute: a.attribute,
              data: a.data as Prisma.InputJsonValue,
              device_id: a.device_id ?? null,
            })),
          },
        },
      },
      select: this.selectSchedule,
    });
  }

  async updateSchedule(id: string, updateScheduleDto: UpdateScheduleDto) {
    const { actions, home_id, date, ...scheduleData } = updateScheduleDto;
    const sanitizedActions = this.sanitizeActions(actions);

    const existingActions = sanitizedActions.filter(
      (a) => a?.id !== undefined,
    );
    const newActions = sanitizedActions.filter((a) => a.id === undefined);

    return await this.dbService.schedule.update({
      where: { id },
      data: {
        ...scheduleData,
        ...(date !== undefined ? { date: date ? new Date(date) : null } : {}),
        ...(home_id ? { home: { connect: { id: home_id } } } : {}),
        actions: {
          deleteMany: {
            id: { notIn: existingActions.map((a) => a.id!) },
          },
          updateMany: existingActions.map((a) => ({
            where: { id: a.id },
            data: {
              attribute: a.attribute,
              data: a.data as Prisma.InputJsonValue,
              device_id: a.device_id ?? null,
            },
          })),
          createMany: {
            data: newActions.map((a) => ({
              attribute: a.attribute,
              data: a.data as Prisma.InputJsonValue,
              device_id: a.device_id ?? null,
            })),
          },
        },
      },
      select: this.selectSchedule,
    });
  }

  async findAllByCurrentUser(user_id: string) {
    return await this.dbService.schedule.findMany({
      select: { ...this.selectSchedule, _count: true },
      where: { user_id },
    });
  }

  async findAll(optionsDto: SchedulePageOptionsDto, user_id: string) {
    const { search, take, page, orderBy, sortOrder } = optionsDto;
    const skip = (page - 1) * take;

    const where: Prisma.ScheduleWhereInput = search
      ? { OR: [{ name: { contains: search, mode: 'insensitive' } }] }
      : {};
    where.user_id = user_id;

    const [itemCount, schedules] = await this.dbService.$transaction([
      this.dbService.schedule.count({ where }),
      this.dbService.schedule.findMany({
        skip,
        take,
        select: {
          ...this.selectSchedule,
          home: { select: { name: true } },
          _count: true,
        },
        where,
        orderBy: orderBy ? { [orderBy]: sortOrder } : undefined,
      }),
    ]);

    const meta = new SchedulePageMetaDto({ itemCount, pageOptions: optionsDto });
    return { data: schedules, meta };
  }

  async getScheduleById(id: string, user_id: string) {
    return await this.dbService.schedule.findUnique({
      where: { id, user_id },
      select: {
        id: true,
        name: true,
        active: true,
        date: true,
        frequency: true,
        days: true,
        channel: true,
        user_id: true,
        user: {
          select: {
            id: true,
            organization_id: true,
            phone: true,
            name: true,
          },
        },
        actions: {
          select: {
            id: true,
            device_id: true,
            attribute: true,
            data: true,
          },
        },
        home_id: true,
        home: { select: { name: true } },
        created_at: true,
        updated_at: true,
      },
    });
  }

  async delete(id: string, user_id: string) {
    await this.dbService.schedule.delete({ where: { id, user_id } });
    return { ok: true };
  }

  async toggle(id: string, scheduleDTO: { active: boolean }, user_id: string) {
    return await this.dbService.schedule.update({
      where: { id, user_id },
      data: scheduleDTO,
      select: { ...this.selectSchedule },
    });
  }
}
