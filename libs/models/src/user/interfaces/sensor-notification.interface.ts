export interface IUserSensorNotification {
    userId: string;
    homeId: string;
    deviceId: string;
    attributeKey: string;
    sensorKey: string;
    sensorValue: string | number | boolean;
}