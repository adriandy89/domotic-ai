import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { MqttCoreService } from './mqtt-core.service';

@Controller()
export class MqttCoreController {
    constructor(
        private readonly mqttCoreService: MqttCoreService,
    ) { }

    @MessagePattern('mqtt-core.publish-command')
    publishCommand(@Payload() payload: { homeUniqueId: string; deviceUniqueId: string; command: any }) {
        try {
            this.mqttCoreService.publishCommand(payload);
            return { ok: true };
        } catch (error) {
            console.log(error);
            return { ok: false };
        }

    }

}
