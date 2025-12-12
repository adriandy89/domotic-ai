import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth';
import { HomeModule } from './home';
import { UserModule } from './user';
import { DeviceModule } from './device';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    AuthModule,
    HomeModule,
    UserModule,
    DeviceModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule { }
