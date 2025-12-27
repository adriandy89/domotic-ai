export interface ISensorData {
    homeId: string;
    userIds: string[];
    ruleIds: string[];
    deviceId: string;
    timestamp: Date;
    data: any;
}