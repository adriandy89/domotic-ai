import { Inject, Injectable } from '@nestjs/common';
import {
  CreateHomeDto,
  IUser,
  UpdateHomeDto,
  HomePageMetaDto,
  HomePageOptionsDto,
  LinksUUIDsDto,
} from '@app/models';
import { DbService } from '@app/db';
import { Prisma } from 'generated/prisma/client';
import { MqttConnectionService } from './mqtt-connection.service';
import { ConfigService } from '@nestjs/config';
import { CacheService } from '@app/cache';
import { decrypt } from '../utils';
import { NatsClientService } from '@app/nats-client';

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

  constructor(
    private dbService: DbService,
    private readonly configService: ConfigService,
    private mqttCredentialsService: MqttConnectionService,
    private readonly cacheService: CacheService,
    private readonly natsClient: NatsClientService,
  ) { }

  async verifyOrganizationHomesAccess(homesIds: string[], meta: IUser) {
    const homes = await this.dbService.home.findMany({
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
    const users = await this.dbService.user.findMany({
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
    return await this.dbService.home.findUnique({
      where: { unique_id: uniqueId, organization_id: meta.organization_id },
    });
  }

  async statisticsOrgHomes(organizationId: string) {
    const [countEnabledHomes, countDisabledHomes] = await Promise.all([
      this.dbService.home.count({
        where: { organization_id: organizationId, disabled: false },
      }),
      this.dbService.home.count({
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
    const homesIds = await this.cacheService.sMembers(redisKeyHomesIds);
    return await this.dbService.home.findMany({
      where: { id: { in: homesIds } },
    });
  }

  async countTotalOrganizationHomes(meta: IUser) {
    const count = await this.dbService.home.count({
      where: { organization_id: meta.organization_id },
    });
    return { organizationTotalHomes: count ?? 0 };
  }

  async create(homeDTO: CreateHomeDto, meta: IUser) {
    const created = await this.dbService.home.create({
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
        const updated = await this.dbService.home.update({
          data: {
            mqtt_password: encryptedPassword,
            mqtt_username: created.unique_id,
            mqtt_id: mqttId,
          },
          where: { id: created.id },
        });
        const decryptedPassword = encryptedPassword ? decrypt(encryptedPassword) : '';
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

    const [itemCount, homes] = await this.dbService.$transaction([
      this.dbService.home.count({ where }),
      this.dbService.home.findMany({
        skip,
        take,
        select: {
          ...this.prismaHomesSelect,
          mqtt_password: true,
          mqtt_username: true,
        },
        where,
        orderBy: orderBy
          ? { [orderBy]: sortOrder }
          : undefined,
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
    const found = await this.dbService.home.findUnique({
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

      const previous = await this.dbService.home.findUnique({
        where: { id },
        select: {
          unique_id: true,
          disabled: true,
          id: true,
          devices: { select: { id: true, unique_id: true } },
          users: { select: { user_id: true } },
        },
      });

      if (!previous) {
        throw new Error('Home not found');
      }

      const updated = await this.dbService.home.update({
        data,
        select: this.prismaHomesSelect,
        where: { id },
      });
      // ? Update home caches devices
      const redisKeyHomeIds = `h-home-id:${previous.id}:devices-id`;
      const redisKeyHomeUniqueIdsPrev = `h-home-uniqueid:${previous.unique_id}:devices-uniqueid`;
      const redisKeyHomeUniqueIdsUpd = `h-home-uniqueid:${updated.unique_id}:devices-uniqueid`;
      if (previous.unique_id !== updated.unique_id) {
        if (!previous.disabled) {
          await this.cacheService.del(redisKeyHomeUniqueIdsPrev);
        }
        if (!updated.disabled) {
          previous.devices.map(async (d) => {
            if (d?.id) {
              await this.cacheService.sAdd(redisKeyHomeIds, d.id.toString());
              await this.cacheService.sAdd(redisKeyHomeUniqueIdsUpd, d.unique_id);
            }
          });
        }
      } else {
        if (!previous.disabled && updated.disabled) {
          await this.cacheService.del(redisKeyHomeIds);
          await this.cacheService.del(redisKeyHomeUniqueIdsPrev);
        }
        if (previous.disabled && !updated.disabled) {
          previous.devices.map(async (d) => {
            if (d?.id) {
              await this.cacheService.sAdd(redisKeyHomeIds, d.id.toString());
              await this.cacheService.sAdd(redisKeyHomeUniqueIdsUpd, d.unique_id);
            }
          });
        }
      }
      // ? Update home caches users
      if (!previous.disabled && updated.disabled) {
        previous.users.map(async (u) => {
          if (u?.user_id) {
            const redisKey = `h-user-id:${u.user_id}:homes-id`;
            await this.cacheService.sRem(redisKey, updated.id.toString());
          }
        });
      }
      if (previous.disabled && !updated.disabled) {
        previous.users.map(async (u) => {
          if (u?.user_id) {
            const redisKey = `h-user-id:${u.user_id}:homes-id`;
            await this.cacheService.sAdd(redisKey, updated.id.toString());
          }
        });
      }
      // ? Change mqq password to decrypted
      if (updated.mqtt_password) {
        updated.mqtt_password = decrypt(updated.mqtt_password);
      }
      return { ok: true, data: updated };
    } catch (error) {
      if (error.code === 'P2025') throw new Error('role not found');
      throw new Error(error);
    }
  }

  async delete(id: string, meta: IUser) {
    try {
      const verifyPermissions = await this.verifyOrganizationHomesAccess(
        [id],
        meta,
      );
      if (!verifyPermissions.ok) {
        throw new Error('Access denied to delete request homes list');
      }
      const deleted = await this.dbService.home.delete({
        where: { id, organization_id: meta.organization_id },
        select: {
          ...this.prismaHomesSelect,
          mqtt_id: true,
          users: { select: { user_id: true } },
        },
      });
      // ? Update home caches
      if (!deleted.disabled) {
        const redisKeyHomeIds = `h-home-id:${deleted.id}:devices-id`;
        const redisKeyHomeUniqueIds = `h-home-uniqueid:${deleted.unique_id}:devices-uniqueid`;
        await this.cacheService.del(redisKeyHomeIds);
        await this.cacheService.del(redisKeyHomeUniqueIds);
        deleted.users?.map(async (u) => {
          if (u?.user_id) {
            const redisKey = `h-user-id:${u.user_id}:homes-id`;
            await this.cacheService.sRem(redisKey, deleted.id.toString());
          }
        });
      }
      // ! Delete mqtt credentials
      if (deleted.mqtt_id) {
        await this.mqttCredentialsService.deleteCredentials(deleted.mqtt_id);
      }
      return { ok: true };
    } catch (error) {
      throw new Error(error);
    }
  }
  async deleteMany(ids: string[], meta: IUser) {
    try {
      const verifyPermissions = await this.verifyOrganizationHomesAccess(
        ids,
        meta,
      );
      if (!verifyPermissions.ok) {
        throw new Error('Access denied to delete request homes list');
      }
      const toDeletedFromCache = await this.dbService.home.findMany({
        where: {
          id: {
            in: ids,
          },
          organization_id: meta.organization_id,
        },
        select: {
          unique_id: true,
          disabled: true,
          id: true,
          mqtt_id: true,
          users: { select: { user_id: true } },
        },
      });
      // ! Delete from cache
      await Promise.all(
        toDeletedFromCache.map(async (home) => {
          if (!home.disabled) {
            const redisKeyHomeIds = `h-home-id:${home.id}:devices-id`;
            const redisKeyHomeUniqueIds = `h-home-uniqueid:${home.unique_id}:devices-uniqueid`;
            await this.cacheService.del(redisKeyHomeIds);
            await this.cacheService.del(redisKeyHomeUniqueIds);
            home.users?.map(async (u) => {
              if (u?.user_id) {
                const redisKey = `h-user-id:${u.user_id}:homes-id`;
                await this.cacheService.sRem(redisKey, home.id.toString());
              }
            });
          }
        }),
      );
      await this.dbService.home.deleteMany({
        where: {
          id: {
            in: ids,
          },
          organization_id: meta.organization_id,
        },
      });
      // ! Delete mqtt credentials from
      await Promise.all(
        toDeletedFromCache.map(async (home) => {
          if (home.mqtt_id) {
            await this.mqttCredentialsService.deleteCredentials(home.mqtt_id);
          }
        }),
      );
      return { ok: true };
    } catch (error) {
      throw new Error(error);
    }
  }

  async disableMany(ids: string[], meta: IUser) {
    try {
      const verifyPermissions = await this.verifyOrganizationHomesAccess(
        ids,
        meta,
      );
      if (!verifyPermissions.ok) {
        throw new Error('Access denied to delete request homes list');
      }
      const toDeletedFromCache = await this.dbService.home.findMany({
        where: {
          id: {
            in: ids,
          },
          organization_id: meta.organization_id,
        },
        select: {
          unique_id: true,
          disabled: true,
          id: true,
          users: { select: { user_id: true } },
        },
      });
      // ! Delete from cache
      await Promise.all(
        toDeletedFromCache.map(async (home) => {
          if (!home.disabled) {
            const redisKeyHomeIds = `h-home-id:${home.id}:devices-id`;
            const redisKeyHomeUniqueIds = `h-home-uniqueid:${home.unique_id}:devices-uniqueid`;
            await this.cacheService.del(redisKeyHomeIds);
            await this.cacheService.del(redisKeyHomeUniqueIds);
            home.users?.map(async (u) => {
              if (u?.user_id) {
                const redisKey = `h-user-id:${u.user_id}:homes-id`;
                await this.cacheService.sRem(redisKey, home.id.toString());
              }
            });
          }
        }),
      );
      await this.dbService.home.updateMany({
        where: {
          id: {
            in: ids,
          },
          organization_id: meta.organization_id,
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

  async enableMany(ids: string[], meta: IUser) {
    try {
      const verifyPermissions = await this.verifyOrganizationHomesAccess(
        ids,
        meta,
      );
      if (!verifyPermissions.ok) {
        throw new Error('Access denied to delete request homes list');
      }
      const toAddToCache = await this.dbService.home.findMany({
        where: {
          id: {
            in: ids,
          },
          organization_id: meta.organization_id,
        },
        select: {
          unique_id: true,
          disabled: true,
          id: true,
          users: { select: { user_id: true } },
          devices: { select: { id: true, unique_id: true } },
        },
      });
      // ! Add to cache
      await Promise.all(
        toAddToCache.map(async (home) => {
          if (home.disabled) {
            home.users?.map(async (u) => {
              if (u?.user_id) {
                const redisKey = `h-user-id:${u.user_id}:homes-id`;
                await this.cacheService.sAdd(redisKey, home.id.toString());
              }
            });
            home.devices.map(async (d) => {
              if (d?.id) {
                const redisKey = `h-home-id:${home.id}:devices-id`;
                const redisKeyUnique = `h-home-uniqueid:${home.unique_id}:devices-uniqueid`;
                await this.cacheService.sAdd(redisKey, d.id.toString());
                await this.cacheService.sAdd(redisKeyUnique, d.unique_id);
              }
            });
          }
        }),
      );
      await this.dbService.home.updateMany({
        where: {
          id: {
            in: ids,
          },
          organization_id: meta.organization_id,
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
    const homes = await this.dbService.home.findMany({
      where: { organization_id: meta.organization_id },
      select: {
        id: true,
        name: true,
        unique_id: true,
        disabled: true,
      },
    });
    return { homes: homes ?? [] };
  }

  // ! Home - User

  async findUsersAllLinks(meta: IUser, homeId: string) {
    const users = await this.dbService.user.findMany({
      where: { organization_id: meta.organization_id },
      select: {
        id: true,
        name: true,
        email: true,
        is_active: true,
      },
    });
    const userHomes = await this.dbService.userHome.findMany({
      where: { home_id: homeId },
      select: { user_id: true },
    });
    const linkedUserIds = new Set(userHomes.map((ud) => ud.user_id));
    const usersWithLinks = users.map((user) => ({
      ...user,
      linked: linkedUserIds.has(user.id),
    }));
    return { users: usersWithLinks ?? [] };
  }

  async linksUserHomes(data: LinksUUIDsDto, meta: IUser) {
    try {
      const verifyPermissions = await this.verifyOrganizationUsersAccess(
        [...data.toDelete, ...data.toUpdate],
        meta,
      );
      if (!verifyPermissions.ok) {
        throw new Error('Access denied to all request homes');
      }
      await Promise.all(
        data.uuids.map((homeId) => {
          return this.dbService.userHome.createMany({
            data: data.toUpdate.map((userId) => ({
              home_id: homeId,
              user_id: userId,
            })),
          });
        }),
      );
      // ! Add to cache
      if (data.toUpdate.length > 0) {
        const toAddToCache = await this.dbService.user.findMany({
          where: {
            id: {
              in: data.toUpdate,
            },
            is_active: true,
            organization_id: meta.organization_id,
          },
          select: {
            id: true,
            homes: {
              select: {
                home: {
                  select: {
                    id: true,
                    unique_id: true,
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
                await this.cacheService.sAdd(redisKey, home.home.id.toString());
              }
            });
          }),
        );
      }
      // ! Delete from cache
      if (data.toDelete.length > 0) {
        const toDeleteFromCache = await this.dbService.user.findMany({
          where: {
            id: {
              in: data.toDelete,
            },
            is_active: true,
            organization_id: meta.organization_id,
          },
          select: {
            id: true,
            homes: {
              select: {
                home: {
                  select: {
                    id: true,
                    unique_id: true,
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
                await this.cacheService.sRem(redisKey, home.home.id.toString());
              }
            });
          }),
        );
      }
      await Promise.all(
        data.uuids.map((homeId) => {
          return this.dbService.userHome.deleteMany({
            where: {
              user_id: {
                in: data.toDelete,
              },
              home_id: homeId,
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

  async findDevicesAllLinks(meta: IUser, homeId: string) {
    const devices = await this.dbService.device.findMany({
      where: { organization_id: meta.organization_id },
      select: {
        id: true,
        name: true,
        unique_id: true,
        disabled: true,
      },
    });
    const homeDevices = await this.dbService.device.findMany({
      where: { home_id: homeId },
      select: { id: true },
    });
    const linkedDeviceIds = new Set(homeDevices.map((d) => d.id));
    const devicesWithLinks = devices.map((device) => ({
      ...device,
      linked: linkedDeviceIds.has(device.id),
    }));
    return { devices: devicesWithLinks ?? [] };
  }

  async linksDeviceHomes(data: LinksUUIDsDto, meta: IUser) {
    try {
      const verifyPermissions = await this.verifyOrganizationDevicesAccess(
        [...data.toDelete, ...data.toUpdate],
        meta,
      );
      if (!verifyPermissions.ok) {
        throw new Error('Access denied to all request devices');
      }
      // ! Update devices to link
      if (data.toUpdate.length > 0) {
        await Promise.all(
          data.uuids.map((homeId) => {
            return this.dbService.device.updateMany({
              where: {
                id: {
                  in: data.toUpdate,
                },
                organization_id: meta.organization_id,
              },
              data: {
                home_id: homeId,
              },
            });
          }),
        );
        // ! Add to cache
        const toAddToCache = await this.dbService.device.findMany({
          where: {
            id: {
              in: data.toUpdate,
            },
            disabled: false,
            organization_id: meta.organization_id,
          },
          select: {
            id: true,
            unique_id: true,
            home_id: true,
            home: {
              select: {
                id: true,
                unique_id: true,
                disabled: true,
              },
            },
          },
        });
        // ! Add devices to cache homes
        await Promise.all(
          toAddToCache.map(async (device) => {
            if (device.home_id && !device.home?.disabled) {
              const redisKeyHomeIds = `h-home-id:${device.home_id}:devices-id`;
              await this.cacheService.sAdd(redisKeyHomeIds, device.id);
              const redisKeyHomeUniqueIds = `h-home-uniqueid:${device.home?.unique_id}:devices-uniqueid`;
              await this.cacheService.sAdd(redisKeyHomeUniqueIds, device.unique_id);
            }
          }),
        );
      }
      // ! Delete from cache and unlink devices
      if (data.toDelete.length > 0) {
        const toDeleteFromCache = await this.dbService.device.findMany({
          where: {
            id: {
              in: data.toDelete,
            },
            disabled: false,
            organization_id: meta.organization_id,
          },
          select: {
            id: true,
            unique_id: true,
            home_id: true,
            home: {
              select: {
                id: true,
                unique_id: true,
                disabled: true,
              },
            },
          },
        });
        // ! Delete devices from cache homes
        await Promise.all(
          toDeleteFromCache.map(async (device) => {
            if (device.home_id && !device.home?.disabled) {
              const redisKeyHomeIds = `h-home-id:${device.home_id}:devices-id`;
              await this.cacheService.sRem(redisKeyHomeIds, device.id);
              const redisKeyHomeUniqueIds = `h-home-uniqueid:${device.home?.unique_id}:devices-uniqueid`;
              await this.cacheService.sRem(redisKeyHomeUniqueIds, device.unique_id);
            }
          }),
        );
        // ! Unlink devices
        await this.dbService.device.updateMany({
          where: {
            id: {
              in: data.toDelete,
            },
            organization_id: meta.organization_id,
          },
          data: {
            home_id: null,
          },
        });
      }
      return { ok: true };
    } catch (error) {
      throw new Error(error);
    }
  }

  async verifyOrganizationDevicesAccess(devicesIds: string[], meta: IUser) {
    const devices = await this.dbService.device.findMany({
      where: {
        id: {
          in: devicesIds,
        },
        organization_id: meta.organization_id,
      },
      select: { id: true },
    });
    if (devices.length !== devicesIds.length) {
      throw new Error('Device not found');
    }
    return { ok: true };
  }

  refreshUserRulesSchedules(userIds: string[]) {
    userIds.map((id) => {
      this.natsClient.emit('rules.refresh_user_rules', {
        meta: { id },
      });
      this.natsClient.emit('schedules.refresh_user_schedules', {
        meta: { id },
      });
    });
  }
}
