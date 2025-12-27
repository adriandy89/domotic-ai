import { IPageMetaParametersDto } from '@app/models/common';
import { RulePageOptionsDto } from '../dtos/rule-page-options.dto';

export interface IRulePageMetaParametersDto extends IPageMetaParametersDto {
  pageOptions: RulePageOptionsDto;
}
