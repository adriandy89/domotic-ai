import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from 'generated/prisma/enums';
import { SessionUser } from '../interfaces';
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private reflector: Reflector) { }
  canActivate(context: ExecutionContext): boolean {
    const requiredPermissions = this.reflector.get<Role[]>(
      'permissions',
      context.getHandler(),
    );
    if (!requiredPermissions) {
      return true;
    }
    const { user }: { user: SessionUser } = context.switchToHttp().getRequest();
    if (!user || !user.role) {
      return false;
    }
    const userRole: Role = user.role;
    return userRole === Role.ADMIN || requiredPermissions.includes(userRole);
  }
}
