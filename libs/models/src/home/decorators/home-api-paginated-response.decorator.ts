import { applyDecorators } from '@nestjs/common';
import { ApiExtraModels, ApiOkResponse, getSchemaPath } from '@nestjs/swagger';
import { HomePageDto } from '../dtos/home-page.dto';
import { HomeDto } from '../dtos/home.dto';

export const HomeApiPaginatedResponse = () => {
  return applyDecorators(
    ApiExtraModels(HomePageDto),
    ApiOkResponse({
      schema: {
        allOf: [
          { $ref: getSchemaPath(HomePageDto) },
          {
            properties: {
              data: {
                type: 'array',
                items: { $ref: getSchemaPath(HomeDto) },
              },
            },
          },
        ],
      },
    }),
  );
};
