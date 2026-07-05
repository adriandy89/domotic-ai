import { Module } from '@nestjs/common';
import { BRIDGE_CONFIG, loadConfig } from './config';
import { BridgeService } from './bridge/bridge.service';
import { DiscoveryService } from './discovery/discovery.service';
import { MqttService } from './mqtt/mqtt.service';
import { PairingService } from './pairing/pairing.service';
import { DeviceStoreService } from './store/device-store.service';

@Module({
  providers: [
    { provide: BRIDGE_CONFIG, useFactory: loadConfig },
    MqttService,
    DeviceStoreService,
    PairingService,
    BridgeService,
    DiscoveryService,
  ],
})
export class BridgeModule {}
