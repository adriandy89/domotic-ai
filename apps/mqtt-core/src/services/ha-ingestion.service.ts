import { DbService } from '@app/db';
import {
  applyValueTemplate,
  deriveEntities,
  DeviceProtocol,
  getAdapter,
  HaDeviceAttributes,
  isHaProtocol,
  synthesizeConfig,
  transformAggregateState,
} from '@app/models';
import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from 'generated/prisma/client';
import { DeviceRegistryService } from './device-registry.service';
import { HomeRegistryService } from './home-registry.service';
import { SensorIngestionService } from './sensor-ingestion.service';

/**
 * Home Assistant MQTT Discovery ingestion (Z-Wave / WiFi / BLE): discovery
 * configs, the state-topic index they build, and the per-entity / aggregate
 * state messages decoded through their value_templates.
 */
@Injectable()
export class HaIngestionService {
  private readonly logger = new Logger(HaIngestionService.name);

  /**
   * HA-Discovery state-topic → device index, built from retained discovery
   * messages. Z-Wave/WiFi/BLE entities publish state on arbitrary topics declared
   * in their discovery config, so we can't map them to a device by topic position
   * (as Zigbee does). Rebuilt automatically on reconnect from retained configs.
   */
  private readonly haStateIndex = new Map<
    string,
    { deviceId: string; property: string; valueTemplate?: string }
  >();

  /** Devices/properties already warned about an unapplied value_template. */
  private readonly templateFallbackWarned = new Set<string>();

  constructor(
    private readonly dbService: DbService,
    private readonly homeRegistry: HomeRegistryService,
    private readonly deviceRegistry: DeviceRegistryService,
    private readonly sensorIngestion: SensorIngestionService,
  ) {}

  // ── HA-Discovery (zwave/wifi/ble) ──────────────────────────────────────────
  async handleHaDiscovery(
    homeUniqueId: string,
    rest: string[],
    bufferMsg: Buffer,
  ) {
    // rest = [<component>, (<node_id>)?, <object_id>, 'config']
    if (rest[rest.length - 1] !== 'config') return;

    const str = bufferMsg.toString().replace(/\u0000/g, '');
    if (!str.trim()) return; // cleared/retained-null = entity removed (no-op)

    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(str);
    } catch (err) {
      this.logger.error(`Failed to parse HA discovery config: ${err}`);
      return;
    }

    // Any HA protocol key resolves to the shared HA-Discovery adapter.
    const adapter = getAdapter(DeviceProtocol.WIFI);
    const discovered = adapter.parseDiscovery({ topicParts: rest, payload });
    if (!discovered) return;

    // The protocol MUST come from the route (inferred from the entity topics) —
    // never defaulted. If it couldn't be inferred, do nothing but warn.
    const protocol = discovered.protocol;
    if (!protocol) {
      this.logger.warn(
        `HA discovery ignored: protocol not inferable from entity topics — uniqueId=${discovered.uniqueId} home=${homeUniqueId}`,
      );
      return;
    }

    const home = await this.dbService.home.findUnique({
      where: { unique_id: homeUniqueId, disabled: false },
      select: { id: true, organization_id: true },
    });
    if (!home) {
      this.logger.error(`HA discovery: home not found = ${homeUniqueId}`);
      return;
    }
    const existing = await this.dbService.device.findUnique({
      where: {
        unique_id_organization_id: {
          organization_id: home.organization_id,
          unique_id: discovered.uniqueId,
        },
      },
      select: { id: true, attributes: true },
    });

    const mergeWith = (attrs: unknown) =>
      adapter.mergeDiscovery
        ? adapter.mergeDiscovery(attrs, discovered)
        : discovered.attributes;

    let deviceId: string;
    let finalAttributes: unknown;
    if (existing) {
      finalAttributes = mergeWith(existing.attributes);
      await this.dbService.device.update({
        where: { id: existing.id },
        data: {
          model: discovered.model,
          protocol,
          attributes: finalAttributes as Prisma.InputJsonValue,
        },
      });
      deviceId = existing.id;
    } else {
      if (
        !(await this.deviceRegistry.hasDeviceQuota(
          home.organization_id,
          discovered.uniqueId,
        ))
      )
        return;
      try {
        // WiFi native firmware is plug&play (enabled immediately); zwave/ble are
        // bridge-discovered and stay disabled until enabled in the dashboard.
        const created = await this.dbService.device.create({
          data: {
            unique_id: discovered.uniqueId,
            name: discovered.name,
            model: discovered.model,
            protocol,
            attributes: discovered.attributes as Prisma.InputJsonValue,
            home_id: home.id,
            organization_id: home.organization_id,
            disabled: protocol !== DeviceProtocol.WIFI,
          },
          select: { id: true },
        });
        deviceId = created.id;
        finalAttributes = discovered.attributes;
      } catch (err) {
        // Lost the create race with the aggregate-state path (retained config + state
        // arrive together): re-fetch and merge instead of erroring.
        if ((err as { code?: string })?.code !== 'P2002') throw err;
        const now = await this.dbService.device.findUnique({
          where: {
            unique_id_organization_id: {
              organization_id: home.organization_id,
              unique_id: discovered.uniqueId,
            },
          },
          select: { id: true, attributes: true },
        });
        if (!now) return;
        finalAttributes = mergeWith(now.attributes);
        await this.dbService.device.update({
          where: { id: now.id },
          data: {
            model: discovered.model,
            protocol,
            attributes: finalAttributes as Prisma.InputJsonValue,
          },
        });
        deviceId = now.id;
      }
    }

    this.indexHaStateTopics(deviceId, finalAttributes);
  }

  /**
   * Register each entity's state_topic so its state messages resolve to this device.
   * Only topics owned by a *single* entity are indexed (classic per-entity discovery):
   * the raw payload maps 1:1 to that property. A topic shared by ≥2 entities is a
   * device-based config whose components share one JSON `~/state`; it is left
   * unindexed so {@link handleHaAggregateState} ingests the whole object and maps
   * every field, instead of stuffing the full JSON under a single property.
   */
  private indexHaStateTopics(deviceId: string, attributes: unknown) {
    const attrs = attributes as HaDeviceAttributes | undefined;
    if (!attrs || attrs.source !== 'hadiscovery' || !attrs.config) return;
    const entities = deriveEntities(attrs.config);

    const ownerCount = new Map<string, number>();
    for (const entity of entities) {
      if (entity.stateTopic) {
        ownerCount.set(
          entity.stateTopic,
          (ownerCount.get(entity.stateTopic) ?? 0) + 1,
        );
      }
    }

    for (const entity of entities) {
      if (!entity.stateTopic) continue;
      if (ownerCount.get(entity.stateTopic) === 1) {
        this.haStateIndex.set(entity.stateTopic, {
          deviceId,
          property: entity.property,
          valueTemplate: entity.valueTemplate,
        });
      } else {
        // Shared topic → aggregate ingestion; drop any stale single-owner entry.
        this.haStateIndex.delete(entity.stateTopic);
      }
    }
  }

  // ── HA state ───────────────────────────────────────────────────────────────
  async handleHaState(topic: string, homeUniqueId: string, bufferMsg: Buffer) {
    const entry = this.haStateIndex.get(topic);
    if (!entry) {
      // No per-entity discovery for this topic. If it's the canonical aggregate
      // shape `home/id/{uuid}/{protocol}/{deviceId}/state`, auto-register from the
      // payload (like Zigbee); otherwise ignore.
      const parts = topic.split('/');
      if (parts.length === 6 && parts[5] === 'state') {
        return this.handleHaAggregateState(
          homeUniqueId,
          parts[3],
          parts[4],
          bufferMsg,
        );
      }
      return;
    }

    const raw = bufferMsg.toString().replace(/\u0000/g, '');
    let value: unknown;
    let valueJson: unknown;
    try {
      valueJson = JSON.parse(raw);
      value = valueJson;
    } catch {
      value = raw; // plain string state (e.g. "ON")
    }

    // Decode through the entity's value_template (HA semantics: the rendered
    // result is the state). Falls back to the raw value, never throws.
    if (entry.valueTemplate) {
      value = applyValueTemplate(entry.valueTemplate, {
        value: raw,
        value_json: valueJson,
      });
    }

    const device = await this.dbService.device.findUnique({
      where: { id: entry.deviceId },
      select: {
        id: true,
        name: true,
        disabled: true,
        online: true,
        conditions: { select: { rule_id: true } },
      },
    });
    if (!device || device.disabled) return;

    await this.sensorIngestion.ingestSensorData(
      device,
      { [entry.property]: value },
      homeUniqueId,
    );
  }

  // ── HA aggregate state (single JSON payload, no per-entity discovery) ───────
  /**
   * Handles an HA-protocol device that publishes its whole state as one JSON object
   * on `home/id/{uuid}/{protocol}/{deviceId}/state`. Mirrors the Zigbee state path:
   * resolve-or-auto-register the device, then ingest the full payload. A later
   * HA-Discovery `config` enriches the same device via {@link handleHaDiscovery}.
   */
  private async handleHaAggregateState(
    homeUniqueId: string,
    protocol: string,
    deviceUniqueId: string,
    bufferMsg: Buffer,
  ) {
    // The protocol MUST come from the topic route — never defaulted. If the route
    // segment isn't a known HA protocol, do nothing but warn.
    if (!isHaProtocol(protocol)) {
      this.logger.warn(
        `Aggregate state ignored: unknown protocol "${protocol}" — home=${homeUniqueId} device=${deviceUniqueId}`,
      );
      return;
    }

    const raw = bufferMsg
      .toString()
      .replace(new RegExp(String.fromCharCode(0), 'g'), '');
    let message: unknown;
    try {
      message = JSON.parse(raw);
    } catch (err) {
      this.logger.error(
        `Failed to parse aggregate state for device=${deviceUniqueId} home=${homeUniqueId}: ${err}`,
      );
      return;
    }
    if (!message || typeof message !== 'object') {
      this.logger.error(
        `Invalid aggregate state (not an object) for device=${deviceUniqueId} home=${homeUniqueId}`,
      );
      return;
    }

    const organizationId =
      await this.homeRegistry.resolveHomeOrgId(homeUniqueId);
    if (!organizationId) {
      this.logger.error(`Not Found Organization ID for home = ${homeUniqueId}`);
      return;
    }

    const stateTopic = `home/id/${homeUniqueId}/${protocol}/${deviceUniqueId}/state`;

    const existingDevice = await this.dbService.device.findUnique({
      where: {
        unique_id_organization_id: {
          organization_id: organizationId,
          unique_id: deviceUniqueId,
        },
      },
      select: {
        id: true,
        name: true,
        disabled: true,
        online: true,
        protocol: true,
        attributes: true,
        conditions: { select: { rule_id: true } },
      },
    });

    // Self-heal: a device created earlier with the wrong protocol (e.g. the DB
    // default) is corrected from the route here, and its attributes backfilled.
    if (existingDevice && existingDevice.protocol !== protocol) {
      const needsAttrs =
        (existingDevice.attributes as HaDeviceAttributes | null)?.source !==
        'hadiscovery';
      await this.dbService.device.update({
        where: { id: existingDevice.id },
        data: {
          protocol,
          ...(needsAttrs && {
            attributes: {
              source: 'hadiscovery',
              protocol,
              config: synthesizeConfig(
                deviceUniqueId,
                stateTopic,
                message as Record<string, unknown>,
              ),
            } as unknown as Prisma.InputJsonValue,
          }),
        },
      });
      this.logger.log(
        `Reconciled protocol for device=${deviceUniqueId} home=${homeUniqueId}: ${existingDevice.protocol} -> ${protocol}`,
      );
    }

    const device =
      existingDevice ??
      (await this.deviceRegistry.autoRegisterDevice({
        homeUniqueId,
        deviceUniqueId,
        organizationId,
        protocol,
        stateTopic,
        statePayload: message as Record<string, unknown>,
      }));

    if (!device?.id) return;
    if (device.disabled) {
      this.logger.warn(
        `Device = ${deviceUniqueId} for home = ${homeUniqueId} is disabled`,
      );
      return;
    }

    // Decode the payload through the device's discovery value_templates (HA
    // semantics: each component's state is the rendered template) before
    // ingesting. Auto-registered/synthesized configs declare identity templates,
    // so devices without a real discovery config pass through unchanged.
    let outMessage = message as Record<string, unknown>;
    const attrs = existingDevice?.attributes as HaDeviceAttributes | null;
    if (attrs?.source === 'hadiscovery' && attrs.config) {
      try {
        outMessage = transformAggregateState(
          outMessage,
          deriveEntities(attrs.config),
          stateTopic,
          raw,
          (property, template) =>
            this.warnTemplateFallbackOnce(device.id, property, template),
        );
      } catch (err) {
        this.logger.warn(
          `HA state transform failed for device=${deviceUniqueId} home=${homeUniqueId}: ${err}`,
        );
        outMessage = message as Record<string, unknown>;
      }
    }

    await this.sensorIngestion.ingestSensorData(
      device,
      outMessage,
      homeUniqueId,
    );
  }

  /** Warn once per device/property when a value_template can't be honored. */
  private warnTemplateFallbackOnce(
    deviceId: string,
    property: string,
    template: string,
  ) {
    const key = `${deviceId}:${property}`;
    if (this.templateFallbackWarned.has(key)) {
      this.logger.debug(
        `value_template fallback (repeat) device=${deviceId} property=${property}`,
      );
      return;
    }
    this.templateFallbackWarned.add(key);
    this.logger.warn(
      `value_template not applied for device=${deviceId} property=${property}; storing raw value (${template})`,
    );
  }
}
