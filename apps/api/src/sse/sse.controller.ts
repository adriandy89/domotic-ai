import {
  Controller,
  Logger,
  MessageEvent,
  OnModuleDestroy,
  Sse,
  UseGuards,
} from '@nestjs/common';

import { EventPattern, Payload } from '@nestjs/microservices';
import { ApiTags } from '@nestjs/swagger';
import {
  filter,
  interval,
  map,
  merge,
  Observable,
  Subject,
} from 'rxjs';
import { AuthenticatedGuard, GetUserInfo } from '../auth';
import type { IHomeConnectedEvent, ISensorData, IUserSensorNotification, SessionUser } from '@app/models';

// Message interface with topic-based routing
interface IMessage<T> {
  topic: string;
  payload: T;
}

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

  constructor() {
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
      // Filter messages based on userIds in payload
      filter((message) => {
        try {
          // Permission check based on topic using userIds from payload
          let hasPermission = false;

          switch (message.topic) {
            case 'sensor.data':
              const sensorData = message.payload as ISensorData;
              // Check if user is in the userIds array
              hasPermission = sensorData.userIds?.includes(user.id) ?? false;
              break;

            case 'home.status':
              const homeStatus = message.payload as IHomeConnectedEvent;
              // Check if user is in the userIds array
              hasPermission = homeStatus.userIds?.includes(user.id) ?? false;
              break;

            case 'user.sensor-notification':
              const userSensorNotification = message.payload as IUserSensorNotification;
              // Check if notification is for this user
              hasPermission = userSensorNotification.userId === user.id;
              break;

            default:
              this.logger.warn(`Unknown topic: ${message.topic}`);
              return false;
          }

          this.logger.debug(
            `STREAM: User ${user.id} permission check for topic ${message.topic}: ${hasPermission}`,
          );

          return hasPermission;
        } catch (error) {
          this.logger.error(
            `Permission check error for user ${user.id}:`,
            error,
          );
          return false;
        }
      }),
      map((message: IMessage<any>) => {
        // Remove sensitive fields before sending to frontend
        const { userIds, ...sanitizedPayload } = message.payload;
        return {
          data: JSON.stringify({ topic: message.topic, payload: sanitizedPayload }),
          id: new Date().getTime().toString(),
          retry: 5000,
          type: 'message',
        };
      }),
    );

    return merge(dataStream$, this.ping$);
  }

  // ? Event Handlers --------------------------------------------------------------

  @EventPattern('mqtt-core.sensor.data')
  async handleNewSensorData(
    @Payload() payload: ISensorData,
  ) {
    this.logger.log(`Received mqtt-core.sensor.data: ${JSON.stringify(payload)}`);
    this.messageSubject.next({
      topic: 'sensor.data',
      payload,
    });
  }

  @EventPattern('mqtt-core.home.connected')
  async handleHomeStatusUpdate(
    @Payload()
    payload: IHomeConnectedEvent,
  ) {
    this.logger.log(`Received mqtt-core.home.connected: ${JSON.stringify(payload)}`);
    this.messageSubject.next({
      topic: 'home.status',
      payload,
    });
  }

  @EventPattern('mqtt-core.user.sensor-notification')
  async handleUserSensorNotification(
    @Payload()
    payload: IUserSensorNotification,
  ) {
    this.logger.log(`Received mqtt-core.user.sensor-notification: ${JSON.stringify(payload)}`);
    this.messageSubject.next({
      topic: 'user.sensor-notification',
      payload,
    });
  }
}
