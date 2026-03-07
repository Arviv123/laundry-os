import { Response, NextFunction } from 'express';
import { UserRole } from '@prisma/client';
import { AuthenticatedRequest } from '../shared/types';
import { sendError } from '../shared/utils/response';

// Role hierarchy - higher index = more permissions
const ROLE_HIERARCHY: UserRole[] = [
  'COUNTER_STAFF',
  'DRIVER',
  'EMPLOYEE',
  'SALESPERSON',
  'HR_MANAGER',
  'ACCOUNTANT',
  'ADMIN',
  'SUPER_ADMIN',
];

/**
 * Require one of the specified roles.
 * Usage: router.get('/payroll', authenticate, requireRole('ADMIN', 'HR_MANAGER'), handler)
 */
export function requireRole(...allowedRoles: UserRole[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    const userRole = req.user.role;

    if (!allowedRoles.includes(userRole)) {
      sendError(res, 'Forbidden - insufficient permissions', 403);
      return;
    }

    next();
  };
}

/**
 * Require minimum role level.
 * Usage: requireMinRole('ACCOUNTANT') allows ACCOUNTANT, ADMIN, SUPER_ADMIN
 */
export function requireMinRole(minimumRole: UserRole) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    const userRoleIndex = ROLE_HIERARCHY.indexOf(req.user.role);
    const minRoleIndex  = ROLE_HIERARCHY.indexOf(minimumRole);

    if (userRoleIndex < minRoleIndex) {
      sendError(res, 'Forbidden - insufficient permissions', 403);
      return;
    }

    next();
  };
}
