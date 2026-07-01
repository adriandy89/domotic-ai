import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
  EdgeBundle,
  SignedEdgeBundle,
  verifyBundle,
} from '../vendor/rules-evaluator';
import { EDGE_CONFIG, EdgeConfig } from '../config';
import { MqttService } from '../mqtt/mqtt.service';
import { SqliteService } from '../store/sqlite.service';
import { RulesStoreService } from '../rules/rules-store.service';
import { SchedulesService } from '../schedules/schedules.service';

/**
 * Keeps the local rules bundle in sync with central. Primary path: the retained,
 * HMAC-signed bundle on `home/id/{uuid}/edge/rules` (delivered by the mosquitto
 * bridge, latest-always). Fallback: an HTTP pull at boot for the initial load or
 * when MQTT hasn't delivered yet.
 */
@Injectable()
export class SyncService implements OnModuleInit {
  private readonly logger = new Logger(SyncService.name);

  constructor(
    @Inject(EDGE_CONFIG) private readonly config: EdgeConfig,
    private readonly mqtt: MqttService,
    private readonly sqlite: SqliteService,
    private readonly store: RulesStoreService,
    private readonly schedules: SchedulesService,
  ) {}

  onModuleInit(): void {
    this.mqtt.onMessage((topic, payload) => {
      if (topic === this.config.rulesSyncTopic) this.onRetained(payload);
    });
    this.mqtt.subscribe(this.config.rulesSyncTopic);

    // If we have no bundle yet, try an initial HTTP pull (bridge/internet permitting).
    if (this.store.version === 0) {
      void this.pull();
    }
  }

  private onRetained(payload: Buffer): void {
    if (payload.length === 0) return; // retained clear
    try {
      const signed = JSON.parse(payload.toString()) as SignedEdgeBundle;
      this.apply(signed, 'mqtt');
    } catch (e: any) {
      this.logger.error(`Invalid retained bundle: ${e?.message}`);
    }
  }

  /** HTTP fallback: GET the signed bundle from central. */
  async pull(): Promise<void> {
    if (!this.config.centralApiUrl) return;
    const url = `${this.config.centralApiUrl}/api/v1/edge/rules/${this.config.homeUniqueId}`;
    try {
      const res = await fetch(url, {
        headers: { 'X-Edge-Token': this.config.edgeAuthToken },
      });
      if (!res.ok) {
        this.logger.warn(`Bundle pull ${url} → HTTP ${res.status}`);
        return;
      }
      this.apply((await res.json()) as SignedEdgeBundle, 'http');
    } catch (e: any) {
      this.logger.warn(`Bundle pull failed (offline?): ${e?.message}`);
    }
  }

  private apply(signed: SignedEdgeBundle, via: 'mqtt' | 'http'): void {
    if (!verifyBundle(signed, this.config.edgeAuthToken)) {
      this.logger.error(`Rejected bundle (${via}): bad HMAC signature`);
      return;
    }
    const bundle: EdgeBundle = signed.bundle;
    if (bundle.homeUniqueId !== this.config.homeUniqueId) {
      this.logger.error(`Rejected bundle (${via}): wrong home`);
      return;
    }
    if (bundle.version <= this.store.version) {
      this.logger.verbose(`Ignoring bundle v${bundle.version} (not newer)`);
      return;
    }

    this.sqlite.saveBundle(bundle);
    this.store.setBundle(bundle);
    this.schedules.reload();
    this.logger.log(
      `Applied bundle v${bundle.version} via ${via}: ${bundle.rules.length} rules, ${bundle.schedules.length} schedules`,
    );
  }
}
