import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsDateString, IsEnum, IsOptional, IsString } from 'class-validator';

export enum ReportType {
  VEHICLE = 'VEHICLE',
  TELEMETRY = 'TELEMETRY',
  ALERTS = 'ALERTS',
  SUMMARY = 'SUMMARY',
  SCHEDULED_CONSOLIDATED = 'SCHEDULED_CONSOLIDATED'
}

export enum ReportFormat {
  PDF = 'PDF',
  EXCEL = 'EXCEL'
}

export enum PeriodType {
  DAILY = 'DAILY',
  WEEKLY = 'WEEKLY',
  MONTHLY = 'MONTHLY',
}

export enum ExecutionStatus {
  PENDING = 'PENDING',
  RUNNING = 'RUNNING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

// Arrays para validación
export const REPORT_TYPE_VALUES = Object.values(ReportType);
export const REPORT_FORMAT_VALUES = Object.values(ReportFormat);
export const PERIOD_TYPE_VALUES = Object.values(PeriodType);
export const EXECUTION_STATUS_VALUES = Object.values(ExecutionStatus);


export class CreateReportDto {
  @ApiProperty({ description: 'ID del dispositivo' })
  @IsString()
  deviceId: string;

  @ApiProperty({ description: 'Fecha de inicio (ISO string)', example: '2024-01-01T00:00:00.000Z' })
  @IsDateString()
  startDate: string;

  @ApiProperty({ description: 'Fecha de fin (ISO string)', example: '2024-01-07T23:59:59.999Z' })
  @IsDateString()
  endDate: string;

  @ApiProperty({ enum: ReportType, description: 'Tipo de reporte' })
  @IsEnum(ReportType)
  reportType: ReportType;

  @ApiProperty({ enum: ReportFormat, description: 'Formato del reporte' })
  @IsEnum(ReportFormat)
  format: ReportFormat;

  @ApiProperty({ description: 'Incluir gráficas', required: false, default: false })
  @IsOptional()
  @IsBoolean()
  includeCharts?: boolean;

  @ApiProperty({ description: 'Incluir mapa', required: false, default: false })
  @IsOptional()
  @IsBoolean()
  includeMap?: boolean;
}

export class ReportQueryDto {
  @ApiProperty({ description: 'Número de página', required: false, default: 1 })
  @IsOptional()
  page?: number;

  @ApiProperty({ description: 'Límite de resultados por página', required: false, default: 10 })
  @IsOptional()
  limit?: number;
}

export class QuickReportQueryDto {
  @ApiProperty({ description: 'Horas hacia atrás', required: false, default: 24 })
  @IsOptional()
  hours?: number;

  @ApiProperty({ enum: ReportFormat, description: 'Formato del reporte', required: false, default: ReportFormat.PDF })
  @IsOptional()
  @IsEnum(ReportFormat)
  format?: ReportFormat;
}

export class DeviceStatisticsQueryDto {
  @ApiProperty({ description: 'Fecha de inicio (ISO string)' })
  @IsDateString()
  startDate: string;

  @ApiProperty({ description: 'Fecha de fin (ISO string)' })
  @IsDateString()
  endDate: string;
}
