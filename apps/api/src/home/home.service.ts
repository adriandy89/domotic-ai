import { Inject, Injectable } from '@nestjs/common';
import {
  CreateHomeDto,
  IUser,
  UpdateHomeDto,
  HomePageMetaDto,
  HomePageOptionsDto,
} from '@app/models';
import { DbService } from '@app/db';
import type { RedisClientType } from 'redis';
import { Prisma } from 'generated/prisma/client';
import { MqttConnectionService } from './mqtt-connection.service';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class HomeService {
  readonly prismaHomesSelect: Prisma.HomeSelect = {
    id: true,
    unique_id: true,
    name: true,
    description: true,
    attributes: true,
    disabled: true,
    created_at: true,
    updated_at: true,
    last_update: true,
    icon: true,
    image: true,
    connected: true,
  };
  private clientProxyRules = this.clientProxy.clientProxyRMQ(
    RabbitMQ.RulesEngine,
  );
  private clientProxySchedules = this.clientProxy.clientProxyRMQ(
    RabbitMQ.Schedules,
  );

  constructor(
    private prismaService: DbService,
    private readonly configService: ConfigService,
    private mqttCredentialsService: MqttConnectionService,
    @Inject('REDIS_CLIENT') private readonly redisClient: RedisClientType,
    private readonly clientProxy: ClientProxyRMQ,
  ) { }

  async verifyOrganizationHomesAccess(homesIds: string[], meta: IUser) {
    const homes = await this.prismaService.home.findMany({
      where: {
        id: {
          in: homesIds,
        },
        organization_id: meta.organization_id,
      },
      select: { id: true },
    });
    if (homes.length !== homesIds.length) {
      throw new Error('Home not found');
    }
    return { ok: true };
  }

  async verifyOrganizationUsersAccess(userHomeIds: string[], meta: IUser) {
    const users = await this.prismaService.user.findMany({
      where: {
        id: {
          in: userHomeIds,
        },
        organization_id: meta.organization_id,
      },
      select: { id: true },
    });
    if (users.length !== userHomeIds.length) {
      throw new Error('User not found');
    }
    return { ok: true };
  }

  async findByUniqueId(uniqueId: string, meta: IUser) {
    return await this.prismaService.home.findUnique({
      where: { unique_id: uniqueId, organization_id: meta.organization_id },
    });
  }

  async statisticsOrgHomes(organizationId: string) {
    const [countEnabledHomes, countDisabledHomes] = await Promise.all([
      this.prismaService.home.count({
        where: { organization_id: organizationId, disabled: false },
      }),
      this.prismaService.home.count({
        where: { organization_id: organizationId, disabled: true },
      }),
    ]);
    const totalHomes = (countEnabledHomes ?? 0) + (countDisabledHomes ?? 0);
    return {
      totalHomes,
      enabledHomes: countEnabledHomes ?? 0,
      disabledHomes: countDisabledHomes ?? 0,
    };
  }

  async findAllByCurrentUser(userId: string) {
    const redisKeyHomesIds = `h-user-id:${userId}:homes-id`;
    const homesIds = await this.redisClient.sMembers(redisKeyHomesIds);
    return await this.prismaService.home.findMany({
      where: { id: { in: homesIds } },
    });
  }

  async countTotalOrganizationHomes(meta: IUser) {
    const count = await this.prismaService.home.count({
      where: { organization_id: meta.organization_id },
    });
    return { organizationTotalHomes: count ?? 0 };
  }

  async create(homeDTO: CreateHomeDto, meta: IUser) {
    const created = await this.prismaService.home.create({
      data: {
        ...homeDTO,
        connected: false,
        organization_id: meta.organization_id,
      },
      select: {
        ...this.prismaHomesSelect,
        mqtt_password: true,
        mqtt_username: true,
      },
    });
    try {
      // ? Create mqtt credentials
      const { ok, encryptedPassword, mqttId } =
        await this.mqttCredentialsService.createCredentials(created.unique_id);
      // ? Update home mqtt credentials
      if (ok) {
        const updated = await this.prismaService.home.update({
          data: {
            mqtt_password: encryptedPassword,
            mqtt_username: created.unique_id,
            mqtt_id: mqttId,
          },
          where: { id: created.id },
        });
        const decryptedPassword = decrypt(encryptedPassword);
        return {
          ok: true,
          data: { ...updated, mqtt_password: decryptedPassword },
        };
      }
    } catch (error) {
      console.log('Error: ', error);
      throw new Error(error);
    }

    return { ok: true, data: created };
  }

  getMqttConfig() {
    return {
      mqttHost: this.configService.get('MQTT_SERVER_BASE'),
      mqttPort: this.configService.get('MQTT_PORT'),
    };
  }

  async findAll(optionsDto: HomePageOptionsDto, meta: IUser) {
    const { search, take, page, orderBy, sortOrder } = optionsDto;
    const skip = (page - 1) * take;

    let where: Prisma.HomeWhereInput = search ? {
      OR: [
        { unique_id: { contains: search, mode: 'insensitive' } },
        { name: { contains: search, mode: 'insensitive' } },
      ],
    } : {};
    if (meta.organization_id) {
      where.organization_id = meta.organization_id;
    }

    const [itemCount, homes] = await this.prismaService.$transaction([
      this.prismaService.home.count({ where }),
      this.prismaService.home.findMany({
        skip,
        take,
        select: {
          ...this.prismaHomesSelect,
          mqtt_password: true,
          mqtt_username: true,
        },
        where,
        orderBy:
          orderBy === 'name' ||
            orderBy === 'uniqueId' ||
            orderBy === 'description' ||
            orderBy === 'disabled' ||
            orderBy === 'organizationId' ||
            orderBy === 'homeId' ||
            orderBy === 'icon' ||
            orderBy === 'lastUpdate' ||
            orderBy === 'createdAt' ||
            orderBy === 'updatedAt'
            ? { [orderBy === 'uniqueId' ? 'unique_id' : orderBy === 'organizationId' ? 'organization_id' : orderBy === 'homeId' ? 'home_id' : orderBy === 'lastUpdate' ? 'last_update' : orderBy === 'createdAt' ? 'created_at' : orderBy === 'updatedAt' ? 'updated_at' : orderBy]: <Prisma.SortOrder>sortOrder }
            : null,
      }),
    ]);
    const userPaginatedMeta = new HomePageMetaDto({
      itemCount,
      pageOptions: optionsDto,
    });
    // ? Change mqq password to decrypted
    homes.map((home) => {
      if (home.mqtt_password) {
        home.mqtt_password = decrypt(home.mqtt_password);
      }
    });
    return { data: homes, meta: userPaginatedMeta };
  }

  async findOne(id: string, meta: IUser) {
    const found = await this.prismaService.home.findUnique({
      where: { id, organization_id: meta.organization_id },
      select: this.prismaHomesSelect,
    });
    if (found?.mqtt_password) {
      found.mqtt_password = decrypt(found.mqtt_password);
    }
    return found;
  }

  async update(id: string, homeDTO: UpdateHomeDto | any, meta: IUser) {
    try {
      const verifyPermissions = await this.verifyOrganizationHomesAccess(
        [id],
        meta,
      );
      if (!verifyPermissions.ok) {
        throw new Error('Access denied to delete request homes list');
      }
      const cleanUpdateHome = this.excludeUndefinedFromDto(homeDTO); // exclude possible undefined value to avoid conflict prisma
      const { organizationId, ...cleanData } = cleanUpdateHome;

      const data: Prisma.HomeUpdateInput = {
        ...cleanData,
      };

      const previous = await this.prismaService.home.findUnique({
        where: { id },
        select: {
          uniqueId: true,
          disabled: true,
          id: true,
          devices: { select: { id: true, uniqueId: true } },
          users: { select: { userId: true } },
        },
      });

      const updated = await this.prismaService.home.update({
        data,
        select: this.prismaHomesSelect,
        where: { id },
      });
      // ? Update home caches devices
      const redisKeyHomeIds = `h-home-id:${previous.id}:devices-id`;
      const redisKeyHomeUniqueIdsPrev = `h-home-uniqueid:${previous.uniqueId}:devices-uniqueid`;
      const redisKeyHomeUniqueIdsUpd = `h-home-uniqueid:${updated.uniqueId}:devices-uniqueid`;
      if (previous.uniqueId !== updated.uniqueId) {
        if (!previous.disabled) {
          await this.redisClient.del(redisKeyHomeUniqueIdsPrev);
        }
        if (!updated.disabled) {
          previous.devices.map(async (d) => {
            if (d?.id) {
              await this.redisClient.sAdd(redisKeyHomeIds, d.id.toString());
              await this.redisClient.sAdd(redisKeyHomeUniqueIdsUpd, d.uniqueId);
            }
          });
        }
      } else {
        if (!previous.disabled && updated.disabled) {
          await this.redisClient.del(redisKeyHomeIds);
          await this.redisClient.del(redisKeyHomeUniqueIdsPrev);
        }
        if (previous.disabled && !updated.disabled) {
          previous.devices.map(async (d) => {
            if (d?.id) {
              await this.redisClient.sAdd(redisKeyHomeIds, d.id.toString());
              await this.redisClient.sAdd(redisKeyHomeUniqueIdsUpd, d.uniqueId);
            }
          });
        }
      }
      // ? Update home caches users
      if (!previous.disabled && updated.disabled) {
        previous.users.map(async (u) => {
          if (u?.userId) {
            const redisKey = `h-user-id:${u.userId}:homes-id`;
            await this.redisClient.sRem(redisKey, updated.id.toString());
          }
        });
      }
      if (previous.disabled && !updated.disabled) {
        previous.users.map(async (u) => {
          if (u?.userId) {
            const redisKey = `h-user-id:${u.userId}:homes-id`;
            await this.redisClient.sAdd(redisKey, updated.id.toString());
          }
        });
      }
      // ? Change mqq password to decrypted
      if (updated.mqttPassword) {
        updated.mqttPassword = decrypt(updated.mqttPassword);
      }
      return { ok: true, data: updated };
    } catch (error) {
      if (error.code === 'P2025') throw new Error('role not found');
      throw new Error(error);
    }
  }

  async delete(id: number, meta: IUser) {
    try {
      const verifyPermissions = await this.verifyOrganizationHomesAccess(
        [id],
        meta,
      );
      if (!verifyPermissions.ok) {
        throw new Error('Access denied to delete request homes list');
      }
      const deleted = await this.prismaService.home.delete({
        where: { id, organizationId: meta.organizationId },
        select: {
          ...this.prismaHomesSelect,
          mqttId: true,
          users: { select: { userId: true } },
        },
      });
      // ? Update home caches
      if (!deleted.disabled) {
        const redisKeyHomeIds = `h-home-id:${deleted.id}:devices-id`;
        const redisKeyHomeUniqueIds = `h-home-uniqueid:${deleted.uniqueId}:devices-uniqueid`;
        await this.redisClient.del(redisKeyHomeIds);
        await this.redisClient.del(redisKeyHomeUniqueIds);
        deleted.users?.map(async (u) => {
          if (u?.userId) {
            const redisKey = `h-user-id:${u.userId}:homes-id`;
            await this.redisClient.sRem(redisKey, deleted.id.toString());
          }
        });
      }
      // ! Delete mqtt credentials
      await this.mqttCredentialsService.deleteCredentials(deleted.mqttId);
      return { ok: true };
    } catch (error) {
      throw new Error(error);
    }
  }
  async deleteMany(ids: number[], meta: IUser) {
    try {
      const verifyPermissions = await this.verifyOrganizationHomesAccess(
        ids,
        meta,
      );
      if (!verifyPermissions.ok) {
        throw new Error('Access denied to delete request homes list');
      }
      const toDeletedFromCache = await this.prismaService.home.findMany({
        where: {
          id: {
            in: ids,
          },
          organizationId: meta.organizationId,
        },
        select: {
          uniqueId: true,
          disabled: true,
          id: true,
          mqttId: true,
          users: { select: { userId: true } },
        },
      });
      // ! Delete from cache
      await Promise.all(
        toDeletedFromCache.map(async (home) => {
          if (!home.disabled) {
            const redisKeyHomeIds = `h-home-id:${home.id}:devices-id`;
            const redisKeyHomeUniqueIds = `h-home-uniqueid:${home.uniqueId}:devices-uniqueid`;
            await this.redisClient.del(redisKeyHomeIds);
            await this.redisClient.del(redisKeyHomeUniqueIds);
            home.users?.map(async (u) => {
              if (u?.userId) {
                const redisKey = `h-user-id:${u.userId}:homes-id`;
                await this.redisClient.sRem(redisKey, home.id.toString());
              }
            });
          }
        }),
      );
      await this.prismaService.home.deleteMany({
        where: {
          id: {
            in: ids,
          },
          organizationId: meta.organizationId,
        },
      });
      // ! Delete mqtt credentials from
      await Promise.all(
        toDeletedFromCache.map(async (home) => {
          await this.mqttCredentialsService.deleteCredentials(home.mqttId);
        }),
      );
      return { ok: true };
    } catch (error) {
      throw new Error(error);
    }
  }

  async disableMany(ids: number[], meta: IUser) {
    try {
      const verifyPermissions = await this.verifyOrganizationHomesAccess(
        ids,
        meta,
      );
      if (!verifyPermissions.ok) {
        throw new Error('Access denied to delete request homes list');
      }
      const toDeletedFromCache = await this.prismaService.home.findMany({
        where: {
          id: {
            in: ids,
          },
          organizationId: meta.organizationId,
        },
        select: {
          uniqueId: true,
          disabled: true,
          id: true,
          users: { select: { userId: true } },
        },
      });
      // ! Delete from cache
      await Promise.all(
        toDeletedFromCache.map(async (home) => {
          if (!home.disabled) {
            const redisKeyHomeIds = `h-home-id:${home.id}:devices-id`;
            const redisKeyHomeUniqueIds = `h-home-uniqueid:${home.uniqueId}:devices-uniqueid`;
            await this.redisClient.del(redisKeyHomeIds);
            await this.redisClient.del(redisKeyHomeUniqueIds);
            home.users?.map(async (u) => {
              if (u?.userId) {
                const redisKey = `h-user-id:${u.userId}:homes-id`;
                await this.redisClient.sRem(redisKey, home.id.toString());
              }
            });
          }
        }),
      );
      await this.prismaService.home.updateMany({
        where: {
          id: {
            in: ids,
          },
          organizationId: meta.organizationId,
        },
        data: {
          disabled: true,
        },
      });
      return { ok: true };
    } catch (error) {
      throw new Error(error);
    }
  }

  async enableMany(ids: number[], meta: IUser) {
    try {
      const verifyPermissions = await this.verifyOrganizationHomesAccess(
        ids,
        meta,
      );
      if (!verifyPermissions.ok) {
        throw new Error('Access denied to delete request homes list');
      }
      const toAddToCache = await this.prismaService.home.findMany({
        where: {
          id: {
            in: ids,
          },
          organizationId: meta.organizationId,
        },
        select: {
          uniqueId: true,
          disabled: true,
          id: true,
          users: { select: { userId: true } },
          devices: { select: { id: true, uniqueId: true } },
        },
      });
      // ! Add to cache
      await Promise.all(
        toAddToCache.map(async (home) => {
          if (home.disabled) {
            home.users?.map(async (u) => {
              if (u?.userId) {
                const redisKey = `h-user-id:${u.userId}:homes-id`;
                await this.redisClient.sAdd(redisKey, home.id.toString());
              }
            });
            home.devices.map(async (d) => {
              if (d?.id) {
                const redisKey = `h-home-id:${home.id}:devices-id`;
                const redisKeyUnique = `h-home-uniqueid:${home.uniqueId}:devices-uniqueid`;
                await this.redisClient.sAdd(redisKey, d.id.toString());
                await this.redisClient.sAdd(redisKeyUnique, d.uniqueId);
              }
            });
          }
        }),
      );
      await this.prismaService.home.updateMany({
        where: {
          id: {
            in: ids,
          },
          organizationId: meta.organizationId,
        },
        data: {
          disabled: false,
        },
      });
      return { ok: true };
    } catch (error) {
      throw new Error(error);
    }
  }

  private excludeUndefinedFromDto<Dto>(inputDto: Dto): Dto {
    const dto = { ...inputDto };
    for (const key in dto) if (dto[key] === undefined) delete dto[key];
    return dto;
  }

  async findAllSelect(meta: IUser) {
    const homes = await this.prismaService.home.findMany({
      where: { organizationId: meta.organizationId },
      select: {
        id: true,
        name: true,
        uniqueId: true,
        disabled: true,
      },
    });
    return { homes: homes ?? [] };
  }

  // ! Home - User

  async findUsersAllLinks(meta: IUser, homeId: number) {
    const users = await this.prismaService.user.findMany({
      where: { organizationId: meta.organizationId },
      select: {
        id: true,
        name: true,
        username: true,
        isActive: true,
      },
    });
    const userHomes = await this.prismaService.userHome.findMany({
      where: { homeId },
      select: { userId: true },
    });
    const linkedUserIds = new Set(userHomes.map((ud) => ud.userId));
    const usersWithLinks = users.map((user) => ({
      ...user,
      linked: linkedUserIds.has(user.id),
    }));
    return { homes: usersWithLinks ?? [] };
  }

  async linksUserHomes(data: LinksIdsDto, meta: IUser) {
    try {
      const verifyPermissions = await this.verifyOrganizationUsersAccess(
        [...data.toDelete, ...data.toUpdate],
        meta,
      );
      if (!verifyPermissions.ok) {
        throw new Error('Access denied to all request homes');
      }
      await Promise.all(
        data.ids.map((homeId) => {
          return this.prismaService.userHome.createMany({
            data: data.toUpdate.map((userId) => ({
              homeId,
              userId,
            })),
          });
        }),
      );
      // ! Add to cache
      if (data.toUpdate.length > 0) {
        const toAddToCache = await this.prismaService.user.findMany({
          where: {
            id: {
              in: data.toUpdate,
            },
            isActive: true,
            organizationId: meta.organizationId,
          },
          select: {
            id: true,
            homes: {
              select: {
                home: {
                  select: {
                    id: true,
                    uniqueId: true,
                    disabled: true,
                  },
                },
              },
            },
          },
        });
        // ! Add users to cache homes
        await Promise.all(
          await toAddToCache.map(async (user) => {
            await user.homes?.map(async (home) => {
              if (!home.home?.disabled) {
                const redisKey = `h-user-id:${user.id}:homes-id`;
                await this.redisClient.sAdd(redisKey, home.home.id.toString());
              }
            });
          }),
        );
      }
      // ! Delete from cache
      if (data.toDelete.length > 0) {
        const toDeleteFromCache = await this.prismaService.user.findMany({
          where: {
            id: {
              in: data.toDelete,
            },
            isActive: true,
            organizationId: meta.organizationId,
          },
          select: {
            id: true,
            homes: {
              select: {
                home: {
                  select: {
                    id: true,
                    uniqueId: true,
                    disabled: true,
                  },
                },
              },
            },
          },
        });
        // ! Delete users from cache homes
        await Promise.all(
          await toDeleteFromCache.map(async (user) => {
            await user.homes?.map(async (home) => {
              if (!home.home?.disabled) {
                const redisKey = `h-user-id:${user.id}:homes-id`;
                await this.redisClient.sRem(redisKey, home.home.id.toString());
              }
            });
          }),
        );
      }
      await Promise.all(
        data.ids.map((homeId) => {
          return this.prismaService.userHome.deleteMany({
            where: {
              userId: {
                in: data.toDelete,
              },
              homeId,
            },
          });
        }),
      );
      this.refreshUserRulesSchedules([...data.toUpdate, ...data.toDelete]);
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
