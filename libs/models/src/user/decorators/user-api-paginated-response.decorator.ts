import { applyDecorators } from '@nestjs/common';
import { ApiExtraModels, ApiOkResponse, getSchemaPath } from '@nestjs/swagger';
import { UserPageDto } from '../dtos/user-page.dto';
import { UserDto } from '../dtos/user.dto';

export const UserApiPaginatedResponse = () => {
  return applyDecorators(
    ApiExtraModels(UserPageDto),
    ApiOkResponse({
      schema: {
        allOf: [
          { $ref: getSchemaPath(UserPageDto) },
          {
            properties: {
              data: {
                type: 'array',
                items: { $ref: getSchemaPath(UserDto) },
              },
            },
          },
        ],
      },
    }),
  );
};
