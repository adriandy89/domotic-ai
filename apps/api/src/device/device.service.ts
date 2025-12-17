import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  CreateDeviceDto,
  UpdateDeviceDto,
  DevicePageMetaDto,
  DevicePageOptionsDto,
  CommandDeviceDto,
  CreateCommandDeviceDto,
  UpdateCommandNameDto,
} from '@app/models';
import { DbService } from '@app/db';
import type { MqttClient } from 'mqtt';
import { Prisma } from 'generated/prisma/client';
import { CacheService } from '@app/cache';
import type { SessionUser } from '@app/models';

@Injectable()
export class DeviceService {
  private readonly logger = new Logger(DeviceService.name);
  readonly prismaDeviceSelect: Prisma.DeviceSelect = {
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
  };

  constructor(
    private prismaService: DbService,
    private readonly cacheService: CacheService,
    @Inject('MQTT_CLIENT') private readonly mqttClient: MqttClient,
  ) { }

  async verifyOrganizationDevicesAccess(devicesIds: string[], meta: SessionUser) {
    const devices = await this.prismaService.device.findMany({
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

  async findAllByHomeId(homeId: string, meta: SessionUser) {
    return await this.prismaService.device.findMany({
      where: { home_id: homeId, organization_id: meta.organization_id },
    });
  }

  async findByUniqueId(uniqueId: string, meta: SessionUser) {
    return await this.prismaService.device.findUnique({
      where: { unique_id: uniqueId, organization_id: meta.organization_id },
    });
  }

  async statisticsOrgDevices(organizationId: string) {
    const [countEnabledDevices, countDisabledDevices] = await Promise.all([
      this.prismaService.device.count({
        where: { organization_id: organizationId, disabled: false },
      }),
      this.prismaService.device.count({
        where: { organization_id: organizationId, disabled: true },
      }),
    ]);
    const totalDevices =
      (countEnabledDevices ?? 0) + (countDisabledDevices ?? 0);
    return {
      totalDevices,
      enabledDevices: countEnabledDevices ?? 0,
      disabledDevices: countDisabledDevices ?? 0,
    };
  }

  async findAllByCurrentUser(userId: string) {
    const redisKeyHomesIds = `h-user-id:${userId}:homes-id`;
    const homesIds = await this.cacheService.sMembers(redisKeyHomesIds);
    const redisKeyDevicesIds = homesIds.map(
      (id) => `h-home-id:${id}:devices-id`,
    );
    // get all devicesIds from all redisKeyDevicesIds
    const devicesIdsRedis = await Promise.all(
      redisKeyDevicesIds.map((key) => this.cacheService.sMembers(key)),
    ).then((result) => result.flat());
    return await this.prismaService.device.findMany({
      where: { id: { in: devicesIdsRedis } },
      select: {
        ...this.prismaDeviceSelect,
        learned_commands: {
          select: {
            id: true,
            name: true,
            command: true,
          },
        },
      },
    });
  }

  async countTotalOrganizationDevices(meta: SessionUser) {
    const count = await this.prismaService.device.count({
      where: { organization_id: meta.organization_id },
    });
    return { organizationTotalDevices: count ?? 0 };
  }

  async create(deviceDTO: CreateDeviceDto, organization_id: string) {
    if (!deviceDTO || !organization_id) {
      throw new Error('Invalid data to create device');
    }
    if (deviceDTO.home_id) {
      const home = await this.prismaService.home.findUnique({
        where: {
          id: deviceDTO.home_id,
        },
        select: {
          id: true,
          organization_id: true,
        },
      });
      if (!home || home.organization_id !== organization_id) {
        throw new Error('Home not found in organization');
      }
    }
    const created = await this.prismaService.device.create({
      data: {
        ...deviceDTO,
        organization_id: organization_id,
      },
      select: {
        ...this.prismaDeviceSelect,
        home: { select: { unique_id: true } },
      },
    });
    // ! Update uniqueId - device cache
    if (!created.disabled) {
      await this.cacheService.set(
        'h-device-uniqueid:' + created.unique_id,
        created.id,
      );
      if (created.home_id && created.home) {
        const redisKeyHomeIds = `h-home-id:${created.home_id}:devices-id`;
        await this.cacheService.sAdd(redisKeyHomeIds, created.id);
        const redisKeyHomeUniqueIds = `h-home-uniqueid:${created.home.unique_id}:devices-uniqueid`;
        await this.cacheService.sAdd(redisKeyHomeUniqueIds, created.unique_id);
      }
    }
    return { ok: true, data: created };
  }

  async findAll(optionsDto: DevicePageOptionsDto, meta: SessionUser) {
    const { search, take, page, orderBy, sortOrder } = optionsDto;
    const skip = (page - 1) * take;

    let where: Prisma.DeviceWhereInput = search ? {
      OR: [
        { unique_id: { contains: search, mode: 'insensitive' } },
        { name: { contains: search, mode: 'insensitive' } },
      ],
    } : {};
    if (meta.organization_id) {
      where.organization_id = meta.organization_id;
    }

    const [itemCount, devices] = await this.prismaService.$transaction([
      this.prismaService.device.count({ where }),
      this.prismaService.device.findMany({
        skip,
        take,
        select: {
          ...this.prismaDeviceSelect,
          home: {
            select: {
              unique_id: true,
              name: true,
            },
          },
        },
        where,
        orderBy: orderBy
          ? { [orderBy]: sortOrder }
          : { home: { name: <Prisma.SortOrder>sortOrder } },
      }),
    ]);
    const userPaginatedMeta = new DevicePageMetaDto({
      itemCount,
      pageOptions: optionsDto,
    });
    return { data: devices, meta: userPaginatedMeta };
  }

  async findOne(id: string, meta: SessionUser) {
    return await this.prismaService.device.findUnique({
      where: { id, organization_id: meta.organization_id },
      select: {
        ...this.prismaDeviceSelect,
        home: {
          select: {
            unique_id: true,
            name: true,
          },
        },
        learned_commands: {
          select: {
            id: true,
            name: true,
            command: true,
          },
        },
      },
    });
  }

  async update(id: string, deviceDTO: UpdateDeviceDto | any, meta: SessionUser) {
    try {
      const verifyPermissions = await this.verifyOrganizationDevicesAccess(
        [id],
        meta,
      );
      if (!verifyPermissions.ok) {
        throw new Error('Access denied to delete request devices list');
      }
      const cleanUpdateDevice = this.excludeUndefinedFromDto(deviceDTO); // exclude possible undefined value to avoid conflict prisma
      const { organizationId, ...cleanData } = cleanUpdateDevice;

      const data: Prisma.DeviceUpdateInput = {
        ...cleanData,
      };
      const previous = await this.prismaService.device.findUnique({
        where: { id },
        select: {
          unique_id: true,
          disabled: true,
          id: true,
          home_id: true,
          home: { select: { unique_id: true } },
        },
      });
      const updated = await this.prismaService.device.update({
        data,
        select: {
          ...this.prismaDeviceSelect,
          home: { select: { unique_id: true } },
        },
        where: { id },
      });
      // ? Update uniqueId - device cache
      if (previous && previous.unique_id !== updated.unique_id) {
        if (!previous.disabled) {
          await this.cacheService.del('h-device-uniqueid:' + previous.unique_id);
        }
        if (!updated.disabled) {
          await this.cacheService.set(
            'h-device-uniqueid:' + updated.unique_id,
            updated.id,
          );
        }
      } else {
        if (previous && previous.disabled === false && updated.disabled === true) {
          await this.cacheService.del('h-device-uniqueid:' + previous.unique_id);
        }
        if (previous && previous.disabled === true && updated.disabled === false) {
          await this.cacheService.set(
            'h-device-uniqueid:' + updated.unique_id,
            updated.id,
          );
        }
      }
      if (previous && previous.home_id !== updated.home_id) {
        if (previous.home_id) {
          const redisKeyHomeIds = `h-home-id:${previous.home_id}:devices-id`;
          await this.cacheService.sRem(redisKeyHomeIds, previous.id);
          const redisKeyHomeUniqueIds = `h-home-uniqueid:${previous.home?.unique_id}:devices-uniqueid`;
          await this.cacheService.sRem(redisKeyHomeUniqueIds, previous.unique_id);
        }
        if (updated.home_id) {
          const redisKeyHomeIds = `h-home-id:${updated.home_id}:devices-id`;
          await this.cacheService.sAdd(redisKeyHomeIds, updated.id);
          const redisKeyHomeUniqueIds = `h-home-uniqueid:${updated.home?.unique_id}:devices-uniqueid`;
          await this.cacheService.sAdd(redisKeyHomeUniqueIds, updated.unique_id);
        }
      }
      return { ok: true, data: updated };
    } catch (error) {
      if (error.code === 'P2025') throw new Error('role not found');
      throw new Error(error);
    }
  }

  async delete(id: string, meta: SessionUser) {
    try {
      const verifyPermissions = await this.verifyOrganizationDevicesAccess(
        [id],
        meta,
      );
      if (!verifyPermissions.ok) {
        throw new Error('Access denied to delete request devices list');
      }
      const deleted = await this.prismaService.device.delete({
        where: { id, organization_id: meta.organization_id },
        select: {
          ...this.prismaDeviceSelect,
          home: { select: { unique_id: true } },
        },
      });
      // ? Update uniqueId - device cache
      if (!deleted.disabled) {
        await this.cacheService.del('h-device-uniqueid:' + deleted.unique_id);
      }
      if (deleted.home_id) {
        const redisKeyHomeIds = `h-home-id:${deleted.home_id}:devices-id`;
        await this.cacheService.sRem(redisKeyHomeIds, deleted.id);
        const redisKeyHomeUniqueIds = `h-home-uniqueid:${deleted.home?.unique_id}:devices-uniqueid`;
        await this.cacheService.sRem(redisKeyHomeUniqueIds, deleted.unique_id);
      }
      return { ok: true };
    } catch (error) {
      throw new Error(error);
    }
  }

  async deleteMany(ids: string[], meta: SessionUser) {
    try {
      const verifyPermissions = await this.verifyOrganizationDevicesAccess(
        ids,
        meta,
      );
      if (!verifyPermissions.ok) {
        throw new Error('Access denied to delete request devices list');
      }
      const toDeletedFromCache = await this.prismaService.device.findMany({
        where: {
          id: {
            in: ids,
          },
          organization_id: meta.organization_id,
        },
        select: { unique_id: true, disabled: true, id: true, home_id: true },
      });
      // ! Delete from cache
      await Promise.all(
        toDeletedFromCache.map(async (device) => {
          if (!device.disabled) {
            await this.cacheService.del('h-device-uniqueid:' + device.unique_id);
          }
          if (device.home_id) {
            const redisKeyHomeIds = `h-home-id:${device.home_id}:devices-id`;
            await this.cacheService.sRem(redisKeyHomeIds, device.id);
            const redisKeyHomeUniqueIds = `h-home-uniqueid:${device.home_id}:devices-uniqueid`;
            await this.cacheService.sRem(redisKeyHomeUniqueIds, device.unique_id);
          }
        }),
      );

      await this.prismaService.device.deleteMany({
        where: {
          id: {
            in: ids,
          },
          organization_id: meta.organization_id,
        },
      });
      return { ok: true };
    } catch (error) {
      throw new Error(error);
    }
  }

  async disableMany(ids: string[], meta: SessionUser) {
    try {
      const verifyPermissions = await this.verifyOrganizationDevicesAccess(
        ids,
        meta,
      );
      if (!verifyPermissions.ok) {
        throw new Error('Access denied to delete request devices list');
      }
      const toDeletedFromCache = await this.prismaService.device.findMany({
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
          home_id: true,
          home: { select: { unique_id: true } },
        },
      });
      // ! Delete from cache
      await Promise.all(
        toDeletedFromCache.map(async (device) => {
          if (!device.disabled) {
            await this.cacheService.del('h-device-uniqueid:' + device.unique_id);
          }
          if (device.home_id) {
            const redisKeyHomeIds = `h-home-id:${device.home_id}:devices-id`;
            await this.cacheService.sRem(redisKeyHomeIds, device.id);
            const redisKeyHomeUniqueIds = `h-home-uniqueid:${device.home?.unique_id}:devices-uniqueid`;
            await this.cacheService.sRem(redisKeyHomeUniqueIds, device.unique_id);
          }
        }),
      );
      await this.prismaService.device.updateMany({
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

  async enableMany(ids: string[], meta: SessionUser) {
    try {
      const verifyPermissions = await this.verifyOrganizationDevicesAccess(
        ids,
        meta,
      );
      if (!verifyPermissions.ok) {
        throw new Error('Access denied to delete request devices list');
      }
      const toAddToCache = await this.prismaService.device.findMany({
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
          home_id: true,
          home: { select: { unique_id: true } },
        },
      });
      // ! Add to cache
      await Promise.all(
        toAddToCache.map(async (device) => {
          if (device.disabled) {
            await this.cacheService.set(
              'h-device-uniqueid:' + device.unique_id,
              device.id,
            );
          }
          if (device.home_id) {
            const redisKeyHomeIds = `h-home-id:${device.home_id}:devices-id`;
            await this.cacheService.sAdd(redisKeyHomeIds, device.id);
            const redisKeyHomeUniqueIds = `h-home-uniqueid:${device.home?.unique_id}:devices-uniqueid`;
            await this.cacheService.sAdd(redisKeyHomeUniqueIds, device.unique_id);
          }
        }),
      );

      await this.prismaService.device.updateMany({
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

  async sendCommand({
    commandDTO,
    meta,
  }: {
    commandDTO: CommandDeviceDto;
    meta: SessionUser;
  }) {
    const device = await this.prismaService.device.findUnique({
      where: {
        id: commandDTO.device_id,
        organization_id: meta.organization_id,
        disabled: false,
      },
      select: { unique_id: true, home: { select: { unique_id: true } } },
    });
    if (!device || !device.home) {
      return { ok: false };
    }
    console.log(
      'Send command to device in MQTT: ',
      JSON.stringify(commandDTO.command),
    );
    // Send command to device in MQTT
    this.mqttClient.publish(
      `home/id/${device.home.unique_id}/${device.unique_id}/set`,
      JSON.stringify(commandDTO.command),
      { qos: 1 },
    );
    return { ok: true };
  }

  async createCommand({
    commandDTO,
    meta,
  }: {
    commandDTO: CreateCommandDeviceDto;
    meta: SessionUser;
  }) {
    await this.prismaService.deviceLearnedCommands.create({
      data: {
        name: commandDTO.name,
        command: commandDTO.command,
        device: {
          connect: {
            id: commandDTO.device_id,
          },
        },
      },
    });
    const device = await this.prismaService.device.findUnique({
      where: {
        id: commandDTO.device_id,
        organization_id: meta.organization_id,
        disabled: false,
      },
      select: {
        ...this.prismaDeviceSelect,
        learned_commands: {
          select: {
            id: true,
            name: true,
            command: true,
          },
        },
      },
    });
    return { ok: true, device };
  }

  async updateCommandName({
    id,
    commandDTO,
    meta,
  }: {
    id: string;
    commandDTO: UpdateCommandNameDto;
    meta: SessionUser;
  }) {
    const upt = await this.prismaService.deviceLearnedCommands.update({
      where: {
        id,
        device: {
          organization_id: meta.organization_id,
        },
      },
      data: {
        name: commandDTO.name,
      },
    });
    const device = await this.prismaService.device.findUnique({
      where: {
        id: upt.device_id,
        organization_id: meta.organization_id,
        disabled: false,
      },
      select: {
        ...this.prismaDeviceSelect,
        learned_commands: {
          select: {
            id: true,
            name: true,
            command: true,
          },
        },
      },
    });
    return { ok: true, device };
  }

  async deleteCommand({ id, meta }: { id: string; meta: SessionUser }) {
    const upt = await this.prismaService.deviceLearnedCommands.delete({
      where: {
        id,
        device: {
          organization_id: meta.organization_id,
        },
      },
    });
    const device = await this.prismaService.device.findUnique({
      where: {
        id: upt.device_id,
        organization_id: meta.organization_id,
        disabled: false,
      },
      select: {
        ...this.prismaDeviceSelect,
        learned_commands: {
          select: {
            id: true,
            name: true,
            command: true,
          },
        },
      },
    });
    return { ok: true, device };
  }

  private excludeUndefinedFromDto<Dto>(inputDto: Dto): Dto {
    const dto = { ...inputDto };
    for (const key in dto) if (dto[key] === undefined) delete dto[key];
    return dto;
  }
}
