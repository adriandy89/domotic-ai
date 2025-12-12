import { PartialType } from '@nestjs/swagger';
import { CreateHomeDto } from './create-home.dto';

export class UpdateHomeDto extends PartialType(CreateHomeDto) {}
