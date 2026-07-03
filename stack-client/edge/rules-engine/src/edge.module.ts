import { Module } from '@nestjs/common';
import { EDGE_CONFIG, loadConfig } from './config';
import { SqliteService } from './store/sqlite.service';
import { MqttService } from './mqtt/mqtt.service';
import { RulesStoreService } from './rules/rules-store.service';
import { CommandService } from './command/command.service';
import { EngineService } from './engine/engine.service';
import { IngestService } from './ingest/ingest.service';
import { SchedulesService } from './schedules/schedules.service';
import { WatchdogService } from './watchdog/watchdog.service';
import { SyncService } from './sync/sync.service';
import { UploadService } from './upload/upload.service';

@Module({
  providers: [
    { provide: EDGE_CONFIG, useFactory: loadConfig },
    SqliteService,
    MqttService,
    RulesStoreService,
    CommandService,
    EngineService,
    IngestService,
    SchedulesService,
    WatchdogService,
    SyncService,
    UploadService,
  ],
})
export class EdgeModule {}
