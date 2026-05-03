import { IPageMetaParametersDto } from '@app/models/common';
import { SchedulePageOptionsDto } from '../dtos/schedule-page-options.dto';

export interface ISchedulePageMetaParametersDto extends IPageMetaParametersDto {
  pageOptions: SchedulePageOptionsDto;
}
