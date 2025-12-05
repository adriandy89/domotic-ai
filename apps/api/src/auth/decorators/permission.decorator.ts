import { SetMetadata } from '@nestjs/common';
import { Role } from 'generated/prisma/enums';
export const Permissions = (permissions: Partial<Role[]>) =>
  SetMetadata('permissions', permissions);
