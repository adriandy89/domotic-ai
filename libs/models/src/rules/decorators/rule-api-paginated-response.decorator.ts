import { applyDecorators } from '@nestjs/common';
import { ApiExtraModels, ApiOkResponse, getSchemaPath } from '@nestjs/swagger';
import { RulePageDto } from '../dtos/rule-page.dto';
import { RuleDto } from '../dtos/rule.dto';

export const RuleApiPaginatedResponse = () => {
  return applyDecorators(
    ApiExtraModels(RulePageDto),
    ApiOkResponse({
      schema: {
        allOf: [
          { $ref: getSchemaPath(RulePageDto) },
          {
            properties: {
              data: {
                type: 'array',
                items: { $ref: getSchemaPath(RuleDto) },
              },
            },
          },
        ],
      },
    }),
  );
};
