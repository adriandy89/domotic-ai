import { applyDecorators } from '@nestjs/common';
import { ApiExtraModels, ApiOkResponse, getSchemaPath } from '@nestjs/swagger';
import { DevicePageDto } from '../dtos/device-page.dto';
import { DeviceDto } from '../dtos/device.dto';

export const DeviceApiPaginatedResponse = () => {
  return applyDecorators(
    ApiExtraModels(DevicePageDto),
    ApiOkResponse({
      schema: {
        allOf: [
          { $ref: getSchemaPath(DevicePageDto) },
          {
            properties: {
              data: {
                type: 'array',
                items: { $ref: getSchemaPath(DeviceDto) },
              },
            },
          },
        ],
      },
    }),
  );
};
