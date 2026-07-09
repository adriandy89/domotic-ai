import { PartialType } from '@nestjs/swagger';
import { CreateApplianceMonitorDto } from './create-appliance-monitor.dto';

/** All fields optional; `source_device_id`/`home_id` may be changed too. */
export class UpdateApplianceMonitorDto extends PartialType(
  CreateApplianceMonitorDto,
) {}
