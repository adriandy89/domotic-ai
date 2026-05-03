import { applyDecorators } from '@nestjs/common';
import { ApiExtraModels, ApiOkResponse, getSchemaPath } from '@nestjs/swagger';
import { SchedulePageDto } from '../dtos/schedule-page.dto';
import { ScheduleDto } from '../dtos/schedule.dto';

export const ScheduleApiPaginatedResponse = () => {
  return applyDecorators(
    ApiExtraModels(SchedulePageDto),
    ApiOkResponse({
      schema: {
        allOf: [
          { $ref: getSchemaPath(SchedulePageDto) },
          {
            properties: {
              data: {
                type: 'array',
                items: { $ref: getSchemaPath(ScheduleDto) },
              },
            },
          },
        ],
      },
    }),
  );
};
