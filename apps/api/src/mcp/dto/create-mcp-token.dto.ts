import { IsString, Length } from 'class-validator';

export class CreateMcpTokenDto {
  @IsString()
  @Length(1, 80)
  readonly name!: string;
}
