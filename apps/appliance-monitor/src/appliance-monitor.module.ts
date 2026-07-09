import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DbModule } from '@app/db';
import { MqttModule } from '@app/mqtt';
import { ApplianceMonitorController } from './appliance-monitor.controller';
import { ConfigStoreService } from './config-store.service';
import { StateMachineService } from './state-machine.service';

/**
 * Central host of the power-monitoring appliance-state pattern, for homes WITHOUT
 * the edge stack. Consumes the already-emitted `mqtt-core.sensor.data` NATS event,
 * runs the SAME pure state machine as the edge, and republishes the derived
 * appliance_state to central TBMQ so it re-enters the unchanged ingestion pipeline.
 *
 * NOTE: an offline home cannot deliver telemetry to central at all, so this host
 * offers online detection only; edge-enabled homes get full offline capture via
 * stack-client/edge/rules-engine instead.
 */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DbModule,
    // Distinct client id so we don't evict mqtt-core's shared-env MQTT connection.
    MqttModule.forRootAsync({ clientIdSuffix: '-appliance-monitor' }),
  ],
  controllers: [ApplianceMonitorController],
  providers: [ConfigStoreService, StateMachineService],
})
export class ApplianceMonitorModule {}
