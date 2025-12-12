import { Module } from '@nestjs/common';
import { HomeService } from './home.service';
import { HomeController } from './home.controller';
import { DbModule } from '@app/db';
import { MqttConnectionService } from './mqtt-connection.service';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [DbModule, HttpModule, ConfigModule],
  controllers: [HomeController],
  providers: [MqttConnectionService, HomeService],
  exports: [HomeService],
})
export class HomeModule { }
