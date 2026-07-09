import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DbService } from '@app/db';
import { Prisma } from 'generated/prisma/client';
import {
  CreateApplianceMonitorDto,
  UpdateApplianceMonitorDto,
} from '@app/models';
import { EdgeSyncNotifier } from '../edge/edge-sync.notifier';

const DEFAULTS = {
  power_field: 'power',
  appliance_type: 'washing_machine',
  run_threshold_w: 10,
  idle_threshold_w: 2,
  min_run_seconds: 30,
  min_finish_seconds: 120,
};

@Injectable()
export class ApplianceMonitorService {
  private readonly logger = new Logger(ApplianceMonitorService.name);

  private readonly select: Prisma.ApplianceMonitorSelect = {
    id: true,
    name: true,
    source_device_id: true,
    source_device_unique_id: true,
    power_field: true,
    appliance_unique_id: true,
    appliance_type: true,
    run_threshold_w: true,
    idle_threshold_w: true,
    min_run_seconds: true,
    min_finish_seconds: true,
    active: true,
    home_id: true,
    home_unique_id: true,
    created_at: true,
    updated_at: true,
    source_device: { select: { id: true, name: true, unique_id: true } },
  };

  constructor(
    private readonly db: DbService,
    private readonly edgeSync: EdgeSyncNotifier,
  ) {}

  async create(dto: CreateApplianceMonitorDto, organizationId: string) {
    const home = await this.requireHome(dto.home_id, organizationId);
    const plug = await this.requireDevice(dto.source_device_id, organizationId);

    const runW = dto.run_threshold_w ?? DEFAULTS.run_threshold_w;
    const idleW = dto.idle_threshold_w ?? DEFAULTS.idle_threshold_w;
    this.assertThresholds(runW, idleW);

    // Collision-proof derived id (fix: never reuse the source name), then confirm
    // no real device already owns it in this organization.
    const applianceUniqueId = `apmon-${randomUUID()}`;
    await this.assertNoDeviceCollision(applianceUniqueId, organizationId);

    const created = await this.db.applianceMonitor.create({
      data: {
        name: dto.name,
        home: { connect: { id: home.id } },
        home_unique_id: home.unique_id,
        source_device: { connect: { id: plug.id } },
        source_device_unique_id: plug.unique_id,
        appliance_unique_id: applianceUniqueId,
        appliance_type: dto.appliance_type ?? DEFAULTS.appliance_type,
        power_field: dto.power_field ?? DEFAULTS.power_field,
        run_threshold_w: runW,
        idle_threshold_w: idleW,
        min_run_seconds: dto.min_run_seconds ?? DEFAULTS.min_run_seconds,
        min_finish_seconds:
          dto.min_finish_seconds ?? DEFAULTS.min_finish_seconds,
        active: dto.active ?? true,
      },
      select: this.select,
    });
    await this.edgeSync.notifyByHomeId(home.id);
    return created;
  }

  async update(
    id: string,
    dto: UpdateApplianceMonitorDto,
    organizationId: string,
  ) {
    const existing = await this.requireMonitor(id, organizationId);

    // Re-point to a different plug/home only within the same organization.
    const home = dto.home_id
      ? await this.requireHome(dto.home_id, organizationId)
      : null;
    const plug = dto.source_device_id
      ? await this.requireDevice(dto.source_device_id, organizationId)
      : null;

    const runW = dto.run_threshold_w ?? Number(existing.run_threshold_w);
    const idleW = dto.idle_threshold_w ?? Number(existing.idle_threshold_w);
    this.assertThresholds(runW, idleW);

    const updated = await this.db.applianceMonitor.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(home
          ? {
              home: { connect: { id: home.id } },
              home_unique_id: home.unique_id,
            }
          : {}),
        ...(plug
          ? {
              source_device: { connect: { id: plug.id } },
              source_device_unique_id: plug.unique_id,
            }
          : {}),
        ...(dto.appliance_type !== undefined
          ? { appliance_type: dto.appliance_type }
          : {}),
        ...(dto.power_field !== undefined
          ? { power_field: dto.power_field }
          : {}),
        ...(dto.run_threshold_w !== undefined
          ? { run_threshold_w: dto.run_threshold_w }
          : {}),
        ...(dto.idle_threshold_w !== undefined
          ? { idle_threshold_w: dto.idle_threshold_w }
          : {}),
        ...(dto.min_run_seconds !== undefined
          ? { min_run_seconds: dto.min_run_seconds }
          : {}),
        ...(dto.min_finish_seconds !== undefined
          ? { min_finish_seconds: dto.min_finish_seconds }
          : {}),
        ...(dto.active !== undefined ? { active: dto.active } : {}),
      },
      select: this.select,
    });
    // Re-sync both the old and (if changed) the new home.
    await this.edgeSync.notifyByHomeId(existing.home_id);
    if (home && home.id !== existing.home_id) {
      await this.edgeSync.notifyByHomeId(home.id);
    }
    return updated;
  }

  async toggle(id: string, active: boolean, organizationId: string) {
    const existing = await this.requireMonitor(id, organizationId);
    const updated = await this.db.applianceMonitor.update({
      where: { id },
      data: { active },
      select: this.select,
    });
    await this.edgeSync.notifyByHomeId(existing.home_id);
    return updated;
  }

  async delete(id: string, organizationId: string) {
    const existing = await this.requireMonitor(id, organizationId);
    await this.db.applianceMonitor.delete({ where: { id } });
    await this.edgeSync.notifyByHomeId(existing.home_id);
    return { ok: true };
  }

  async findAll(organizationId: string, homeId?: string) {
    return this.db.applianceMonitor.findMany({
      where: {
        home: { organization_id: organizationId },
        ...(homeId ? { home_id: homeId } : {}),
      },
      select: this.select,
      orderBy: { created_at: 'desc' },
    });
  }

  async findOne(id: string, organizationId: string) {
    const found = await this.db.applianceMonitor.findFirst({
      where: { id, home: { organization_id: organizationId } },
      select: this.select,
    });
    if (!found) throw new NotFoundException('Appliance monitor not found');
    return found;
  }

  // ── helpers ─────────────────────────────────────────────────────────────────

  private assertThresholds(runW: number, idleW: number): void {
    if (idleW >= runW) {
      throw new BadRequestException(
        'idle_threshold_w must be strictly less than run_threshold_w (hysteresis band).',
      );
    }
  }

  private async assertNoDeviceCollision(
    uniqueId: string,
    organizationId: string,
  ): Promise<void> {
    const clash = await this.db.device.findFirst({
      where: { unique_id: uniqueId, organization_id: organizationId },
      select: { id: true },
    });
    if (clash) {
      throw new BadRequestException(
        `A device with unique_id "${uniqueId}" already exists in this organization.`,
      );
    }
  }

  private async requireHome(homeId: string, organizationId: string) {
    const home = await this.db.home.findFirst({
      where: { id: homeId, organization_id: organizationId },
      select: { id: true, unique_id: true },
    });
    if (!home) throw new NotFoundException('Home not found');
    return home;
  }

  private async requireDevice(deviceId: string, organizationId: string) {
    const device = await this.db.device.findFirst({
      where: { id: deviceId, organization_id: organizationId },
      select: { id: true, unique_id: true },
    });
    if (!device) throw new NotFoundException('Source device not found');
    return device;
  }

  private async requireMonitor(id: string, organizationId: string) {
    const monitor = await this.db.applianceMonitor.findFirst({
      where: { id, home: { organization_id: organizationId } },
      select: {
        id: true,
        home_id: true,
        run_threshold_w: true,
        idle_threshold_w: true,
      },
    });
    if (!monitor) throw new NotFoundException('Appliance monitor not found');
    return monitor;
  }
}
