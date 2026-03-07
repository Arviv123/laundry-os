import { Response, NextFunction } from 'express';
import { prisma } from '../config/database';
import { AuthenticatedRequest } from '../shared/types';
import { sendError } from '../shared/utils/response';

/**
 * Global Tenant Isolation Guard
 * Verifies the tenant exists and is active.
 * Every request beyond this point is scoped to req.user.tenantId.
 */
export async function enforceTenantIsolation(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const { tenantId } = req.user;

  if (!tenantId) {
    sendError(res, 'Tenant context missing', 400);
    return;
  }

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { id: true, isActive: true },
  });

  if (!tenant || !tenant.isActive) {
    sendError(res, 'Tenant not found or inactive', 403);
    return;
  }

  next();
}

/**
 * Utility: Attach tenantId filter to any Prisma query object.
 * Usage: const where = withTenant(req, { status: 'ACTIVE' })
 */
export function withTenant(
  req: AuthenticatedRequest,
  extra: Record<string, unknown> = {}
): Record<string, unknown> {
  return { tenantId: req.user.tenantId, ...extra };
}
