import { Inject, Module, OnModuleInit } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MqttModule } from '@app/mqtt';
import { MqttCoreService } from './mqtt-core.service';
import { MqttClient } from 'mqtt';
import { CacheModule } from '@app/cache';
import { NatsClientModule } from '@app/nats-client';
import { DbModule } from '@app/db';
import { MqttCoreController } from './mqtt-core.controller';
import { DeviceAvailabilityService } from './services/device-availability.service';
import { DeviceCommandService } from './services/device-command.service';
import { DeviceRegistryService } from './services/device-registry.service';
import { HaIngestionService } from './services/ha-ingestion.service';
import { HomeRegistryService } from './services/home-registry.service';
import { SensorIngestionService } from './services/sensor-ingestion.service';
import { ZigbeeIngestionService } from './services/zigbee-ingestion.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    MqttModule.forRootAsync(),
    CacheModule.forRootAsync(),
    NatsClientModule,
    DbModule,
  ],
  controllers: [MqttCoreController],
  providers: [
    MqttCoreService,
    HomeRegistryService,
    DeviceRegistryService,
    SensorIngestionService,
    DeviceAvailabilityService,
    ZigbeeIngestionService,
    HaIngestionService,
    DeviceCommandService,
  ],
})
export class MqttCoreModule implements OnModuleInit {
  private processingCount = 0;
  private readonly maxConcurrent = 5;
  private messageQueue: Array<{ packet: any; callback: () => void }> = [];

  constructor(
    @Inject('MQTT_CLIENT') private readonly mqttClient: MqttClient,
    private readonly sensorDataService: MqttCoreService,
  ) {}

  async onModuleInit() {
    // One subscription covers every per-home topic: the 4th level is the protocol
    // segment (zigbee/zwave/wifi/ble) or `discovery` for HA-Discovery configs.
    //  - home/id/{home}/{protocol}/#  → state + Zigbee bridge/devices
    //  - home/id/{home}/discovery/#   → Home Assistant discovery configs
    this.mqttClient.subscribe('home/id/+/+/#', { qos: 1 });

    // Override handleMessage to implement proper backpressure with concurrency control
    // This ensures messages are processed with MAX 5 concurrent handlers
    this.mqttClient.handleMessage = async (packet, callback) => {
      if (packet.cmd === 'publish') {
        // If we're at max capacity, queue the message
        if (this.processingCount >= this.maxConcurrent) {
          this.messageQueue.push({ packet, callback });
          return;
        }

        // Process the message
        this.processMessage(packet, callback);
      } else {
        callback();
      }
    };
  }

  private async processMessage(packet: any, callback: () => void) {
    this.processingCount++;

    try {
      const topic = packet.topic;
      const message = Buffer.isBuffer(packet.payload)
        ? packet.payload
        : Buffer.from(packet.payload);
      await this.sensorDataService.handleMessage(topic, message);
    } catch (error: any) {
      console.error('Error handling MQTT message:', error);
    } finally {
      this.processingCount--;
      // IMPORTANT: Always call callback to signal message is handled
      callback();

      // Process next message from queue if available
      if (
        this.messageQueue.length > 0 &&
        this.processingCount < this.maxConcurrent
      ) {
        const next = this.messageQueue.shift();
        if (next) {
          this.processMessage(next.packet, next.callback);
        }
      }
    }
  }
}
