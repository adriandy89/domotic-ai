import {
  Controller,
  Logger,
  MessageEvent,
  OnModuleDestroy,
  Sse,
  UseGuards,
} from '@nestjs/common';

import { CacheService } from '@app/cache';
import { EventPattern, Payload } from '@nestjs/microservices';
import { ApiTags } from '@nestjs/swagger';
import {
  filter,
  interval,
  map,
  merge,
  mergeMap,
  Observable,
  Subject,
} from 'rxjs';
import { AuthenticatedGuard, GetUserInfo } from '../auth';
import { SensorData } from 'generated/prisma/client';
import type { SessionUser } from '@app/models';

// Message interface with topic-based routing
interface IMessage<T> {
  topic: string;
  payload: T;
}

// ! FIX CACHE !! //////////////////////////////////////////////////////
// Cache key helpers
const getSessionKeyDeviceIdUsers = (deviceId: string) =>
  `device:${deviceId}:users`;
const getSessionKeyHomeIdUsers = (homeId: string) => `home:${homeId}:users`;

@ApiTags('SSE')
@Controller('sse')
export class SSEController implements OnModuleDestroy {
  // Unified subject for all messages with topic-based routing
  private messageSubject = new Subject<IMessage<any>>();

  // Observable that SSE clients can subscribe to
  public message$ = this.messageSubject.asObservable();

  // Observable for sending pings every 15 seconds
  private ping$: Observable<MessageEvent>;

  private readonly logger = new Logger(SSEController.name);

  constructor(private readonly cacheService: CacheService) {
    this.ping$ = interval(15000).pipe(
      map(() => ({
        data: JSON.stringify({ topic: 'ping', payload: { timestamp: Date.now() } }),
        type: 'message',
        id: new Date().getTime().toString(),
      })),
    );
  }

  onModuleDestroy() {
    // Complete subjects to prevent memory leaks
    this.messageSubject.complete();
    this.logger.log(
      'SSEController: All streams and subjects cleaned up on module destroy.',
    );
  }

  // ? Unified SSE Stream --------------------------------------------------------------

  @UseGuards(AuthenticatedGuard)
  @Sse('stream')
  stream(@GetUserInfo() user: SessionUser): Observable<MessageEvent> {
    this.logger.log(`User ${user.id} connected to unified SSE stream`);

    const dataStream$ = this.message$.pipe(
      mergeMap(async (message) => {
        try {
          // Permission check based on topic
          let hasPermission = false;

          switch (message.topic) {
            case 'sensor.data':
              const sensorData = message.payload as SensorData;
              if (sensorData.device_id) {
                hasPermission = await this.cacheService.sIsMember(
                  getSessionKeyDeviceIdUsers(sensorData.device_id),
                  user.id,
                );
              }
              break;

            case 'home.status':
              const homeStatus = message.payload as { home_id: string; connected: boolean };
              if (homeStatus.home_id) {
                hasPermission = await this.cacheService.sIsMember(
                  getSessionKeyHomeIdUsers(homeStatus.home_id),
                  user.id,
                );
              }
              break;

            default:
              this.logger.warn(`Unknown topic: ${message.topic}`);
              return null;
          }

          this.logger.debug(
            `STREAM: User ${user.id} permission check for topic ${message.topic}: ${hasPermission}`,
          );

          return hasPermission ? message : null;
        } catch (error) {
          this.logger.error(
            `Permission check error for user ${user.id}:`,
            error,
          );
          return null;
        }
      }),
      filter((data): data is IMessage<any> => data !== null),
      map((message: IMessage<any>) => ({
        data: JSON.stringify(message),
        id: new Date().getTime().toString(),
        retry: 5000,
        type: 'message',
      })),
    );

    return merge(dataStream$, this.ping$);
  }

  // ? Event Handlers --------------------------------------------------------------

  @EventPattern('sensor.data.new')
  async handleNewSensorData(
    @Payload() data: { sensorData: SensorData },
  ) {
    this.logger.log(`Received sensor.data.new: ${JSON.stringify(data)}`);
    this.messageSubject.next({
      topic: 'sensor.data',
      payload: data.sensorData,
    });
  }

  @EventPattern('home.status.update')
  async handleHomeStatusUpdate(
    @Payload()
    data: {
      home_id: string;
      connected: boolean;
    },
  ) {
    this.logger.log(`Received home.status.update: ${JSON.stringify(data)}`);
    this.messageSubject.next({
      topic: 'home.status',
      payload: {
        home_id: data.home_id,
        connected: data.connected,
      },
    });
  }
}
