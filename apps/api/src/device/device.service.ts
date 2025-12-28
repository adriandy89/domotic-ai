import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
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
import { Prisma } from 'generated/prisma/client';
import { CacheService } from '@app/cache';
import { NatsClientService } from '@app/nats-client';

@Injectable()
export class DeviceService {
  private readonly logger = new Logger(DeviceService.name);
  readonly prismaDeviceSelect: Prisma.DeviceSelect = {
    id: true,
    unique_id: true,
    name: true,
    description: true,
    category: true,
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
    private dbService: DbService,
    private readonly natsClient: NatsClientService,
    private readonly cacheService: CacheService,
  ) { }

  async statisticsOrgDevices(organization_id: string) {
    const [countEnabledDevices, countDisabledDevices] = await Promise.all([
      this.dbService.device.count({
        where: { organization_id, disabled: false },
      }),
      this.dbService.device.count({
        where: { organization_id, disabled: true },
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

  async verifyLimitsOrganizationDevices(organization_id: string) {
    const organization = await this.dbService.organization.findUnique({
      where: {
        id: organization_id,
      },
      select: {
        max_devices: true,
      },
    });
    if (!organization) {
      throw new Error('Organization not found');
    }
    const totalDevices = await this.dbService.device.count({
      where: { organization_id },
    });
    if (totalDevices >= organization.max_devices) return { ok: false, message: 'Max devices limit reached' };
    return { ok: true };
  }


  async create(deviceDTO: CreateDeviceDto, organization_id: string) {
    const verifyLimits = await this.verifyLimitsOrganizationDevices(organization_id);
    if (!verifyLimits.ok) throw new BadRequestException(verifyLimits.message);

    if (deviceDTO.home_id) {
      const home = await this.dbService.home.findUnique({
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
    const created = await this.dbService.device.create({
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
      // await this.cacheService.set(
      //   'h-device-uniqueid:' + created.unique_id,
      //   created.id,
      // );
      // if (created.home_id && created.home) {
      //   const redisKeyHomeIds = `h-home-id:${created.home_id}:devices-id`;
      //   await this.cacheService.sAdd(redisKeyHomeIds, created.id);
      //   const redisKeyHomeUniqueIds = `h-home-uniqueid:${created.home.unique_id}:devices-uniqueid`;
      //   await this.cacheService.sAdd(redisKeyHomeUniqueIds, created.unique_id);
      // }
    }
    return { ok: true, data: created };
  }

  async update(id: string, deviceDTO: UpdateDeviceDto, organization_id: string) {
    try {
      const verifyPermissions = await this.verifyOrganizationDevicesAccess(
        [id],
        organization_id,
      );
      if (!verifyPermissions.ok) {
        throw new Error('Access denied to update request devices');
      }
      const data: Prisma.DeviceUpdateInput = {
        ...deviceDTO,
      };
      const previous = await this.dbService.device.findUnique({
        where: { id },
        select: {
          unique_id: true,
          disabled: true,
          id: true,
          home_id: true,
          home: { select: { unique_id: true } },
        },
      });
      const updated = await this.dbService.device.update({
        data,
        select: {
          ...this.prismaDeviceSelect,
          home: { select: { unique_id: true } },
        },
        where: { id },
      });
      // ? Update uniqueId - device cache
      if (previous && previous.unique_id !== updated.unique_id) {
        //   if (!previous.disabled) {
        //     await this.cacheService.del('h-device-uniqueid:' + previous.unique_id);
        //   }
        //   if (!updated.disabled) {
        //     await this.cacheService.set(
        //       'h-device-uniqueid:' + updated.unique_id,
        //       updated.id,
        //     );
        //   }
        // } else {
        //   if (previous && previous.disabled === false && updated.disabled === true) {
        //     await this.cacheService.del('h-device-uniqueid:' + previous.unique_id);
        //   }
        //   if (previous && previous.disabled === true && updated.disabled === false) {
        //     await this.cacheService.set(
        //       'h-device-uniqueid:' + updated.unique_id,
        //       updated.id,
        //     );
        //   }
      }
      if (previous && previous.home_id !== updated.home_id) {
        // if (previous.home_id) {
        //   const redisKeyHomeIds = `h-home-id:${previous.home_id}:devices-id`;
        //   await this.cacheService.sRem(redisKeyHomeIds, previous.id);
        //   const redisKeyHomeUniqueIds = `h-home-uniqueid:${previous.home?.unique_id}:devices-uniqueid`;
        //   await this.cacheService.sRem(redisKeyHomeUniqueIds, previous.unique_id);
        // }
        // if (updated.home_id) {
        //   const redisKeyHomeIds = `h-home-id:${updated.home_id}:devices-id`;
        //   await this.cacheService.sAdd(redisKeyHomeIds, updated.id);
        //   const redisKeyHomeUniqueIds = `h-home-uniqueid:${updated.home?.unique_id}:devices-uniqueid`;
        //   await this.cacheService.sAdd(redisKeyHomeUniqueIds, updated.unique_id);
        // }
      }
      return { ok: true, data: updated };
    } catch (error) {
      if (error.code === 'P2025') throw new Error('role not found');
      throw new Error(error);
    }
  }

  async delete(id: string, organization_id: string) {
    try {
      const verifyPermissions = await this.verifyOrganizationDevicesAccess(
        [id],
        organization_id,
      );
      if (!verifyPermissions.ok) {
        throw new Error('Access denied to delete request devices list');
      }
      await this.dbService.device.delete({
        where: { id, organization_id },
      });
      // ? Update uniqueId - device cache
      // if (!deleted.disabled) {
      //   await this.cacheService.del('h-device-uniqueid:' + deleted.unique_id);
      // }
      // if (deleted.home_id) {
      //   const redisKeyHomeIds = `h-home-id:${deleted.home_id}:devices-id`;
      //   await this.cacheService.sRem(redisKeyHomeIds, deleted.id);
      //   const redisKeyHomeUniqueIds = `h-home-uniqueid:${deleted.home?.unique_id}:devices-uniqueid`;
      //   await this.cacheService.sRem(redisKeyHomeUniqueIds, deleted.unique_id);
      // }
      return { ok: true };
    } catch (error) {
      throw new Error(error);
    }
  }

  async findAllByHomeId(home_id: string, organization_id: string) {
    return await this.dbService.device.findMany({
      where: { home_id, organization_id },
      select: {
        ...this.prismaDeviceSelect,
        home: { select: { unique_id: true } },
      },
    });
  }

  async findByUniqueId(unique_id: string, organization_id: string) {
    return await this.dbService.device.findUnique({
      where: {
        unique_id_organization_id: {
          unique_id,
          organization_id,
        },
      },
      select: {
        ...this.prismaDeviceSelect,
        home: { select: { unique_id: true } },
      },
    });
  }

  async findAll(optionsDto: DevicePageOptionsDto, organization_id: string) {
    const { search, take, page, orderBy, sortOrder } = optionsDto;
    const skip = (page - 1) * take;

    let where: Prisma.DeviceWhereInput = search ? {
      OR: [
        { unique_id: { contains: search, mode: 'insensitive' } },
        { name: { contains: search, mode: 'insensitive' } },
      ],
    } : {};
    where.organization_id = organization_id;

    const [itemCount, devices] = await this.dbService.$transaction([
      this.dbService.device.count({ where }),
      this.dbService.device.findMany({
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

  async findOne(id: string, organization_id: string) {
    return await this.dbService.device.findUnique({
      where: { id, organization_id },
      select: {
        ...this.prismaDeviceSelect,
        attributes: true,
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

  async disableMany(ids: string[], organization_id: string) {
    try {
      const verifyPermissions = await this.verifyOrganizationDevicesAccess(
        ids,
        organization_id,
      );
      if (!verifyPermissions.ok) {
        throw new Error('Access denied to delete request devices list');
      }
      const toDeletedFromCache = await this.dbService.device.findMany({
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
          home_id: true,
          home: { select: { unique_id: true } },
        },
      });
      // ! Delete from cache
      // await Promise.all(
      //   toDeletedFromCache.map(async (device) => {
      //     if (!device.disabled) {
      //       await this.cacheService.del('h-device-uniqueid:' + device.unique_id);
      //     }
      //     if (device.home_id) {
      //       const redisKeyHomeIds = `h-home-id:${device.home_id}:devices-id`;
      //       await this.cacheService.sRem(redisKeyHomeIds, device.id);
      //       const redisKeyHomeUniqueIds = `h-home-uniqueid:${device.home?.unique_id}:devices-uniqueid`;
      //       await this.cacheService.sRem(redisKeyHomeUniqueIds, device.unique_id);
      //     }
      //   }),
      // );
      await this.dbService.device.updateMany({
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
      const verifyPermissions = await this.verifyOrganizationDevicesAccess(
        ids,
        organization_id,
      );
      if (!verifyPermissions.ok) {
        throw new Error('Access denied to delete request devices list');
      }
      const toAddToCache = await this.dbService.device.findMany({
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
          home_id: true,
          home: { select: { unique_id: true } },
        },
      });
      // ! Add to cache
      // await Promise.all(
      //   toAddToCache.map(async (device) => {
      //     if (device.disabled) {
      //       await this.cacheService.set(
      //         'h-device-uniqueid:' + device.unique_id,
      //         device.id,
      //       );
      //     }
      //     if (device.home_id) {
      //       const redisKeyHomeIds = `h-home-id:${device.home_id}:devices-id`;
      //       await this.cacheService.sAdd(redisKeyHomeIds, device.id);
      //       const redisKeyHomeUniqueIds = `h-home-uniqueid:${device.home?.unique_id}:devices-uniqueid`;
      //       await this.cacheService.sAdd(redisKeyHomeUniqueIds, device.unique_id);
      //     }
      //   }),
      // );

      await this.dbService.device.updateMany({
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

  async sendCommand({
    commandDTO,
    organization_id,
  }: {
    commandDTO: CommandDeviceDto;
    organization_id: string;
  }) {
    const device = await this.dbService.device.findUnique({
      where: {
        id: commandDTO.device_id,
        organization_id,
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
    return await this.natsClient.sendMessage<
      { ok: boolean },
      { homeUniqueId: string; deviceUniqueId: string; command: any }
    >('mqtt-core.publish-command', {
      homeUniqueId: device.home.unique_id,
      deviceUniqueId: device.unique_id,
      command: commandDTO.command,
    });
  }

  async createCommand({
    commandDTO,
    organization_id,
  }: {
    commandDTO: CreateCommandDeviceDto;
    organization_id: string;
  }) {
    const verifyPermissions = await this.verifyOrganizationDevicesAccess(
      [commandDTO.device_id],
      organization_id,
    );
    if (!verifyPermissions.ok) {
      throw new Error('Access denied to create command');
    }
    await this.dbService.deviceLearnedCommands.create({
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
    const device = await this.dbService.device.findUnique({
      where: {
        id: commandDTO.device_id,
        organization_id,
      },
      select: {
        ...this.prismaDeviceSelect,
        attributes: true,
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
    organization_id,
  }: {
    id: string;
    commandDTO: UpdateCommandNameDto;
    organization_id: string;
  }) {
    const upt = await this.dbService.deviceLearnedCommands.update({
      where: {
        id,
        device: {
          organization_id,
        },
      },
      data: {
        name: commandDTO.name,
      },
      select: {
        device_id: true,
      }
    });
    const device = await this.dbService.device.findUnique({
      where: {
        id: upt.device_id,
        organization_id,
      },
      select: {
        ...this.prismaDeviceSelect,
        attributes: true,
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

  async deleteCommand({ id, organization_id }: { id: string; organization_id: string }) {
    const upt = await this.dbService.deviceLearnedCommands.delete({
      where: {
        id,
        device: {
          organization_id,
        },
      },
    });
    const device = await this.dbService.device.findUnique({
      where: {
        id: upt.device_id,
        organization_id,
      },
      select: {
        ...this.prismaDeviceSelect,
        attributes: true,
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

  // ! Last Data
  async findLastDeviceDataCurrentUser(user_id: string, organization_id: string) {
    const homes = await this.dbService.home.findMany({
      where: {
        organization_id,
        users: {
          some: {
            user_id,
          },
        },
      },
      select: {
        id: true,
        devices: {
          select: {
            id: true,
          },
        },
      },
    });
    const devices = homes.map(home => home.devices).flat();
    const lastData = await this.dbService.sensorDataLast.findMany({
      where: {
        device_id: {
          in: devices.map(device => device.id),
        },
      },
      select: {
        device_id: true,
        timestamp: true,
        data: true,
      },
    });
    return { ok: true, lastData };
  }

}
