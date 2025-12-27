export interface ISensorData {
    homeId: string;
    userIds: string[];
    deviceId: string;
    timestamp: Date;
    data: any;
}

export interface IRulesSensorData {
    ruleIds: string[];
    deviceId: string;
    timestamp: Date;
    data: any;
    prevData: any;
}
