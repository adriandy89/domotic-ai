import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  Length,
  MaxLength,
} from 'class-validator';

export class CreateAlexaClientDto {
  @IsString()
  @Length(1, 80)
  name: string;

  @IsArray()
  @ArrayMaxSize(8)
  @IsString({ each: true })
  @MaxLength(2048, { each: true })
  redirect_uris: string[];
}

export class UpdateAlexaClientDto {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(8)
  @IsString({ each: true })
  @MaxLength(2048, { each: true })
  redirect_uris?: string[];

  @IsOptional()
  @IsBoolean()
  disabled?: boolean;
}
