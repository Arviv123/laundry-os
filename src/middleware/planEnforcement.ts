/**
 * Plan Enforcement Middleware
 * Checks tenant plan limits before allowing resource creation.
 * Used on user and employee creation routes.
 */
import { Response, NextFunction } from 'express';
import { prisma } from '../config/database';
import { AuthenticatedRequest } from '../shared/types';
import { sendError } from '../shared/utils/response';

/**
 * Enforce max users limit per tenant plan
 */
export async function enforceMaxUsers(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: req.user.tenantId },
    select: { maxUsers: true },
  });

  if (!tenant) {
    sendError(res, 'Tenant not found', 404);
    return;
  }

  const currentCount = await prisma.user.count({
    where: { tenantId: req.user.tenantId, isActive: true },
  });

  if (currentCount >= tenant.maxUsers) {
    sendError(res, `הגעת למגבלת המשתמשים בתוכנית שלך (${tenant.maxUsers}). שדרג את התוכנית להוספת משתמשים נוספים.`, 403);
    return;
  }

  next();
}

/**
 * Enforce max employees limit per tenant plan
 */
export async function enforceMaxEmployees(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: req.user.tenantId },
    select: { maxEmployees: true },
  });

  if (!tenant) {
    sendError(res, 'Tenant not found', 404);
    return;
  }

  const currentCount = await prisma.employee.count({
    where: { tenantId: req.user.tenantId },
  });

  if (currentCount >= tenant.maxEmployees) {
    sendError(res, `הגעת למגבלת העובדים בתוכנית שלך (${tenant.maxEmployees}). שדרג את התוכנית להוספת עובדים נוספים.`, 403);
    return;
  }

  next();
}
