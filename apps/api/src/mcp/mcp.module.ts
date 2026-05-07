import { DbModule, DbService } from '@app/db';
import { NatsClientModule, NatsClientService } from '@app/nats-client';
import {
  MiddlewareConsumer,
  Module,
  NestModule,
  RequestMethod,
} from '@nestjs/common';
import { McpAuthMiddleware } from './mcp-auth.middleware';
import { McpTokenController } from './mcp-token.controller';
import { McpTokenService } from './mcp-token.service';
import { McpController } from './mcp.controller';
import { buildMcpServer, MCP_SERVER } from './mcp.server';

@Module({
  imports: [DbModule, NatsClientModule],
  controllers: [McpController, McpTokenController],
  providers: [
    McpTokenService,
    {
      provide: MCP_SERVER,
      inject: [DbService, NatsClientService],
      useFactory: (db: DbService, nats: NatsClientService) =>
        buildMcpServer({ db, nats }),
    },
  ],
})
export class McpModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(McpAuthMiddleware)
      .forRoutes({ path: 'mcp', method: RequestMethod.ALL });
  }
}
