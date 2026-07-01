import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import mqtt, { MqttClient } from 'mqtt';
import { EDGE_CONFIG, EdgeConfig } from '../config';

export type MqttMessageHandler = (topic: string, payload: Buffer) => void;

/**
 * Connection to the LOCAL mosquitto broker. Publishes device commands and the
 * engine subscribes to home telemetry + the retained rules bundle through it.
 * All traffic stays local; the mosquitto bridge relays to/from TBMQ separately.
 */
@Injectable()
export class MqttService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MqttService.name);
  private client!: MqttClient;
  private readonly handlers: MqttMessageHandler[] = [];

  constructor(@Inject(EDGE_CONFIG) private readonly config: EdgeConfig) {}

  onModuleInit(): void {
    this.client = mqtt.connect(this.config.mqttUrl, {
      clientId: this.config.mqttClientId,
      username: this.config.mqttUsername,
      password: this.config.mqttPassword,
      reconnectPeriod: 4000,
      clean: false,
    });

    this.client.on('connect', () =>
      this.logger.log(`Connected to local broker ${this.config.mqttUrl}`),
    );
    this.client.on('reconnect', () =>
      this.logger.warn('Reconnecting to local broker...'),
    );
    this.client.on('error', (err) =>
      this.logger.error(`MQTT error: ${err.message}`),
    );
    this.client.on('message', (topic, payload) => {
      for (const h of this.handlers) {
        try {
          h(topic, payload);
        } catch (e: any) {
          this.logger.error(`Message handler failed: ${e?.message}`);
        }
      }
    });
  }

  onModuleDestroy(): void {
    this.client?.end(true);
  }

  subscribe(topic: string): void {
    this.client.subscribe(topic, { qos: 1 }, (err) => {
      if (err) this.logger.error(`Subscribe ${topic} failed: ${err.message}`);
      else this.logger.log(`Subscribed ${topic}`);
    });
  }

  onMessage(handler: MqttMessageHandler): void {
    this.handlers.push(handler);
  }

  publish(topic: string, payload: string): void {
    this.client.publish(topic, payload, { qos: 1 }, (err) => {
      if (err) this.logger.error(`Publish ${topic} failed: ${err.message}`);
    });
  }
}
