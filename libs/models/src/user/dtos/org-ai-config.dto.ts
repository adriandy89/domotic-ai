import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export enum AiProvider {
  OPENAI = 'openai',
  ANTHROPIC = 'anthropic',
  GOOGLE = 'google',
  AZURE = 'azure',
  GROQ = 'groq',
  MISTRAL = 'mistral',
  XAI = 'xai',
  CUSTOM = 'custom',
}

export enum ReasoningEffort {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
}

export class AiProviderOptionsDto {
  @ApiProperty({
    description: 'Reasoning effort (OpenAI specific)',
    enum: ReasoningEffort,
    required: false,
  })
  @IsOptional()
  @IsEnum(ReasoningEffort)
  reasoningEffort?: ReasoningEffort;

  @ApiProperty({
    description: 'Enable parallel tool calls (OpenAI specific)',
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  parallelToolCalls?: boolean;

  @ApiProperty({
    description: 'Thinking budget (Anthropic specific)',
    required: false,
  })
  @IsOptional()
  @IsNumber()
  budgetTokens?: number;

  @ApiProperty({
    description: 'Safety settings (Google specific)',
    required: false,
  })
  @IsOptional()
  @IsArray()
  safetySettings?: any[];

  @ApiProperty({
    description: 'Azure resource name',
    required: false,
  })
  @IsOptional()
  @IsString()
  resourceName?: string;

  @ApiProperty({
    description: 'Azure deployment name',
    required: false,
  })
  @IsOptional()
  @IsString()
  deploymentName?: string;

  @ApiProperty({
    description: 'Base URL for custom providers',
    required: false,
  })
  @IsOptional()
  @IsString()
  baseURL?: string;
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
    description: 'Model name',
    required: false,
  })
  @IsOptional()
  @IsString()
  model?: string;

  @ApiProperty({
    description: 'API Key',
    required: false,
  })
  @IsOptional()
  @IsString()
  apiKey?: string;

  @ApiProperty({
    description: 'Temperature (0-2)',
    default: 0.7,
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
    description: 'Max tokens',
    minimum: 1,
    maximum: 100000,
    required: false,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(100000)
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
  @IsNumber()
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

  @ApiProperty({
    description: 'Seed',
    required: false,
  })
  @IsOptional()
  @IsNumber()
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
    description: 'Provider specific options',
    type: AiProviderOptionsDto,
    required: false,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => AiProviderOptionsDto)
  providerOptions?: AiProviderOptionsDto;

  @ApiProperty({
    description: 'Enable AI for this home',
    default: true,
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}
