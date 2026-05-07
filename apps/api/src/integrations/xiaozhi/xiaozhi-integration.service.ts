import { aesGcmEncrypt, loadEncryptionKey } from '@app/crypto';
import { DbService } from '@app/db';
import { XIAOZHI_PATTERNS } from '@app/models';
import { NatsClientService } from '@app/nats-client';
import {
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { CreateXiaozhiIntegrationDto } from './dto/create-xiaozhi-integration.dto';
import { UpdateXiaozhiIntegrationDto } from './dto/update-xiaozhi-integration.dto';

const PUBLIC_SELECT = {
  id: true,
  name: true,
  endpoint_prefix: true,
  enabled: true,
  connection_state: true,
  last_error: true,
  last_connected_at: true,
  last_disconnected_at: true,
  created_at: true,
  updated_at: true,
} as const;

@Injectable()
export class XiaozhiIntegrationService {
  private readonly logger = new Logger(XiaozhiIntegrationService.name);
  private readonly key: Buffer;

  constructor(
    private readonly db: DbService,
    private readonly nats: NatsClientService,
  ) {
    this.key = loadEncryptionKey();
  }

  listForUser(userId: string) {
    return this.db.xiaozhiIntegration.findMany({
      where: { user_id: userId },
      orderBy: { created_at: 'desc' },
      select: PUBLIC_SELECT,
    });
  }

  async get(userId: string, id: string) {
    const row = await this.db.xiaozhiIntegration.findFirst({
      where: { id, user_id: userId },
      select: PUBLIC_SELECT,
    });
    if (!row) throw new NotFoundException('Integration not found');
    return row;
  }

  async create(userId: string, dto: CreateXiaozhiIntegrationDto) {
    const endpoint_encrypted = aesGcmEncrypt(dto.endpoint, this.key);
    const endpoint_prefix = dto.endpoint.slice(0, 24);
    const created = await this.db.xiaozhiIntegration.create({
      data: {
        user_id: userId,
        name: dto.name,
        endpoint_encrypted,
        endpoint_prefix,
        enabled: dto.enabled ?? true,
      },
      select: PUBLIC_SELECT,
    });
    this.logger.log(
      `xiaozhi integration created id=${created.id} user=${userId}`,
    );
    if (created.enabled) {
      await this.nats.emit(XIAOZHI_PATTERNS.UPSERTED, { id: created.id });
    }
    return created;
  }

  async update(userId: string, id: string, dto: UpdateXiaozhiIntegrationDto) {
    const existing = await this.db.xiaozhiIntegration.findFirst({
      where: { id, user_id: userId },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('Integration not found');

    const data: Record<string, unknown> = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.enabled !== undefined) data.enabled = dto.enabled;
    if (dto.endpoint !== undefined) {
      data.endpoint_encrypted = aesGcmEncrypt(dto.endpoint, this.key);
      data.endpoint_prefix = dto.endpoint.slice(0, 24);
    }

    const updated = await this.db.xiaozhiIntegration.update({
      where: { id },
      data,
      select: PUBLIC_SELECT,
    });
    this.logger.log(
      `xiaozhi integration updated id=${id} user=${userId} fields=${Object.keys(data).join(',')}`,
    );
    await this.nats.emit(XIAOZHI_PATTERNS.UPSERTED, { id });
    return updated;
  }

  async delete(userId: string, id: string) {
    const result = await this.db.xiaozhiIntegration.deleteMany({
      where: { id, user_id: userId },
    });
    if (result.count === 0) {
      throw new NotFoundException('Integration not found');
    }
    this.logger.log(`xiaozhi integration deleted id=${id} user=${userId}`);
    await this.nats.emit(XIAOZHI_PATTERNS.DELETED, { id });
  }

  async test(userId: string, id: string) {
    const row = await this.db.xiaozhiIntegration.findFirst({
      where: { id, user_id: userId },
      select: { id: true },
    });
    if (!row) throw new NotFoundException('Integration not found');
    this.logger.log(`xiaozhi integration test id=${id} user=${userId}`);
    await this.nats.emit(XIAOZHI_PATTERNS.TEST, { id });
  }
}
