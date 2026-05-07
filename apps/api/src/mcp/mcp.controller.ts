import { All, Controller, Inject, Logger, Req, Res } from '@nestjs/common';
import type { MCPServer } from '@mastra/mcp';
import type { Request, Response } from 'express';
import { MCP_SERVER } from './mcp.server';

@Controller('mcp')
export class McpController {
  private readonly logger = new Logger(McpController.name);

  constructor(@Inject(MCP_SERVER) private readonly server: MCPServer) {}

  @All()
  async handle(@Req() req: Request, @Res() res: Response) {
    try {
      await this.server.startHTTP({
        url: new URL(req.originalUrl, `http://${req.headers.host}`),
        httpPath: '/api/v1/mcp',
        req,
        res,
      });
    } catch (err) {
      this.logger.error(
        `MCP request failed: ${(err as Error).message}`,
        (err as Error).stack,
      );
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: { code: -32603, message: 'Internal error' },
          id: null,
        });
      }
    }
  }
}
