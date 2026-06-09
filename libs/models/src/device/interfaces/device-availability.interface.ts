/** Emitted on `mqtt-core.device.availability` when a device goes online/offline. */
export interface IDeviceAvailability {
  homeId: string;
  userIds: string[];
  deviceId: string;
  online: boolean;
}
