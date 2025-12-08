import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CacheModule } from '@app/cache';

@Module({
    imports: [
        ConfigModule.forRoot({
            isGlobal: true,
        }),
        // Importar el módulo de cache
        CacheModule.forRootAsync(),
        // others modules
    ],
    controllers: [],
    providers: [],
})
export class AppModule { }
