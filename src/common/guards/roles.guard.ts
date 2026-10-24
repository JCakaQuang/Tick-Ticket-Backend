import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '../../schemas/user.schema';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: UserRole[]) => {
  const { SetMetadata } = require('@nestjs/common');
  return SetMetadata(ROLES_KEY, roles);
};

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }
    const { user } = context.switchToHttp().getRequest();
    if (!user) {
      throw new ForbiddenException('User authentication required');
    }
    const hasRole = requiredRoles.includes(user.role);
    if (!hasRole) {
      throw new ForbiddenException(`Requires one of roles: [${requiredRoles.join(', ')}]`);
    }
    return true;
  }
}