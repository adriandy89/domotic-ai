import { Inject, Injectable, Logger } from '@nestjs/common';
import { ClientNats } from '@nestjs/microservices';
import { catchError, firstValueFrom, throwError, timeout } from 'rxjs';

@Injectable()
export class NatsClientService {
    private readonly logger = new Logger(NatsClientService.name);
    constructor(
        @Inject('NATS_SERVICE') private readonly client: ClientNats,
    ) { }

    async sendMessage<TResult = unknown, TInput = unknown>(
        pattern: string,
        payload: TInput,
    ): Promise<TResult> {
        try {

            this.logger.debug(
                `📤 NATS SEND [${pattern}]`,
            );

            return await firstValueFrom(
                this.client
                    .send<TResult, typeof payload>(pattern, payload)
                    .pipe(timeout(60_000)),
            );
        } catch (error) {
            this.logger.error(`Error sending message to ${pattern}:`, error);
            throw error;
        }
    }

    async emit<TInput = unknown>(
        pattern: string,
        payload: TInput,
    ): Promise<void> {
        try {
            this.logger.debug(
                `📢 NATS EMIT [${pattern}]`,
            );

            await firstValueFrom(
                this.client.emit(pattern, payload).pipe(
                    timeout(60_000),
                    catchError((err) => {
                        this.logger.error(`Error emitting event to ${pattern}:`, err);
                        return throwError(() => err);
                    }),
                ),
            );
        } catch (error) {
            this.logger.error(`Error during emit to ${pattern}:`, error);
            throw error;
        }
    }
}
