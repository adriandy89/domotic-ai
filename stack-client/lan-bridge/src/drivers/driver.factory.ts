import { DeviceDefinition, DeviceDriver, DriverHost } from '../types';
import { WebosDriver } from './webos/webos.driver';

export function createDriver(
  def: DeviceDefinition,
  host: DriverHost,
  dataDir: string,
): DeviceDriver {
  switch (def.type) {
    case 'webos':
      return new WebosDriver(def, host, dataDir);
    default:
      throw new Error(`Unknown driver type: ${def.type as string}`);
  }
}
