import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class ChatMessageDto {
  @ApiProperty({
    description: 'The message to send to the AI assistant',
    example: '¿Qué tiempo hace en Madrid?',
  })
  @IsString()
  readonly message: string;

  @ApiPropertyOptional({
    description: 'Optional conversation ID to maintain context',
    example: 'uuid-v4-string',
  })
  @IsOptional()
  @IsString()
  readonly conversationId?: string;

  @ApiPropertyOptional({
    description: 'Optional timezone for time-aware responses',
    example: 'Europe/Madrid',
  })
  @IsOptional()
  @IsString()
  readonly timeZone?: string;
}
