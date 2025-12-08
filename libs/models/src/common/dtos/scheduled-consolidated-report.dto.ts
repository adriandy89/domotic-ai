import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsDateString, IsEnum, IsOptional, IsString } from 'class-validator';
import { ReportFormat, ReportType } from '../dtos/reports.dto';

export class CreateScheduledConsolidatedReportDto {
  @ApiProperty({
    description: 'IDs de los dispositivos a incluir en el reporte consolidado',
    example: ['device1', 'device2', 'device3']
  })
  @IsArray()
  @IsString({ each: true })
  deviceIds: string[];

  @ApiProperty({
    description: 'Fecha de inicio (ISO string)',
    example: '2024-01-01T00:00:00.000Z'
  })
  @IsDateString()
  startDate: string;

  @ApiProperty({
    description: 'Fecha de fin (ISO string)',
    example: '2024-01-07T23:59:59.999Z'
  })
  @IsDateString()
  endDate: string;

  @ApiProperty({
    enum: ReportType,
    description: 'Tipo de reporte - debe ser SCHEDULED_CONSOLIDATED',
    example: 'SCHEDULED_CONSOLIDATED'
  })
  @IsEnum(ReportType)
  reportType: ReportType.SCHEDULED_CONSOLIDATED;

  @ApiProperty({
    enum: ReportFormat,
    description: 'Formato del reporte'
  })
  @IsEnum(ReportFormat)
  format: ReportFormat;

  @ApiProperty({
    description: 'Incluir gráficas en el reporte',
    required: false,
    default: true
  })
  @IsOptional()
  @IsBoolean()
  includeCharts?: boolean;

  @ApiProperty({
    description: 'Incluir mapa en el reporte',
    required: false,
    default: true
  })
  @IsOptional()
  @IsBoolean()
  includeMap?: boolean;

  @ApiProperty({
    description: 'Nombre del schedule que genera este reporte',
    required: false
  })
  @IsOptional()
  @IsString()
  scheduleName?: string;

  @ApiProperty({
    description: 'ID de la organización',
    example: 'org-123'
  })
  @IsString()
  organizationId: string;

  @ApiProperty({
    description: 'ID del usuario que solicita el reporte',
    example: 'user-123'
  })
  @IsString()
  userId: string;
}
