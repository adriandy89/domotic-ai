import { IPageMetaParametersDto } from '@app/models/common';
import { DevicePageOptionsDto } from '../dtos/device-page-options.dto';

export interface IDevicePageMetaParametersDto extends IPageMetaParametersDto {
  pageOptions: DevicePageOptionsDto;
}
