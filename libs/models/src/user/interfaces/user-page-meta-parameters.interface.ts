import { IPageMetaParametersDto } from '@app/models/common';
import { UserPageOptionsDto } from '../dtos/user-page-options.dto';

export interface IUserPageMetaParametersDto extends IPageMetaParametersDto {
  pageOptions: UserPageOptionsDto;
}
