import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty, IsNumber, IsOptional } from 'class-validator';

export class UpdatePositionDto {
    @ApiProperty({
        description: 'show_on_map',
        example: true,
        required: false,
    })
    @IsOptional()
    @IsBoolean()
    readonly show_on_map?: boolean;

    @ApiProperty({
        description: 'x',
        example: 0,
        required: false,
    })
    @IsOptional()
    @IsNumber()
    readonly x?: number;

    @ApiProperty({
        description: 'y',
        example: 0,
        required: false,
    })
    @IsOptional()
    @IsNumber()
    readonly y?: number;
}
