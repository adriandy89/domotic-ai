import { Module } from '@nestjs/common';
import { HomeService } from './home.service';
import { HomeController } from './home.controller';
import { MqttConnectionService } from './mqtt-connection.service';
import { EdgeModule } from '../edge/edge.module';

@Module({
  imports: [EdgeModule],
  controllers: [HomeController],
  providers: [MqttConnectionService, HomeService],
  exports: [HomeService],
})
export class HomeModule {}
