import { AuditAction } from '@prisma/client';
import { Request } from 'express';
import { prisma } from '../../config/database';

/**
 * AUDIT LOG SERVICE
 *
 * Records every significant action for compliance.
 * Israeli tax authority requires at least 7 years of audit trail.
 */

export interface AuditEntry {
  tenantId:   string;
  userId?:    string;
  action:     AuditAction;
  entityType: string;      // 'EMPLOYEE' | 'INVOICE' | 'PAYROLL' | 'USER' | 'CUSTOMER'
  entityId?:  string;
  oldValues?: Record<string, unknown>;
  newValues?: Record<string, unknown>;
  req?:       Request;
}

export async function writeAuditLog(entry: AuditEntry): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        tenantId:   entry.tenantId,
        userId:     entry.userId,
        action:     entry.action,
        entityType: entry.entityType,
        entityId:   entry.entityId,
        oldValues:  entry.oldValues as any,
        newValues:  entry.newValues as any,
        ipAddress:  entry.req?.ip,
        userAgent:  entry.req?.headers['user-agent'],
      },
    });
  } catch (err) {
    // Audit logging should never crash the main flow
    console.error('[AUDIT] Failed to write audit log:', err);
  }
}

export async function getAuditLogs(
  tenantId: string,
  filters: {
    entityType?: string;
    entityId?:   string;
    userId?:     string;
    action?:     AuditAction;
    from?:       Date;
    to?:         Date;
    page?:       number;
    pageSize?:   number;
  } = {}
) {
  const { entityType, entityId, userId, action, from, to, page = 1, pageSize = 50 } = filters;

  const where = {
    tenantId,
    ...(entityType ? { entityType }                               : {}),
    ...(entityId   ? { entityId }                                 : {}),
    ...(userId     ? { userId }                                   : {}),
    ...(action     ? { action }                                   : {}),
    ...(from || to ? { createdAt: { gte: from, lte: to } }       : {}),
  };

  const [items, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip:    (page - 1) * pageSize,
      take:    pageSize,
    }),
    prisma.auditLog.count({ where }),
  ]);

  return { items, total, page, pageSize };
}
