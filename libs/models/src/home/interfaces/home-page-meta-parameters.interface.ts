import { IPageMetaParametersDto } from '@app/models/common';
import { HomePageOptionsDto } from '../dtos/home-page-options.dto';

export interface IHomePageMetaParametersDto extends IPageMetaParametersDto {
  pageOptions: HomePageOptionsDto;
}
