import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsObject } from 'class-validator';

export class HomeAttributesDto {
    @ApiProperty({
        description: 'Home attributes object',
        example: { customField: 'value' },
    })
    @IsNotEmpty()
    @IsObject()
    readonly attributes: object;
}
