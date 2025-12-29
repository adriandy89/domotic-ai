import { useDevicesStore } from '../store/useDevicesStore';
import { useHomesStore } from '../store/useHomesStore';

// SSE Message types matching backend
export interface SSEMessage<T = unknown> {
    topic: string;
    payload: T;
}

export interface SensorDataPayload {
    homeId: string;
    deviceId: string;
    timestamp: string;
    data: Record<string, unknown>;
}

export interface HomeStatusPayload {
    homeId: string;
    connected: boolean;
}

export interface UserSensorNotificationPayload {
    homeId: string;
    deviceId: string;
    attributeKey: string;
    sensorKey: string;
    sensorValue: string | number | boolean;
}

export interface PingPayload {
    timestamp: number;
}

type SSEEventHandler = {
    'sensor.data': (payload: SensorDataPayload) => void;
    'home.status': (payload: HomeStatusPayload) => void;
    'user.sensor-notification': (payload: UserSensorNotificationPayload) => void;
    'ping': (payload: PingPayload) => void;
};

class SSEService {
    private eventSource: EventSource | null = null;
    private reconnectAttempts = 0;
    private maxReconnectAttempts = 8;
    private reconnectDelay = 1000; // Start with 1 second
    private isConnecting = false;
    private shouldReconnect = true;
    private customHandlers: Partial<SSEEventHandler> = {};

    private get baseUrl(): string {
        return import.meta.env.VITE_API_URL || 'http://localhost:3017/api/v1';
    }

    connect(): void {
        if (this.eventSource || this.isConnecting) {
            console.log('[SSE] Already connected or connecting');
            return;
        }

        this.shouldReconnect = true;
        this.isConnecting = true;

        try {
            const url = `${this.baseUrl}/sse/stream`;
            console.log('[SSE] Connecting to:', url);

            this.eventSource = new EventSource(url, {
                withCredentials: true
            });

            this.eventSource.onopen = () => {
                console.log('[SSE] Connected successfully');
                this.reconnectAttempts = 0;
                this.reconnectDelay = 1000;
                this.isConnecting = false;
            };

            this.eventSource.onmessage = (event) => {
                this.handleMessage(event);
            };

            this.eventSource.onerror = (error) => {
                console.error('[SSE] Connection error:', error);
                this.isConnecting = false;
                this.handleError();
            };

        } catch (error) {
            console.error('[SSE] Failed to create EventSource:', error);
            this.isConnecting = false;
            this.handleError();
        }
    }

    private handleMessage(event: MessageEvent): void {
        try {
            const message: SSEMessage = JSON.parse(event.data);

            console.log('[SSE] Received:', message.topic, message.payload);

            switch (message.topic) {
                case 'sensor.data':
                    this.handleSensorData(message.payload as SensorDataPayload);
                    break;

                case 'home.status':
                    this.handleHomeStatus(message.payload as HomeStatusPayload);
                    break;

                case 'user.sensor-notification':
                    this.handleUserNotification(message.payload as UserSensorNotificationPayload);
                    break;

                case 'ping':
                    // Ping received, connection is alive
                    console.log('[SSE] Ping received');
                    break;

                default:
                    console.warn('[SSE] Unknown topic:', message.topic);
            }

            // Call custom handlers if registered
            const handler = this.customHandlers[message.topic as keyof SSEEventHandler];
            if (handler) {
                (handler as (payload: unknown) => void)(message.payload);
            }

        } catch (error) {
            console.error('[SSE] Failed to parse message:', error, event.data);
        }
    }

    private handleSensorData(payload: SensorDataPayload): void {
        // Update device data in the store
        useDevicesStore.getState().updateDeviceData(
            payload.deviceId,
            payload.data,
            payload.timestamp
        );
    }

    private handleHomeStatus(payload: HomeStatusPayload): void {
        // Update home connection status in the store
        useHomesStore.getState().updateHome(payload.homeId, {
            connected: payload.connected
        });
    }

    private handleUserNotification(payload: UserSensorNotificationPayload): void {
        // For now, just log - can be extended for toast notifications, etc.
        console.log('[SSE] User notification:', payload);
        // TODO: Integrate with a notification system
    }

    private handleError(): void {
        this.disconnect(false); // Disconnect without preventing reconnect

        if (!this.shouldReconnect) {
            console.log('[SSE] Reconnection disabled');
            return;
        }

        if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);

            console.log(`[SSE] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);

            setTimeout(() => {
                this.connect();
            }, delay);
        } else {
            console.error('[SSE] Max reconnection attempts reached');
        }
    }

    disconnect(preventReconnect = true): void {
        if (preventReconnect) {
            this.shouldReconnect = false;
        }

        if (this.eventSource) {
            console.log('[SSE] Disconnecting');
            this.eventSource.close();
            this.eventSource = null;
        }

        this.isConnecting = false;
    }

    isConnected(): boolean {
        return this.eventSource?.readyState === EventSource.OPEN;
    }

    // Register custom event handlers
    on<T extends keyof SSEEventHandler>(
        topic: T,
        handler: SSEEventHandler[T]
    ): () => void {
        this.customHandlers[topic] = handler as SSEEventHandler[T];

        // Return unsubscribe function
        return () => {
            delete this.customHandlers[topic];
        };
    }

    // Reset reconnection state (useful after manual disconnect)
    resetReconnection(): void {
        this.reconnectAttempts = 0;
        this.reconnectDelay = 1000;
        this.shouldReconnect = true;
    }
}

// Singleton instance
export const sseService = new SSEService();
