/* eslint-disable @typescript-eslint/no-unused-vars */
import { Injectable, InternalServerErrorException } from '@nestjs/common';

import { DbService } from '@app/db';
import { Prisma } from 'generated/prisma/client';
import { CreateRuleDto, ICreateCondition, ICreateResult, RulePageMetaDto, RulePageOptionsDto, UpdateRuleDto } from '@app/models';

@Injectable()
export class RuleService {
  selectRules: Prisma.RuleSelect = {
    id: true,
    name: true,
    description: true,
    active: true,
    all: true,
    interval: true,
    type: true,
    home_id: true,
    timestamp: true,
    updated_at: true
  };

  constructor(
    private dbService: DbService,
    // private readonly cacheService: CacheService,
    // private readonly natsClient: NatsClientService,
  ) { }


  async createRule(createRuleDto: CreateRuleDto, user_id: string) {
    const { conditions, results, home_id, ...ruleData } = createRuleDto;

    try {
      return await this.dbService.rule.create({
        data: {
          ...ruleData,
          home: {
            connect: { id: home_id },
          },
          user: {
            connect: { id: user_id },
          },
          conditions: {
            createMany: {
              data: conditions,
            },
          },
          results: {
            createMany: {
              data: results,
            },
          },
        },
        select: this.selectRules,
      });
    } catch (error) {
      console.error('Error creating rule: ', error);
    }
  }

  async updateRule(id: string, updateRuleDto: UpdateRuleDto) {
    const { conditions, results, home_id, ...ruleData } = updateRuleDto;
    const filteredConditions: ICreateCondition[] = conditions?.filter(
      (action) => action?.id !== undefined,
    ) || [];
    const newConditions = conditions?.filter(
      (action) => action.id === undefined,
    ) || [];
    const filteredResults: ICreateResult[] = results?.filter((action) => action.id !== undefined) || [];
    const newResults = results?.filter((action) => action.id === undefined) || [];
    return await this.dbService.rule.update({
      where: { id },
      data: {
        ...ruleData,
        home: {
          connect: { id: home_id },
        },
        conditions: {
          deleteMany: {
            id: {
              notIn: filteredConditions.map((action) => action.id!),
            },
          },
          updateMany: filteredConditions.map((action) => ({
            where: { id: action.id },
            data: action,
          })),
          createMany: {
            data: newConditions,
          },
        },
        results: {
          deleteMany: {
            id: {
              notIn: filteredResults.map((action) => action.id!),
            },
          },
          updateMany: filteredResults.map((action) => ({
            where: { id: action.id },
            data: action,
          })),
          createMany: {
            data: newResults,
          },
        },
      },
      select: this.selectRules,
    });
  }

  async findAllByCurrentUser(user_id: string) {
    const rules = await this.dbService.rule.findMany({
      select: {
        ...this.selectRules,
        _count: true,
      },
      where: {
        user_id,
      },
    });
    return rules;
  }

  async findAll(optionsDto: RulePageOptionsDto, user_id: string) {
    const { search, take, page, orderBy, sortOrder } = optionsDto;
    const skip = (page - 1) * take;

    let where: Prisma.RuleWhereInput = search ? {
      OR: [
        { name: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ],
    } : {};
    where.user_id = user_id;

    const [itemCount, rules] = await this.dbService.$transaction([
      this.dbService.rule.count({ where }),
      this.dbService.rule.findMany({
        skip,
        take,
        select: {
          ...this.selectRules,
          home: {
            select: {
              name: true,
            },
          },
          _count: true,
        },
        where,
        orderBy: orderBy
          ? { [orderBy]: sortOrder }
          : undefined,
      }),
    ]);

    const rulePaginatedMeta = new RulePageMetaDto({
      itemCount,
      pageOptions: optionsDto,
    });
    return { data: rules, meta: rulePaginatedMeta };
  }

  async getRuleById(id: string, user_id: string) {
    return await this.dbService.rule.findUnique({
      where: {
        id,
        user_id,
      },
      select: {
        id: true,
        name: true,
        description: true,
        active: true,
        all: true,
        type: true,
        user_id: true,
        user: {
          select: {
            id: true,
            organization_id: true,
            phone: true,
            name: true,
          },
        },
        interval: true,
        timestamp: true,
        conditions: {
          select: {
            id: true,
            device_id: true,
            attribute: true,
            operation: true,
            data: true,
          },
        },
        results: {
          select: {
            id: true,
            device_id: true,
            event: true,
            attribute: true,
            data: true,
            type: true,
            channel: true,
            resend_after: true,
          },
        },
        home_id: true,
        home: {
          select: {
            name: true,
          },
        },
        created_at: true,
      }
    });
  }

  async delete(id: string, user_id: string) {
    try {
      await this.dbService.rule.delete({
        where: { id, user_id },
      });
      return { ok: true };
    } catch (error) {
      throw new Error(error);
    }
  }

  async toggle(id: string, ruleDTO: { active: boolean }, user_id: string) {
    try {
      const rule = await this.dbService.rule.update({
        where: { id, user_id },
        data: ruleDTO,
        select: {
          ...this.selectRules,
        },
      });
      return rule;
    } catch (error) {
      throw new Error(error);
    }
  }
}
