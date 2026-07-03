import { DbService } from '@app/db';
import { buildSignedEdgeBundle, deriveEdgeToken } from '@app/edge-bundle';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MqttClient } from 'mqtt';

/**
 * Publishes the retained, HMAC-signed offline rules bundle to
 * `home/id/{uniqueId}/edge/rules`. Retained + QoS1 so an edge that (re)connects
 * through the mosquitto bridge always receives the latest version.
 */
@Injectable()
export class EdgeBundlePublisherService {
  private readonly logger = new Logger(EdgeBundlePublisherService.name);
  private readonly masterSecret: string;

  constructor(
    private readonly dbService: DbService,
    private readonly config: ConfigService,
    @Inject('MQTT_CLIENT') private readonly mqttClient: MqttClient,
  ) {
    this.masterSecret = this.config.get<string>('EDGE_SIGNING_SECRET', '');
  }

  async publish(homeUniqueId: string): Promise<void> {
    if (!this.masterSecret) {
      this.logger.warn(
        'EDGE_SIGNING_SECRET not set; skipping edge bundle publish',
      );
      return;
    }
    // Sign with the home's derived token (the same value the edge holds).
    const token = deriveEdgeToken(this.masterSecret, homeUniqueId);
    const signed = await buildSignedEdgeBundle(
      this.dbService,
      homeUniqueId,
      token,
    );
    if (!signed) {
      this.logger.warn(`Home ${homeUniqueId} not found; no bundle published`);
      return;
    }

    const topic = `home/id/${homeUniqueId}/edge/rules`;
    this.mqttClient.publish(
      topic,
      JSON.stringify(signed),
      { qos: 1, retain: true },
      (err) => {
        if (err)
          this.logger.error(`Edge bundle publish failed: ${err.message}`);
        else
          this.logger.log(
            `Published edge bundle v${signed.bundle.version} to ${topic} ` +
              `(${signed.bundle.rules.length} rules, ${signed.bundle.schedules.length} schedules)`,
          );
      },
    );
  }
}
