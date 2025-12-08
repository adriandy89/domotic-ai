import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CacheModule } from '@domotic-ai/cache';
import { AuthModule } from './auth';

@Module({
    imports: [
        ConfigModule.forRoot({
            isGlobal: true,
        }),
        // Importar el módulo de cache
        CacheModule.forRootAsync(),
        AuthModule,
    ],
    controllers: [],
    providers: [],
})
export class AppModule { }
