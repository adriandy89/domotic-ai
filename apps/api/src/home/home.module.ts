import { Module } from '@nestjs/common';
import { HomeService } from './home.service';
import { HomeController } from './home.controller';
import { MqttConnectionService } from './mqtt-connection.service';

@Module({
  imports: [],
  controllers: [HomeController],
  providers: [MqttConnectionService, HomeService],
  exports: [HomeService],
})
export class HomeModule { }
