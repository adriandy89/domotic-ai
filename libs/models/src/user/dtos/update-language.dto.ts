import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';
import { SUPPORTED_LANGUAGES } from '../enums';
import type { Language } from '../enums';

/**
 * Self-service language update (PUT /users/me/language).
 * Any authenticated user may change their own preferred language.
 */
export class UpdateLanguageDto {
  @ApiProperty({
    description: 'Preferred language (ISO 639-1)',
    enum: SUPPORTED_LANGUAGES,
    example: 'en',
  })
  @IsIn(SUPPORTED_LANGUAGES as readonly string[])
  readonly language: Language;
}
