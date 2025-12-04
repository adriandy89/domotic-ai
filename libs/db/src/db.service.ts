
import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from 'generated/prisma/client';

@Injectable()
export class DbService
    extends PrismaClient
    implements OnModuleInit, OnModuleDestroy {
    async onModuleInit(): Promise<void> {
        await this.$connect();
    }

    async onModuleDestroy() {
        await this.$disconnect();
    }
}
