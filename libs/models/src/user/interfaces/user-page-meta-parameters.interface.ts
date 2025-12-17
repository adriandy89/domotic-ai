import { IPageMetaParametersDto } from '@app/models/common';
import { UserPageOptionsDto } from '../dtos/user-page-options.dto';

export interface SessionUserPageMetaParametersDto extends IPageMetaParametersDto {
  pageOptions: UserPageOptionsDto;
}
