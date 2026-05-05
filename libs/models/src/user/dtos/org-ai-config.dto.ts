import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export enum AiProvider {
  OPENAI = 'openai',
  GOOGLE = 'google',
  OPENROUTER = 'openrouter',
}

export enum ReasoningEffort {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
}

export class GoogleThinkingConfigDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  thinkingBudget?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  includeThoughts?: boolean;
}

export class GoogleSafetySettingDto {
  @ApiProperty()
  @IsString()
  category: string;

  @ApiProperty()
  @IsString()
  threshold: string;
}

export class AiProviderOptionsDto {
  @ApiProperty({
    description: 'Reasoning effort (OpenAI)',
    enum: ReasoningEffort,
    required: false,
  })
  @IsOptional()
  @IsEnum(ReasoningEffort)
  reasoningEffort?: ReasoningEffort;

  @ApiProperty({
    description: 'Enable parallel tool calls (OpenAI)',
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  parallelToolCalls?: boolean;

  @ApiProperty({
    description: 'Thinking config (Google Gemini)',
    type: GoogleThinkingConfigDto,
    required: false,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => GoogleThinkingConfigDto)
  thinkingConfig?: GoogleThinkingConfigDto;

  @ApiProperty({
    description: 'Safety settings (Google Gemini)',
    type: [GoogleSafetySettingDto],
    required: false,
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => GoogleSafetySettingDto)
  safetySettings?: GoogleSafetySettingDto[];

  @ApiProperty({
    description: 'HTTP-Referer attribution header (OpenRouter)',
    required: false,
  })
  @IsOptional()
  @IsUrl()
  httpReferer?: string;

  @ApiProperty({
    description: 'X-Title attribution header (OpenRouter)',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  appTitle?: string;
}

export class OrgAiConfigDto {
  @ApiProperty({
    description: 'AI Provider',
    enum: AiProvider,
    default: AiProvider.OPENAI,
  })
  @IsEnum(AiProvider)
  provider: AiProvider;

  @ApiProperty({
    description:
      'Model id. For OpenRouter must include vendor prefix (e.g. "anthropic/claude-haiku-4.5").',
  })
  @IsString()
  @MinLength(1)
  model: string;

  @ApiProperty({
    description: 'API Key. Leave empty when editing to keep the previously stored key.',
    required: false,
  })
  @IsOptional()
  @IsString()
  apiKey?: string;

  @ApiProperty({
    description: 'Temperature (0-2)',
    default: 0.5,
    minimum: 0,
    maximum: 2,
    required: false,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(2)
  temperature?: number;

  @ApiProperty({
    description: 'Max output tokens',
    minimum: 1,
    maximum: 200000,
    required: false,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(200000)
  maxTokens?: number;

  @ApiProperty({
    description: 'Top P (0-1)',
    minimum: 0,
    maximum: 1,
    required: false,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  topP?: number;

  @ApiProperty({
    description: 'Top K',
    minimum: 0,
    required: false,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  topK?: number;

  @ApiProperty({
    description: 'Presence Penalty (-2 to 2)',
    minimum: -2,
    maximum: 2,
    required: false,
  })
  @IsOptional()
  @IsNumber()
  @Min(-2)
  @Max(2)
  presencePenalty?: number;

  @ApiProperty({
    description: 'Frequency Penalty (-2 to 2)',
    minimum: -2,
    maximum: 2,
    required: false,
  })
  @IsOptional()
  @IsNumber()
  @Min(-2)
  @Max(2)
  frequencyPenalty?: number;

  @ApiProperty({ description: 'Seed', required: false })
  @IsOptional()
  @IsInt()
  seed?: number;

  @ApiProperty({
    description: 'Stop sequences',
    type: [String],
    required: false,
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  stopSequences?: string[];

  @ApiProperty({
    description: 'Max retries for the underlying provider call',
    minimum: 0,
    maximum: 10,
    default: 2,
    required: false,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10)
  maxRetries?: number;

  @ApiProperty({
    description: 'Provider specific options',
    type: AiProviderOptionsDto,
    required: false,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => AiProviderOptionsDto)
  providerOptions?: AiProviderOptionsDto;

  @ApiProperty({
    description: 'Enable AI for this organization',
    default: true,
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}
