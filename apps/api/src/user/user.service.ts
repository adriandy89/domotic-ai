/* eslint-disable @typescript-eslint/no-unused-vars */
import { Inject, Injectable } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import {
  ClientProxyRMQ,
  CreateUserDto,
  IUser,
  LinksIdsDto,
  PrismaService,
  RabbitMQ,
  RulesEngineMsg,
  SchedulesEngineMsg,
  UpdateUserAttributesDto,
  UpdateUserDto,
  UpdateUserFmcTokenDto,
  UserPageMetaDto,
  UserPageOptionsDto,
} from '@app/shared';
import { Prisma } from '@prisma/client';
import { RedisClientType } from '@redis/client';

@Injectable()
export class UserService {
  readonly prismaUserSelect: Prisma.UserSelect = {
    id: true,
    username: true,
    phone: true,
    name: true,
    attributes: true,
    isActive: true,
    organizationId: true,
    updatedAt: true,
    createdAt: true,
    role: true,
    expirationTime: true,
    channels: true,
  };
  private clientProxyRules = this.clientProxy.clientProxyRMQ(
    RabbitMQ.RulesEngine,
  );
  private clientProxySchedules = this.clientProxy.clientProxyRMQ(
    RabbitMQ.Schedules,
  );

  constructor(
    private prismaService: PrismaService,
    @Inject('REDIS_CLIENT') private readonly redisClient: RedisClientType,
    private readonly clientProxy: ClientProxyRMQ,
  ) {}

  async verifyOrganizationUsersAccess(userHomeIds: number[], meta: IUser) {
    const users = await this.prismaService.user.findMany({
      where: {
        id: {
          in: userHomeIds,
        },
        organizationId: meta.organizationId,
      },
      select: { id: true },
    });
    if (users.length !== userHomeIds.length) {
      throw new Error('User not found');
    }
    return { ok: true };
  }

  async verifyOrganizationHomesAccess(homeIds: number[], meta: IUser) {
    const users = await this.prismaService.home.findMany({
      where: {
        id: {
          in: homeIds,
        },
        organizationId: meta.organizationId,
      },
      select: { id: true },
    });
    if (users.length !== homeIds.length) {
      throw new Error('User not found');
    }
    return { ok: true };
  }

  async countTotalOrganizationUsers(meta: IUser) {
    const count = await this.prismaService.user.count({
      where: { organizationId: meta.organizationId },
    });
    return { organizationTotalUsers: count ?? 0 };
  }

  async statisticsOrgUsers(organizationId: number) {
    const [countEnabledUsers, countDisabledUsers] = await Promise.all([
      this.prismaService.user.count({
        where: { organizationId, isActive: true },
      }),
      this.prismaService.user.count({
        where: { organizationId, isActive: false },
      }),
    ]);
    const totalUsers = (countEnabledUsers ?? 0) + (countDisabledUsers ?? 0);
    return {
      totalUsers,
      enabledUsers: countEnabledUsers ?? 0,
      disabledUsers: countDisabledUsers ?? 0,
    };
  }

  async validateUser(username: string, password: string) {
    const user = await this.prismaService.user.findUnique({
      where: { username },
      select: { ...this.prismaUserSelect, password: true },
    });
    if (!user) return null;

    const isValidPassword = await this.checkPassword(password, user.password);

    if (user && isValidPassword) {
      const { password, ...result } = user;
      return result;
    }

    return null;
  }

  async checkPassword(password: string, passwordDB: string): Promise<boolean> {
    return await bcrypt.compare(password, passwordDB);
  }

  async hashPassword(password: string): Promise<string> {
    const salt = await bcrypt.genSalt(10);
    return await bcrypt.hash(password, salt);
  }

  async create(userDTO: CreateUserDto, meta: IUser) {
    const organizationId = meta?.organizationId;
    if (!organizationId) throw new Error('Organization not found');
    const hash = await this.hashPassword(userDTO.password);
    const { password, ...newUser } = await this.prismaService.user.create({
      data: {
        ...userDTO,
        password: hash,
        organizationId,
      },
    });
    // ! Add to cache
    const redisKeyAllUsersIds = `h-users-ids`;
    await this.redisClient.sAdd(redisKeyAllUsersIds, newUser.id.toString());
    return { user: newUser };
  }

  async findAll(optionsDto: UserPageOptionsDto, meta: IUser) {
    const { search, take, page, orderBy, sortOrder } = optionsDto;
    const skip = (page - 1) * take;

    let where: Prisma.UserWhereInput = search && {
      OR: [
        { username: { contains: search, mode: 'insensitive' } },
        { name: { contains: search, mode: 'insensitive' } },
      ],
    };
    if (meta.organizationId) {
      where = {
        ...where,
        AND: meta.organizationId && {
          organizationId: meta.organizationId,
        },
      };
    }

    const [itemCount, users] = await this.prismaService.$transaction([
      this.prismaService.user.count({ where }),
      this.prismaService.user.findMany({
        skip,
        take,
        select: this.prismaUserSelect,
        where,
        orderBy:
          orderBy === 'id' ||
          orderBy === 'name' ||
          orderBy === 'username' ||
          orderBy === 'phone' ||
          orderBy === 'isActive' ||
          orderBy === 'createdAt' ||
          orderBy === 'updatedAt' ||
          orderBy === 'expirationTime' ||
          orderBy === 'role' ||
          orderBy === 'organizationId'
            ? { [orderBy]: <Prisma.SortOrder>sortOrder }
            : undefined,
      }),
    ]);

    const userPaginatedMeta = new UserPageMetaDto({
      itemCount,
      pageOptions: optionsDto,
    });
    return { data: users, meta: userPaginatedMeta };
  }

  async findOne(id: number, meta: IUser) {
    return await this.prismaService.user.findUnique({
      where: { id, organizationId: meta.organizationId },
      select: this.prismaUserSelect,
    });
  }

  // only update attributes from home app by logged user
  async updateAttributes(userDTO: UpdateUserAttributesDto, meta: IUser) {
    const organizationId = meta?.organizationId;
    if (!organizationId) throw new Error('Organization not found');
    try {
      const updated = await this.prismaService.user.update({
        data: { attributes: userDTO.attributes },
        select: this.prismaUserSelect,
        where: { id: meta.id, organizationId },
      });
      // update user attributes in cache
      const redisKey = `h-user-id:${meta.id}:attributes`;
      await this.redisClient.set(redisKey, JSON.stringify(updated.attributes));
      return { ok: true, data: updated };
    } catch (error) {
      if (error.code === 'P2025') throw new Error('not found');
      throw new Error(error);
    }
  }

  async updateFmcTokens(fmcDTO: UpdateUserFmcTokenDto, meta: IUser) {
    const organizationId = meta?.organizationId;
    if (!organizationId) throw new Error('Organization not found');
    try {
      const redisKey = `h-user-id:${meta.id}:fmc-tokens`;
      const fmcTokens = (await this.redisClient.sMembers(redisKey)) ?? [];

      const updated = await this.prismaService.user.update({
        data: { fmcTokens: [...fmcTokens, fmcDTO.fmcToken] },
        select: this.prismaUserSelect,
        where: { id: meta.id, organizationId },
      });
      // ! Refresh user fmc tokens form redis
      await this.redisClient.sAdd(redisKey, fmcDTO.fmcToken);
      return { ok: true, data: updated };
    } catch (error) {
      if (error.code === 'P2025') throw new Error('not found');
      throw new Error(error);
    }
  }

  async deleteFmcToken(fmcDTO: UpdateUserFmcTokenDto, meta: IUser) {
    const organizationId = meta?.organizationId;
    if (!organizationId) throw new Error('Organization not found');
    try {
      const redisKey = `h-user-id:${meta.id}:fmc-tokens`;
      const fmcTokens = (await this.redisClient.sMembers(redisKey)) ?? [];
      const updated = await this.prismaService.user.update({
        data: {
          fmcTokens: fmcTokens.filter((t) => t !== fmcDTO.fmcToken) ?? [],
        },
        select: this.prismaUserSelect,
        where: { id: meta.id, organizationId },
      });
      // ! Refresh user fmc tokens form redis
      await this.redisClient.sRem(redisKey, fmcDTO.fmcToken);
      return { ok: true, data: updated };
    } catch (error) {
      if (error.code === 'P2025') throw new Error('not found');
      throw new Error(error);
    }
  }

  async update(id: number, userDTO: UpdateUserDto, meta: IUser) {
    const organizationId = meta?.organizationId;
    if (!organizationId) throw new Error('Organization not found');
    try {
      const cleanUpdateUser = this.excludeUndefinedFromDto(userDTO); // exclude possible undefined value to avoid conflict prisma
      const { ...cleanData } = cleanUpdateUser;

      const data: Prisma.UserUpdateInput = {
        ...cleanData,
        organizationId,
      };
      const previous = await this.prismaService.user.findUnique({
        where: { id },
        select: {
          isActive: true,
          id: true,
          homes: { select: { homeId: true } },
        },
      });
      const updated = await this.prismaService.user.update({
        data,
        select: this.prismaUserSelect,
        where: { id, organizationId },
      });
      // ! Remove from cache
      if (previous.isActive && !updated.isActive) {
        previous.homes?.map(async (h) => {
          if (h?.homeId) {
            const redisKey = `h-user-id:${id}:homes-id`;
            await this.redisClient.sRem(redisKey, h.homeId.toString());
          }
        });
      }
      // ! Add to cache
      if (!previous.isActive && updated.isActive) {
        previous.homes?.map(async (h) => {
          if (h?.homeId) {
            const redisKey = `h-user-id:${id}:homes-id`;
            await this.redisClient.sAdd(redisKey, h.homeId.toString());
          }
        });
      }
      this.refreshUserRulesSchedules([id]);
      return { ok: true, data: updated };
    } catch (error) {
      if (error.code === 'P2025') throw new Error('not found');
      throw new Error(error);
    }
  }

  async delete(id: number, meta: IUser) {
    const organizationId = meta?.organizationId;
    if (!organizationId) throw new Error('Organization not found');
    try {
      const previous = await this.prismaService.user.findUnique({
        where: { id },
        select: {
          isActive: true,
          id: true,
          homes: { select: { homeId: true } },
        },
      });
      const deleted = await this.prismaService.user.delete({
        where: { id, organizationId },
        select: this.prismaUserSelect,
      });
      // ! Remove from cache
      if (previous.isActive) {
        previous.homes?.map(async (h) => {
          if (h?.homeId) {
            const redisKey = `h-user-id:${id}:homes-id`;
            await this.redisClient.sRem(redisKey, h.homeId.toString());
          }
        });
      }
      const redisKeyAllUsersIds = `h-users-ids`;
      await this.redisClient.sRem(redisKeyAllUsersIds, id.toString());
      this.refreshUserRulesSchedules([id]);
      return { ok: true, data: deleted };
    } catch (error) {
      throw new Error(error);
    }
  }

  async deleteMany(ids: number[], meta: IUser) {
    try {
      const verifyPermissions = await this.verifyOrganizationUsersAccess(
        ids,
        meta,
      );
      if (!verifyPermissions.ok) {
        throw new Error('Access denied to delete request users list');
      }
      const toDeletedFromCache = await this.prismaService.user.findMany({
        where: {
          id: {
            in: ids,
          },
          organizationId: meta.organizationId,
        },
        select: {
          isActive: true,
          id: true,
          homes: { select: { homeId: true } },
        },
      });
      // ! Delete from cache
      await Promise.all(
        toDeletedFromCache.map(async (user) => {
          if (user.isActive) {
            user.homes?.map(async (h) => {
              if (h?.homeId) {
                const redisKey = `h-user-id:${user.id}:homes-id`;
                await this.redisClient.sRem(redisKey, h.homeId.toString());
              }
            });
          }
          const redisKeyAllUsersIds = `h-users-ids`;
          await this.redisClient.sRem(redisKeyAllUsersIds, user.id.toString());
        }),
      );
      await this.prismaService.user.deleteMany({
        where: {
          id: {
            in: ids,
          },
          organizationId: meta.organizationId,
        },
      });
      this.refreshUserRulesSchedules(ids);
      return { ok: true };
    } catch (error) {
      throw new Error(error);
    }
  }

  async disableMany(ids: number[], meta: IUser) {
    try {
      const verifyPermissions = await this.verifyOrganizationUsersAccess(
        ids,
        meta,
      );
      if (!verifyPermissions.ok) {
        throw new Error('Access denied to delete request users list');
      }
      const toDeletedFromCache = await this.prismaService.user.findMany({
        where: {
          id: {
            in: ids,
          },
          organizationId: meta.organizationId,
        },
        select: {
          isActive: true,
          id: true,
          homes: { select: { homeId: true } },
        },
      });
      // ! Delete from cache
      await Promise.all(
        toDeletedFromCache.map(async (user) => {
          if (user.isActive) {
            user.homes?.map(async (h) => {
              if (h?.homeId) {
                const redisKey = `h-user-id:${user.id}:homes-id`;
                await this.redisClient.sRem(redisKey, h.homeId.toString());
              }
            });
          }
        }),
      );
      await this.prismaService.user.updateMany({
        where: {
          id: {
            in: ids,
          },
          organizationId: meta.organizationId,
        },
        data: {
          isActive: false,
        },
      });
      this.refreshUserRulesSchedules(ids);
      return { ok: true };
    } catch (error) {
      throw new Error(error);
    }
  }

  async enableMany(ids: number[], meta: IUser) {
    try {
      const verifyPermissions = await this.verifyOrganizationUsersAccess(
        ids,
        meta,
      );
      if (!verifyPermissions.ok) {
        throw new Error('Access denied to delete request users list');
      }
      const toAddToCache = await this.prismaService.user.findMany({
        where: {
          id: {
            in: ids,
          },
          organizationId: meta.organizationId,
        },
        select: {
          isActive: true,
          id: true,
          homes: { select: { homeId: true } },
        },
      });
      // ! Add to cache
      await Promise.all(
        toAddToCache.map(async (user) => {
          if (!user.isActive) {
            user.homes?.map(async (h) => {
              if (h?.homeId) {
                const redisKey = `h-user-id:${user.id}:homes-id`;
                await this.redisClient.sAdd(redisKey, h.homeId.toString());
              }
            });
          }
        }),
      );
      await this.prismaService.user.updateMany({
        where: {
          id: {
            in: ids,
          },
          organizationId: meta.organizationId,
        },
        data: {
          isActive: true,
        },
      });
      this.refreshUserRulesSchedules(ids);
      return { ok: true };
    } catch (error) {
      throw new Error(error);
    }
  }

  async findByUsername(username: string) {
    return await this.prismaService.user.findUnique({
      where: { username },
      select: this.prismaUserSelect,
    });
  }

  private excludeUndefinedFromDto<Dto>(inputDto: Dto): Dto {
    const dto = { ...inputDto };
    for (const key in dto) if (dto[key] === undefined) delete dto[key];
    return dto;
  }

  // ! User - Home
  // findAllHomesLinks
  async findAllHomesLinks(meta: IUser, userId: number) {
    const homes = await this.prismaService.home.findMany({
      where: { organizationId: meta.organizationId },
      select: {
        id: true,
        name: true,
        uniqueId: true,
        disabled: true,
      },
    });
    const userHomes = await this.prismaService.userHome.findMany({
      where: { userId },
      select: { homeId: true },
    });
    const linkedHomeIds = new Set(userHomes.map((ud) => ud.homeId));
    const homesWithLinks = homes.map((home) => ({
      ...home,
      linked: linkedHomeIds.has(home.id),
    }));
    return { homes: homesWithLinks ?? [] };
  }

  async linksHomesUser(data: LinksIdsDto, meta: IUser) {
    try {
      const verifyPermissions = await this.verifyOrganizationHomesAccess(
        [...data.toDelete, ...data.toUpdate],
        meta,
      );
      if (!verifyPermissions.ok) {
        throw new Error('Access denied to all request homes');
      }
      await Promise.all(
        data.ids.map((userId) => {
          return this.prismaService.userHome.createMany({
            data: data.toUpdate.map((homeId) => ({
              homeId,
              userId,
            })),
          });
        }),
      );
      // ! Add to cache
      if (data.toUpdate.length > 0) {
        const toAddToCache = await this.prismaService.home.findMany({
          where: {
            id: {
              in: data.toUpdate,
            },
            disabled: false,
            organizationId: meta.organizationId,
          },
          select: {
            id: true,
            users: {
              select: {
                user: {
                  select: {
                    id: true,
                    isActive: true,
                  },
                },
              },
            },
          },
        });
        // ! Add users to cache homes
        await Promise.all(
          toAddToCache.map(async (home) => {
            home.users?.map(async (user) => {
              if (user.user?.isActive) {
                const redisKey = `h-user-id:${user.user.id}:homes-id`;
                await this.redisClient.sAdd(redisKey, home.id.toString());
              }
            });
          }),
        );
      }
      // ! Delete from cache
      if (data.toDelete.length > 0) {
        const toDeleteFromCache = await this.prismaService.home.findMany({
          where: {
            id: {
              in: data.toDelete,
            },
            disabled: false,
            organizationId: meta.organizationId,
          },
          select: {
            id: true,
            users: {
              select: {
                user: {
                  select: {
                    id: true,
                    isActive: true,
                  },
                },
              },
            },
          },
        });
        // ! Delete users from cache homes
        await Promise.all(
          toDeleteFromCache.map(async (home) => {
            home.users?.map(async (user) => {
              if (user.user?.isActive) {
                const redisKey = `h-user-id:${user.user.id}:homes-id`;
                await this.redisClient.sRem(redisKey, home.id.toString());
              }
            });
          }),
        );
      }
      await Promise.all(
        data.ids.map((userId) => {
          return this.prismaService.userHome.deleteMany({
            where: {
              homeId: {
                in: data.toDelete,
              },
              userId,
            },
          });
        }),
      );
      this.refreshUserRulesSchedules(data.ids);
      return { ok: true };
    } catch (error) {
      throw new Error(error);
    }
  }

  refreshUserRulesSchedules(userIds: number[]) {
    userIds.map((id) => {
      this.clientProxyRules.emit(RulesEngineMsg.REFRESH_USER_RULES, {
        meta: { id },
      });
      this.clientProxySchedules.emit(
        SchedulesEngineMsg.REFRESH_USER_SCHEDULES,
        {
          meta: { id },
        },
      );
    });
  }
}
