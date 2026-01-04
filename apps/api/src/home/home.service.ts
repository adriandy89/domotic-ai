import { CacheService } from '@app/cache';
import { DbService } from '@app/db';
import {
  CreateHomeDto,
  getKeyHomeUniqueIdOrgId,
  HomePageMetaDto,
  HomePageOptionsDto,
  LinksUUIDsDto,
  UpdateHomeDto
} from '@app/models';
import { NatsClientService } from '@app/nats-client';
import { BadRequestException, Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from 'generated/prisma/client';
import { decrypt } from '../utils';
import { MqttConnectionService } from './mqtt-connection.service';

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

  async verifyOrganizationDevicesAccess(devicesIds: string[], organization_id: string) {
    const totalDevices = await this.dbService.device.count({
      where: {
        id: {
          in: devicesIds,
        },
        organization_id,
      },
    });
    if (totalDevices !== devicesIds.length) {
      throw new Error('Device not found');
    }
    return { ok: true };
  }

  async verifyOrganizationHomesAccess(homesIds: string[], organization_id: string) {
    const totalHomes = await this.dbService.home.count({
      where: {
        id: {
          in: homesIds,
        },
        organization_id,
      },
    });
    if (totalHomes !== homesIds.length) {
      throw new Error('Home not found');
    }
    return { ok: true };
  }

  async verifyOrganizationUsersAccess(userHomeIds: string[], organization_id: string) {
    const totalUsers = await this.dbService.user.count({
      where: {
        id: {
          in: userHomeIds,
        },
        organization_id,
      },
    });
    if (totalUsers !== userHomeIds.length) {
      throw new Error('User not found');
    }
    return { ok: true };
  }

  async verifyLimitsOrganizationHomes(organization_id: string) {
    const organization = await this.dbService.organization.findUnique({
      where: {
        id: organization_id,
      },
      select: {
        max_homes: true,
      },
    });
    if (!organization) {
      throw new Error('Organization not found');
    }
    const totalHomes = await this.dbService.home.count({
      where: { organization_id },
    });
    if (totalHomes >= organization.max_homes) return { ok: false, message: 'Max homes limit reached' };
    return { ok: true };
  }

  async create(homeDTO: CreateHomeDto, organization_id: string, user_id: string) {
    const verifyLimits = await this.verifyLimitsOrganizationHomes(organization_id);
    if (!verifyLimits.ok) {
      throw new BadRequestException(verifyLimits.message);
    }
    const created = await this.dbService.home.create({
      data: {
        ...homeDTO,
        connected: false,
        organization_id,
      },
      select: this.prismaHomesSelect,
    });
    await this.dbService.userHome.create({
      data: {
        user_id,
        home_id: created.id,
      },
    });
    await this.cacheService.set(getKeyHomeUniqueIdOrgId(created.unique_id), organization_id);
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


  async update(id: string, homeDTO: UpdateHomeDto | any, organization_id: string) {
    try {
      const verifyPermissions = await this.verifyOrganizationHomesAccess(
        [id],
        organization_id,
      );
      if (!verifyPermissions.ok) {
        throw new Error('Access denied to delete request homes list');
      }
      const { organizationId, ...data } = homeDTO;

      const previous = await this.dbService.home.findUnique({
        where: { id, organization_id },
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
      // const redisKeyHomeIds = `h-home-id:${previous.id}:devices-id`;
      // const redisKeyHomeUniqueIdsPrev = `h-home-uniqueid:${previous.unique_id}:devices-uniqueid`;
      // const redisKeyHomeUniqueIdsUpd = `h-home-uniqueid:${updated.unique_id}:devices-uniqueid`;
      // if (previous.unique_id !== updated.unique_id) {
      //   if (!previous.disabled) {
      //     await this.cacheService.del(redisKeyHomeUniqueIdsPrev);
      //   }
      //   if (!updated.disabled) {
      //     previous.devices.map(async (d) => {
      //       if (d?.id) {
      //         await this.cacheService.sAdd(redisKeyHomeIds, d.id.toString());
      //         await this.cacheService.sAdd(redisKeyHomeUniqueIdsUpd, d.unique_id);
      //       }
      //     });
      //   }
      // } else {
      //   if (!previous.disabled && updated.disabled) {
      //     await this.cacheService.del(redisKeyHomeIds);
      //     await this.cacheService.del(redisKeyHomeUniqueIdsPrev);
      //   }
      //   if (previous.disabled && !updated.disabled) {
      //     previous.devices.map(async (d) => {
      //       if (d?.id) {
      //         await this.cacheService.sAdd(redisKeyHomeIds, d.id.toString());
      //         await this.cacheService.sAdd(redisKeyHomeUniqueIdsUpd, d.unique_id);
      //       }
      //     });
      //   }
      // }
      // // ? Update home caches users
      // if (!previous.disabled && updated.disabled) {
      //   previous.users.map(async (u) => {
      //     if (u?.user_id) {
      //       const redisKey = `h-user-id:${u.user_id}:homes-id`;
      //       await this.cacheService.sRem(redisKey, updated.id.toString());
      //     }
      //   });
      // }
      // if (previous.disabled && !updated.disabled) {
      //   previous.users.map(async (u) => {
      //     if (u?.user_id) {
      //       const redisKey = `h-user-id:${u.user_id}:homes-id`;
      //       await this.cacheService.sAdd(redisKey, updated.id.toString());
      //     }
      //   });
      // }
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

  async updateAttributes(id: string, attributesDto: { attributes: object }, organization_id: string) {
    try {
      const verifyPermissions = await this.verifyOrganizationHomesAccess(
        [id],
        organization_id,
      );
      if (!verifyPermissions.ok) {
        throw new Error('Access denied to update home attributes');
      }

      const updated = await this.dbService.home.update({
        data: { attributes: attributesDto.attributes },
        select: this.prismaHomesSelect,
        where: { id, organization_id },
      });

      return { ok: true, data: updated };
    } catch (error) {
      if (error.code === 'P2025') throw new Error('Home not found');
      throw new Error(error);
    }
  }

  async delete(id: string, organization_id: string) {
    try {
      const verifyPermissions = await this.verifyOrganizationHomesAccess(
        [id],
        organization_id,
      );
      if (!verifyPermissions.ok) {
        throw new Error('Access denied to delete request homes list');
      }
      const deleted = await this.dbService.home.delete({
        where: { id, organization_id },
        select: {
          ...this.prismaHomesSelect,
          mqtt_id: true,
          users: { select: { user_id: true } },
        },
      });
      await this.cacheService.del(getKeyHomeUniqueIdOrgId(deleted.unique_id));
      // ? Update home caches
      // if (!deleted.disabled) {
      //   const redisKeyHomeIds = `h-home-id:${deleted.id}:devices-id`;
      //   const redisKeyHomeUniqueIds = `h-home-uniqueid:${deleted.unique_id}:devices-uniqueid`;
      //   await this.cacheService.del(redisKeyHomeIds);
      //   await this.cacheService.del(redisKeyHomeUniqueIds);
      //   deleted.users?.map(async (u) => {
      //     if (u?.user_id) {
      //       const redisKey = `h-user-id:${u.user_id}:homes-id`;
      //       await this.cacheService.sRem(redisKey, deleted.id.toString());
      //     }
      //   });
      // }
      // ! Delete mqtt credentials
      if (deleted.mqtt_id) {
        await this.mqttCredentialsService.deleteCredentials(deleted.mqtt_id);
      }
      return { ok: true };
    } catch (error) {
      console.log(error);
      throw new InternalServerErrorException(error);
    }
  }

  getMqttConfig() {
    return {
      mqttHost: this.configService.get('MQTT_SERVER_BASE'),
      mqttPort: this.configService.get('MQTT_PORT'),
    };
  }

  async findByUniqueId(unique_id: string, organization_id: string) {
    return await this.dbService.home.findUnique({
      where: { unique_id, organization_id },
      select: this.prismaHomesSelect,
    });
  }

  async findAllByUserId(user_id: string) {
    // const redisKeyHomesIds = `h-user-id:${userId}:homes-id`;
    // const homesIds = await this.cacheService.sMembers(redisKeyHomesIds);
    return await this.dbService.home.findMany({
      where: { users: { some: { user_id } } },
      select: {
        ...this.prismaHomesSelect,
        devices: {
          select: {
            id: true,
            unique_id: true,
            name: true,
            description: true,
            category: true,
            attributes: true,
            disabled: true,
            created_at: true,
            updated_at: true,
            home_id: true,
            icon: true,
            model: true,
            show_on_map: true,
            x: true,
            y: true,
            learned_commands: {
              select: {
                id: true,
                name: true,
                command: true,
                updated_at: true,
              }
            },
          }
        }
      },
    });
  }

  async findAll(optionsDto: HomePageOptionsDto, organization_id: string) {
    const { search, take, page, orderBy, sortOrder } = optionsDto;
    const skip = (page - 1) * take;

    let where: Prisma.HomeWhereInput = search ? {
      OR: [
        { unique_id: { contains: search, mode: 'insensitive' } },
        { name: { contains: search, mode: 'insensitive' } },
      ],
    } : {};
    where.organization_id = organization_id;

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

  async findOne(id: string, organization_id: string) {
    const found = await this.dbService.home.findUnique({
      where: { id, organization_id },
      select: {
        ...this.prismaHomesSelect,
        mqtt_password: true,
        mqtt_username: true,
      },
    });
    if (!found) {
      throw new BadRequestException('Home not found');
    }
    if (found?.mqtt_password) {
      found.mqtt_password = decrypt(found.mqtt_password);
    }
    return found;
  }

  async disableMany(ids: string[], organization_id: string) {
    try {
      const verifyPermissions = await this.verifyOrganizationHomesAccess(
        ids,
        organization_id,
      );
      if (!verifyPermissions.ok) {
        throw new Error('Access denied to delete request homes list');
      }
      const toDeletedFromCache = await this.dbService.home.findMany({
        where: {
          id: {
            in: ids,
          },
          organization_id,
        },
        select: {
          unique_id: true,
          disabled: true,
          id: true,
          users: { select: { user_id: true } },
        },
      });
      // ! Delete from cache
      // await Promise.all(
      //   toDeletedFromCache.map(async (home) => {
      //     if (!home.disabled) {
      //       const redisKeyHomeIds = `h-home-id:${home.id}:devices-id`;
      //       const redisKeyHomeUniqueIds = `h-home-uniqueid:${home.unique_id}:devices-uniqueid`;
      //       await this.cacheService.del(redisKeyHomeIds);
      //       await this.cacheService.del(redisKeyHomeUniqueIds);
      //       home.users?.map(async (u) => {
      //         if (u?.user_id) {
      //           const redisKey = `h-user-id:${u.user_id}:homes-id`;
      //           await this.cacheService.sRem(redisKey, home.id.toString());
      //         }
      //       });
      //     }
      //   }),
      // );
      await this.dbService.home.updateMany({
        where: {
          id: {
            in: ids,
          },
          organization_id,
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

  async enableMany(ids: string[], organization_id: string) {
    try {
      const verifyPermissions = await this.verifyOrganizationHomesAccess(
        ids,
        organization_id,
      );
      if (!verifyPermissions.ok) {
        throw new Error('Access denied to delete request homes list');
      }
      const toAddToCache = await this.dbService.home.findMany({
        where: {
          id: {
            in: ids,
          },
          organization_id,
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
      // await Promise.all(
      //   toAddToCache.map(async (home) => {
      //     if (home.disabled) {
      //       home.users?.map(async (u) => {
      //         if (u?.user_id) {
      //           const redisKey = `h-user-id:${u.user_id}:homes-id`;
      //           await this.cacheService.sAdd(redisKey, home.id.toString());
      //         }
      //       });
      //       home.devices.map(async (d) => {
      //         if (d?.id) {
      //           const redisKey = `h-home-id:${home.id}:devices-id`;
      //           const redisKeyUnique = `h-home-uniqueid:${home.unique_id}:devices-uniqueid`;
      //           await this.cacheService.sAdd(redisKey, d.id.toString());
      //           await this.cacheService.sAdd(redisKeyUnique, d.unique_id);
      //         }
      //       });
      //     }
      //   }),
      // );
      await this.dbService.home.updateMany({
        where: {
          id: {
            in: ids,
          },
          organization_id,
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

  // ! Home - User

  async findUsersAllLinks(home_id: string, organization_id: string) {
    const users = await this.dbService.user.findMany({
      where: { organization_id },
      select: {
        id: true,
        name: true,
        email: true,
        is_active: true,
      },
    });
    const userHomes = await this.dbService.userHome.findMany({
      where: { home_id },
      select: { user_id: true },
    });
    const linkedUserIds = new Set(userHomes.map((ud) => ud.user_id));
    const usersWithLinks = users.map((user) => ({
      ...user,
      linked: linkedUserIds.has(user.id),
    }));
    return { users: usersWithLinks ?? [] };
  }

  async linksUsersHomes(data: LinksUUIDsDto, organization_id: string) {
    try {
      const verifyUsersPermissions = await this.verifyOrganizationUsersAccess(
        [...data.toDelete, ...data.toUpdate],
        organization_id,
      );
      const verifyHomesPermissions = await this.verifyOrganizationHomesAccess(
        data.uuids,
        organization_id,
      );
      if (!verifyUsersPermissions.ok || !verifyHomesPermissions.ok) {
        throw new Error('Access denied to all request homes or users');
      }
      await Promise.all(
        data.uuids.map((home_id) => {
          return this.dbService.userHome.createMany({
            data: data.toUpdate.map((user_id) => ({
              home_id,
              user_id,
            })),
            skipDuplicates: true,
          });
        }),
      );
      await Promise.all(
        data.uuids.map((home_id) => {
          return this.dbService.userHome.deleteMany({
            where: {
              user_id: {
                in: data.toDelete,
              },
              home_id,
            },
          });
        }),
      );
      // await this.refreshUserRulesSchedules([...data.toUpdate, ...data.toDelete]);
      return { ok: true };
    } catch (error) {
      throw new Error(error);
    }
  }

  // async refreshUserRulesSchedules(ids: string[]) {
  //   await this.natsClient.emit('rules.refresh_users_rules', { ids });
  //   await this.natsClient.emit('schedules.refresh_users_schedules', { ids });
  // }
}
