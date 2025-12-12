import { CacheService } from '@app/cache';
import { DbService } from '@app/db';
import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class MqttCoreService {
  private readonly logger = new Logger(MqttCoreService.name);

  constructor(
    private readonly cacheService: CacheService,
    private readonly dbService: DbService,
  ) { }

  async handleMessage(topic: string, bufferMsg: Buffer) {
    try {
      const topicParts = topic.split('/');
      if (topic.endsWith('bridge/devices')) {
        const homeBridgeDevices = JSON.parse(bufferMsg.toString());
        const homeBridgeUniqueId = topicParts[topicParts.length - 3];

        const foundHome = await this.dbService.home.findUnique({
          where: { unique_id: homeBridgeUniqueId, disabled: false },
          select: {
            unique_id: true,
            id: true,
            organization_id: true,
            connected: true,
          },
        });
        if (!foundHome) {
          this.logger.error(`Not Found home bridge = ${homeBridgeUniqueId}`);
          return;
        }
        const disconnected = await this.cacheService.sIsMember(
          'h-home-disconnected',
          foundHome.unique_id,
        );
        //   if (disconnected) {
        //     // ? home reconnect
        //     await this.cacheService.sRem(
        //       'h-home-disconnected',
        //       foundHome.uniqueId,
        //     );
        //   }
        //   if (!foundHome.connected) {
        //     await this.dbService.home.update({
        //       where: { id: foundHome.id },
        //       data: { connected: true },
        //     });
        //     // notify to user
        //     this.clientProxyAPI.emit(SensorDataMsg.WS_UPDATE_HOME_STATUS, {
        //       homeId: foundHome.id,
        //       connected: true,
        //     });
        //   }

        //   homeBridgeDevices
        //     .filter((item) => item.type != 'Coordinator')
        //     .map(async (item) => {
        //       try {
        //         const deviceId = await this.dbService.device.findUnique({
        //           where: { uniqueId: item.friendly_name },
        //           select: { id: true },
        //         });
        //         if (deviceId) {
        //           this.logger.verbose(
        //             `Bridge Update Device: ${item.friendly_name}`,
        //           );
        //           const data = sanitizeInput({
        //             model: item.model_id,
        //             attributes: item,
        //           });
        //           await this.dbService.device.update({
        //             where: { id: +deviceId.id },
        //             data,
        //           });
        //         } else {
        //           this.logger.verbose(
        //             `Bridge Create Device: ${item.friendly_name}`,
        //           );
        //           try {
        //             const data = sanitizeInput({
        //               uniqueId: item.friendly_name,
        //               name:
        //                 item.definition?.description?.substring(0, 124) ??
        //                 item.friendly_name,
        //               homeId: foundHome.id,
        //               model: item.model_id,
        //               attributes: item,
        //               organizationId: foundHome.organizationId,
        //               disabled: true,
        //             });

        //             await this.dbService.device.create({
        //               data,
        //             });
        //           } catch (error) {
        //             console.log('Error:', error);
        //           }
        //         }
        //       } catch (error) {
        //         this.logger.error(`Error: ${error}`);
        //       }
        //     });

        //   return;
        // }
        // const homeUniqueId = topicParts[topicParts.length - 2];
        // const deviceUniqueId = topicParts[topicParts.length - 1];

        // const message = JSON.parse(bufferMsg.toString().replace(/\u0000/g, ''));

        // // ? Save message to database
        // const redisKey = `h-home-uniqueid:${homeUniqueId}:devices-uniqueid`;
        // const isMember = await this.cacheService.sIsMember(
        //   redisKey,
        //   deviceUniqueId,
        // );
        // const deviceId = await this.cacheService.get(
        //   'h-device-uniqueid:' + deviceUniqueId,
        // );
        // if (!deviceId || !isMember) {
        //   this.logger.error(
        //     `Not Found home = ${homeUniqueId} with device = ${deviceUniqueId}`,
        //   );
        // } else {
        //   this.logger.verbose(`Incoming Message: ${deviceUniqueId}`);
        //   const newSensorData = await this.dbService.sensorData.create({
        //     data: {
        //       deviceId: +deviceId,
        //       data: message,
        //     },
        //   });
        //   const redisKey = `h-device-id:${newSensorData.deviceId}:last-data`;

        //   // ? get previous data
        //   let prevData: any = await this.cacheService.get(redisKey);
        //   if (prevData) {
        //     prevData = JSON.parse(prevData);
        //   }

        //   await this.cacheService.set(redisKey, JSON.stringify(newSensorData));
        //   this.clientProxyAPI.emit(SensorDataMsg.WS_NEW_SENSOR_DATA, {
        //     data: newSensorData,
        //   });
        //   this.clientProxyRules.emit(RulesEngineMsg.NEW_SENSOR_DATA, {
        //     data: newSensorData,
        //   });
        //   const uptHome = await this.dbService.home.update({
        //     where: { uniqueId: homeUniqueId },
        //     data: { lastUpdate: new Date() },
        //     select: { id: true },
        //   });

        //   if (prevData && uptHome) {
        //     // compare last data with new data
        //     await this.globalUserAttributesNotification(
        //       newSensorData,
        //       prevData,
        //       uptHome.id,
        //     );
        //   }
      }
    } catch (error) {
      console.log('Error handling message:', error);
    }
  }
}
