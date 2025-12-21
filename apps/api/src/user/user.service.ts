/* eslint-disable @typescript-eslint/no-unused-vars */
import { BadRequestException, Injectable } from '@nestjs/common';
import bcrypt from 'bcrypt';
import {
  CreateUserDto,
  SessionUser,
  LinksUUIDsDto,
  UpdateUserAttributesDto,
  UpdateUserDto,
  UpdateUserFmcTokenDto,
  UserPageMetaDto,
  UserPageOptionsDto,
} from '@app/models';
import { DbService } from '@app/db';
import { Prisma } from 'generated/prisma/client';
import { CacheService } from '@app/cache';
import { NatsClientService } from '@app/nats-client';

@Injectable()
export class UserService {
  readonly prismaUserSelect: Prisma.UserSelect = {
    id: true,
    email: true,
    phone: true,
    name: true,
    attributes: true,
    is_active: true,
    organization_id: true,
    updated_at: true,
    created_at: true,
    role: true,
    expiration_time: true,
    notification_batch_minutes: true,
  };

  constructor(
    private dbService: DbService,
    private readonly cacheService: CacheService,
    private readonly natsClient: NatsClientService,
  ) { }

  async statisticsOrgUsers(organizationId: string) {
    const [countEnabledUsers, countDisabledUsers] = await Promise.all([
      this.dbService.user.count({
        where: { organization_id: organizationId, is_active: true },
      }),
      this.dbService.user.count({
        where: { organization_id: organizationId, is_active: false },
      }),
    ]);
    const totalUsers = (countEnabledUsers ?? 0) + (countDisabledUsers ?? 0);
    return {
      totalUsers,
      enabledUsers: countEnabledUsers ?? 0,
      disabledUsers: countDisabledUsers ?? 0,
    };
  }

  async verifyOrganizationUsersAccess(userIds: string[], organization_id: string) {
    const users = await this.dbService.user.count({
      where: {
        id: {
          in: userIds,
        },
        organization_id,
      },
    });
    if (users !== userIds.length) {
      throw new Error('User not found');
    }
    return { ok: true };
  }

  async verifyOrganizationHomesAccess(homeIds: string[], organization_id: string) {
    const homes = await this.dbService.home.count({
      where: {
        id: {
          in: homeIds,
        },
        organization_id,
      },
    });
    if (homes !== homeIds.length) {
      throw new Error('Home not found');
    }
    return { ok: true };
  }

  async verifyLimitsOrganizationUsers(organization_id: string) {
    const organization = await this.dbService.organization.findUnique({
      where: {
        id: organization_id,
      },
      select: {
        max_users: true,
      },
    });
    if (!organization) {
      throw new Error('Organization not found');
    }
    const totalUsers = await this.dbService.user.count({
      where: { organization_id },
    });
    if (totalUsers >= organization.max_users) return { ok: false, message: 'Max users limit reached' };
    return { ok: true };
  }

  async validateUser(email: string, password: string) {
    const user = await this.dbService.user.findUnique({
      where: { email },
      select: { ...this.prismaUserSelect, password: true },
    });
    if (!user) return null;

    const isValidPassword = user.password ? await this.checkPassword(password, user.password) : false;

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

  async create(userDTO: CreateUserDto, organization_id: string) {
    const verifyLimits = await this.verifyLimitsOrganizationUsers(organization_id);
    if (!verifyLimits.ok) {
      throw new BadRequestException(verifyLimits.message);
    }
    const hash = await this.hashPassword(userDTO.password);
    const { password, ...newUser } = await this.dbService.user.create({
      data: {
        ...userDTO,
        password: hash,
        organization_id,
      },
    });
    // ! Add to cache
    // const redisKeyAllUsersIds = `h-users-ids`;
    // await this.cacheService.sAdd(redisKeyAllUsersIds, newUser.id.toString());
    return { user: newUser };
  }


  // only update attributes from home app by logged user
  async updateAttributes(userDTO: UpdateUserAttributesDto, meta: SessionUser) {
    const organization_id = meta?.organization_id;
    if (!organization_id) throw new Error('Organization not found');
    try {
      const updated = await this.dbService.user.update({
        data: { attributes: userDTO.attributes },
        select: this.prismaUserSelect,
        where: { id: meta.id, organization_id },
      });
      // update user attributes in cache
      // const redisKey = `h-user-id:${meta.id}:attributes`;
      // await this.cacheService.set(redisKey, JSON.stringify(updated.attributes));
      return { ok: true, data: updated };
    } catch (error) {
      if (error.code === 'P2025') throw new Error('not found');
      throw new Error(error);
    }
  }

  async updateFmcTokens(fmcDTO: UpdateUserFmcTokenDto, meta: SessionUser) {
    const organization_id = meta?.organization_id;
    if (!organization_id) throw new Error('Organization not found');
    try {
      // ! FIX
      // const redisKey = `h-user-id:${meta.id}:fmc-tokens`;
      // const fmcTokens = (await this.cacheService.sMembers(redisKey)) ?? [];
      const fmcTokens = []

      const updated = await this.dbService.user.update({
        data: { fmc_tokens: [...fmcTokens, fmcDTO.fmc_token] },
        select: this.prismaUserSelect,
        where: { id: meta.id, organization_id },
      });
      // ! Refresh user fmc tokens form redis
      // await this.cacheService.sAdd(redisKey, fmcDTO.fmc_token);
      return { ok: true, data: updated };
    } catch (error) {
      if (error.code === 'P2025') throw new Error('not found');
      throw new Error(error);
    }
  }

  async deleteFmcToken(fmcDTO: UpdateUserFmcTokenDto, meta: SessionUser) {
    const organization_id = meta?.organization_id;
    if (!organization_id) throw new Error('Organization not found');
    try {
      // ! FIX
      // const redisKey = `h-user-id:${meta.id}:fmc-tokens`;
      // const fmcTokens = (await this.cacheService.sMembers(redisKey)) ?? [];
      const fmcTokens = [];
      const updated = await this.dbService.user.update({
        data: {
          fmc_tokens: fmcTokens.filter((t) => t !== fmcDTO.fmc_token) ?? [],
        },
        select: this.prismaUserSelect,
        where: { id: meta.id, organization_id },
      });
      // ! Refresh user fmc tokens form redis
      // await this.cacheService.sRem(redisKey, fmcDTO.fmc_token);
      return { ok: true, data: updated };
    } catch (error) {
      if (error.code === 'P2025') throw new Error('not found');
      throw new Error(error);
    }
  }

  async update(id: string, userDTO: UpdateUserDto, meta: SessionUser) {
    const organization_id = meta?.organization_id;
    if (!organization_id) throw new Error('Organization not found');
    try {
      const data: Prisma.UserUpdateInput = {
        ...userDTO,
      };

      const previous = await this.dbService.user.findUnique({
        where: { id, organization_id },
        select: {
          is_active: true,
          id: true,
          homes: { select: { home_id: true } },
        },
      });

      if (!previous) {
        throw new Error('User not found');
      }

      const updated = await this.dbService.user.update({
        data,
        select: this.prismaUserSelect,
        where: { id, organization_id },
      });

      // ! Remove from cache
      // if (previous.is_active && !updated.is_active) {
      //   previous.homes?.map(async (h) => {
      //     if (h?.home_id) {
      //       const redisKey = `h-user-id:${id}:homes-id`;
      //       await this.cacheService.sRem(redisKey, h.home_id.toString());
      //     }
      //   });
      // }
      // // ! Add to cache
      // if (!previous.is_active && updated.is_active) {
      //   previous.homes?.map(async (h) => {
      //     if (h?.home_id) {
      //       const redisKey = `h-user-id:${id}:homes-id`;
      //       await this.cacheService.sAdd(redisKey, h.home_id.toString());
      //     }
      //   });
      // }
      await this.refreshUserRulesSchedules([id]);
      return { ok: true, data: updated };
    } catch (error) {
      if (error.code === 'P2025') throw new Error('not found');
      throw new Error(error);
    }
  }

  async delete(id: string, meta: SessionUser) {
    const organization_id = meta?.organization_id;
    if (!organization_id) throw new Error('Organization not found');
    try {
      const user = await this.dbService.user.findUnique({
        where: { id, organization_id },
        select: {
          id: true,
          is_active: true,
          homes: { select: { home_id: true } },
        },
      });

      if (!user) {
        throw new Error('User not found');
      }

      const deleted = await this.dbService.user.delete({
        where: { id, organization_id },
        select: this.prismaUserSelect,
      });

      // ! Remove from cache
      // if (user.is_active) {
      //   user.homes?.map(async (h) => {
      //     if (h?.home_id) {
      //       const redisKey = `h-user-id:${id}:homes-id`;
      //       await this.cacheService.sRem(redisKey, h.home_id.toString());
      //     }
      //   });
      // }
      // const redisKeyAllUsersIds = `h-users-ids`;
      // await this.cacheService.sRem(redisKeyAllUsersIds, id.toString());
      await this.refreshUserRulesSchedules([id]);
      return { ok: true, data: deleted };
    } catch (error) {
      throw new Error(error);
    }
  }

  async findAll(optionsDto: UserPageOptionsDto, organization_id: string) {
    const { search, take, page, orderBy, sortOrder } = optionsDto;
    const skip = (page - 1) * take;

    let where: Prisma.UserWhereInput = search ? {
      OR: [
        { email: { contains: search, mode: 'insensitive' } },
        { name: { contains: search, mode: 'insensitive' } },
      ],
    } : {};

    where.organization_id = organization_id;

    const [itemCount, users] = await this.dbService.$transaction([
      this.dbService.user.count({ where }),
      this.dbService.user.findMany({
        skip,
        take,
        select: this.prismaUserSelect,
        where,
        orderBy: orderBy
          ? { [orderBy]: sortOrder }
          : undefined,
      }),
    ]);

    const userPaginatedMeta = new UserPageMetaDto({
      itemCount,
      pageOptions: optionsDto,
    });
    return { data: users, meta: userPaginatedMeta };
  }

  async findOne(id: string, organization_id: string) {
    return await this.dbService.user.findUnique({
      where: { id, organization_id },
      select: this.prismaUserSelect,
    });
  }

  async disableMany(ids: string[], organization_id: string) {
    try {
      const verifyPermissions = await this.verifyOrganizationUsersAccess(
        ids,
        organization_id,
      );
      if (!verifyPermissions.ok) {
        throw new Error('Access denied to delete request users list');
      }
      const toDeletedFromCache = await this.dbService.user.findMany({
        where: {
          id: {
            in: ids,
          },
          organization_id,
        },
        select: {
          is_active: true,
          id: true,
          homes: { select: { home_id: true } },
        },
      });
      // ! Delete from cache
      // await Promise.all(
      //   toDeletedFromCache.map(async (user) => {
      //     if (user.is_active) {
      //       user.homes?.map(async (h) => {
      //         if (h?.home_id) {
      //           const redisKey = `h-user-id:${user.id}:homes-id`;
      //           await this.cacheService.sRem(redisKey, h.home_id.toString());
      //         }
      //       });
      //     }
      //   }),
      // );
      await this.dbService.user.updateMany({
        where: {
          id: {
            in: ids,
          },
          organization_id,
        },
        data: {
          is_active: false,
        },
      });
      await this.refreshUserRulesSchedules(ids);
      return { ok: true };
    } catch (error) {
      throw new Error(error);
    }
  }

  async enableMany(ids: string[], organization_id: string) {
    try {
      const verifyPermissions = await this.verifyOrganizationUsersAccess(
        ids,
        organization_id,
      );
      if (!verifyPermissions.ok) {
        throw new Error('Access denied to delete request users list');
      }
      const toAddToCache = await this.dbService.user.findMany({
        where: {
          id: {
            in: ids,
          },
          organization_id,
        },
        select: {
          is_active: true,
          id: true,
          homes: { select: { home_id: true } },
        },
      });
      // ! Add to cache
      // await Promise.all(
      //   toAddToCache.map(async (user) => {
      //     if (!user.is_active) {
      //       user.homes?.map(async (h) => {
      //         if (h?.home_id) {
      //           const redisKey = `h-user-id:${user.id}:homes-id`;
      //           await this.cacheService.sAdd(redisKey, h.home_id.toString());
      //         }
      //       });
      //     }
      //   }),
      // );
      await this.dbService.user.updateMany({
        where: {
          id: {
            in: ids,
          },
          organization_id,
        },
        data: {
          is_active: true,
        },
      });
      await this.refreshUserRulesSchedules(ids);
      return { ok: true };
    } catch (error) {
      throw new Error(error);
    }
  }

  async findByEmail(email: string, organization_id: string) {
    return await this.dbService.user.findUnique({
      where: { email, organization_id },
      select: this.prismaUserSelect,
    });
  }

  // ! User - Home
  async findAllHomesLinks(userId: string, organization_id: string) {
    const homes = await this.dbService.home.findMany({
      where: { organization_id },
      select: {
        id: true,
        name: true,
        unique_id: true,
        disabled: true,
      },
    });
    const userHomes = await this.dbService.userHome.findMany({
      where: { user_id: userId },
      select: { home_id: true },
    });
    const linkedHomeIds = new Set(userHomes.map((ud) => ud.home_id));
    const homesWithLinks = homes.map((home) => ({
      ...home,
      linked: linkedHomeIds.has(home.id),
    }));
    return { homes: homesWithLinks ?? [] };
  }

  async linksHomesUser(data: LinksUUIDsDto, organization_id: string) {
    try {
      const verifyPermissions = await this.verifyOrganizationHomesAccess(
        [...data.toDelete, ...data.toUpdate],
        organization_id,
      );
      if (!verifyPermissions.ok) {
        throw new Error('Access denied to all request homes');
      }
      await Promise.all(
        data.uuids.map((userId) => {
          return this.dbService.userHome.createMany({
            data: data.toUpdate.map((homeId) => ({
              home_id: homeId,
              user_id: userId,
            })),
          });
        }),
      );
      // ! Add to cache
      // if (data.toUpdate.length > 0) {
      //   const toAddToCache = await this.dbService.home.findMany({
      //     where: {
      //       id: {
      //         in: data.toUpdate,
      //       },
      //       disabled: false,
      //       organization_id: meta.organization_id,
      //     },
      //     select: {
      //       id: true,
      //       users: {
      //         select: {
      //           user: {
      //             select: {
      //               id: true,
      //               is_active: true,
      //             },
      //           },
      //         },
      //       },
      //     },
      //   });
      //   // ! Add users to cache homes
      //   await Promise.all(
      //     toAddToCache.map(async (home) => {
      //       home.users?.map(async (user) => {
      //         if (user.user?.is_active) {
      //           const redisKey = `h-user-id:${user.user.id}:homes-id`;
      //           await this.cacheService.sAdd(redisKey, home.id.toString());
      //         }
      //       });
      //     }),
      //   );
      // }
      // // ! Delete from cache
      // if (data.toDelete.length > 0) {
      //   const toDeleteFromCache = await this.dbService.home.findMany({
      //     where: {
      //       id: {
      //         in: data.toDelete,
      //       },
      //       disabled: false,
      //       organization_id: meta.organization_id,
      //     },
      //     select: {
      //       id: true,
      //       users: {
      //         select: {
      //           user: {
      //             select: {
      //               id: true,
      //               is_active: true,
      //             },
      //           },
      //         },
      //       },
      //     },
      //   });
      //   // ! Delete users from cache homes
      //   await Promise.all(
      //     toDeleteFromCache.map(async (home) => {
      //       home.users?.map(async (user) => {
      //         if (user.user?.is_active) {
      //           const redisKey = `h-user-id:${user.user.id}:homes-id`;
      //           await this.cacheService.sRem(redisKey, home.id.toString());
      //         }
      //       });
      //     }),
      //   );
      // }
      await Promise.all(
        data.uuids.map((userId) => {
          return this.dbService.userHome.deleteMany({
            where: {
              home_id: {
                in: data.toDelete,
              },
              user_id: userId,
            },
          });
        }),
      );
      await this.refreshUserRulesSchedules(data.uuids);
      return { ok: true };
    } catch (error) {
      throw new Error(error);
    }
  }

  async refreshUserRulesSchedules(userIds: string[]) {
    await this.natsClient.emit('rules.refresh_users_rules', { userIds });
    await this.natsClient.emit('schedules.refresh_users_schedules', { userIds });
    // userIds.map((id) => {
    //   this.natsClient.emit('rules.refresh_user_rules', {
    //     meta: { id },
    //   });
    //   this.natsClient.emit('schedules.refresh_user_schedules', {
    //     meta: { id },
    //   });
    // });
  }
}
