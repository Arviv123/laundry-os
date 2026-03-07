import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../../config/database';

// ─── Platform Admin Management ────────────────────────────────────

export async function listPlatformAdmins() {
  return prisma.platformAdmin.findMany({
    select: { id: true, email: true, name: true, isActive: true, lastLoginAt: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  });
}

export async function deactivatePlatformAdmin(adminId: string, requesterId: string) {
  if (adminId === requesterId) throw new Error('SELF_DEACTIVATE');
  const count = await prisma.platformAdmin.count({ where: { isActive: true } });
  if (count <= 1) throw new Error('LAST_ADMIN');
  return prisma.platformAdmin.update({
    where: { id: adminId },
    data: { isActive: false },
    select: { id: true, email: true, name: true, isActive: true },
  });
}

export async function reactivatePlatformAdmin(adminId: string) {
  return prisma.platformAdmin.update({
    where: { id: adminId },
    data: { isActive: true },
    select: { id: true, email: true, name: true, isActive: true },
  });
}

// ─── Platform Activity (cross-tenant overview) ────────────────────

export async function getPlatformActivity() {
  const now = new Date();

  // Last 30 days: new tenants per day
  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 29);

  const recentTenants = await prisma.tenant.findMany({
    where: { createdAt: { gte: thirtyDaysAgo } },
    select: { id: true, name: true, plan: true, isActive: true, suspendedAt: true, createdAt: true, _count: { select: { users: true, employees: true } } },
    orderBy: { createdAt: 'desc' },
  });

  // Suspended tenants
  const suspendedTenants = await prisma.tenant.findMany({
    where: { suspendedAt: { not: null } },
    select: { id: true, name: true, suspendedAt: true, suspendedReason: true },
    orderBy: { suspendedAt: 'desc' },
    take: 10,
  });

  // Aggregate per day for chart
  const byDay: Record<string, number> = {};
  for (let i = 0; i < 30; i++) {
    const d = new Date(thirtyDaysAgo);
    d.setDate(d.getDate() + i);
    byDay[d.toISOString().slice(0, 10)] = 0;
  }
  for (const t of recentTenants) {
    const key = t.createdAt.toISOString().slice(0, 10);
    if (key in byDay) byDay[key]++;
  }

  // Last 7 days payroll runs across all tenants
  const sevenDaysAgo = new Date(now);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const recentPayrollRuns = await prisma.payrollRun.count({ where: { createdAt: { gte: sevenDaysAgo } } });
  const recentInvoices    = await prisma.invoice.count({ where: { createdAt: { gte: sevenDaysAgo } } });

  return {
    recentTenants,
    suspendedTenants,
    newTenantsByDay: byDay,
    recentPayrollRuns,
    recentInvoices,
  };
}

// ─── Auth ────────────────────────────────────────────────────────

export async function loginPlatformAdmin(email: string, password: string) {
  const admin = await prisma.platformAdmin.findUnique({ where: { email } });
  if (!admin || !admin.isActive) throw new Error('INVALID_CREDENTIALS');

  const valid = await bcrypt.compare(password, admin.passwordHash);
  if (!valid) throw new Error('INVALID_CREDENTIALS');

  await prisma.platformAdmin.update({
    where: { id: admin.id },
    data: { lastLoginAt: new Date() },
  });

  const token = jwt.sign(
    { adminId: admin.id, email: admin.email, name: admin.name, isPlatform: true },
    process.env.JWT_SECRET!,
    { expiresIn: '12h' }
  );

  return {
    token,
    admin: { id: admin.id, email: admin.email, name: admin.name },
  };
}

export async function createPlatformAdmin(email: string, password: string, name: string) {
  const passwordHash = await bcrypt.hash(password, 12);
  return prisma.platformAdmin.create({
    data: { email, passwordHash, name },
    select: { id: true, email: true, name: true, createdAt: true },
  });
}

// ─── Platform Stats ──────────────────────────────────────────────

export async function getPlatformStats() {
  const [totalTenants, activeTenants, totalUsers, totalEmployees] = await Promise.all([
    prisma.tenant.count(),
    prisma.tenant.count({ where: { isActive: true, suspendedAt: null } }),
    prisma.user.count(),
    prisma.employee.count(),
  ]);

  // Tenants by plan
  const byPlan = await prisma.tenant.groupBy({
    by: ['plan'],
    _count: true,
  });

  // Recent signups (last 30 days)
  const since = new Date();
  since.setDate(since.getDate() - 30);
  const recentTenants = await prisma.tenant.count({
    where: { createdAt: { gte: since } },
  });

  return {
    totalTenants,
    activeTenants,
    suspendedTenants: totalTenants - activeTenants,
    totalUsers,
    totalEmployees,
    recentTenants,
    byPlan: Object.fromEntries(byPlan.map(b => [b.plan, b._count])),
  };
}

// ─── Tenant Management ───────────────────────────────────────────

export async function listTenants(search?: string) {
  const where = search
    ? {
        OR: [
          { name: { contains: search, mode: 'insensitive' as const } },
          { businessNumber: { contains: search } },
          { email: { contains: search, mode: 'insensitive' as const } },
          { contactName: { contains: search, mode: 'insensitive' as const } },
        ],
      }
    : undefined;

  const tenants = await prisma.tenant.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    select: {
      id: true, name: true, businessNumber: true, email: true, phone: true,
      contactName: true, plan: true, isActive: true, suspendedAt: true,
      suspendedReason: true, createdAt: true, maxUsers: true, maxEmployees: true,
      modules: true,
      _count: { select: { users: true, employees: true } },
    },
  });

  return tenants;
}

export async function getTenantDetail(tenantId: string) {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    include: {
      _count: {
        select: {
          users: true, employees: true, invoices: true,
          payrollRuns: true, transactions: true,
        },
      },
    },
  });
  if (!tenant) throw new Error('NOT_FOUND');
  return tenant;
}

export async function createTenant(data: {
  name: string;
  businessNumber: string;
  vatNumber?: string;
  email?: string;
  phone?: string;
  contactName?: string;
  plan?: string;
  maxUsers?: number;
  maxEmployees?: number;
  adminEmail: string;
  adminPassword: string;
  adminFirstName: string;
  adminLastName: string;
}) {
  const passwordHash = await bcrypt.hash(data.adminPassword, 12);

  return prisma.$transaction(async tx => {
    const tenant = await tx.tenant.create({
      data: {
        name: data.name,
        businessNumber: data.businessNumber,
        vatNumber: data.vatNumber,
        email: data.email,
        phone: data.phone,
        contactName: data.contactName,
        address: { street: '', city: '', zip: '', country: 'IL' },
        plan: data.plan ?? 'basic',
        maxUsers: data.maxUsers ?? 10,
        maxEmployees: data.maxEmployees ?? 50,
      },
    });

    await tx.user.create({
      data: {
        tenantId: tenant.id,
        email: data.adminEmail,
        passwordHash,
        role: 'ADMIN',
        firstName: data.adminFirstName,
        lastName: data.adminLastName,
      },
    });

    return tenant;
  });
}

export async function updateTenant(tenantId: string, data: {
  name?: string;
  email?: string;
  phone?: string;
  contactName?: string;
  plan?: string;
  maxUsers?: number;
  maxEmployees?: number;
  modules?: Record<string, boolean>;
  notes?: string;
}) {
  return prisma.tenant.update({
    where: { id: tenantId },
    data: {
      ...(data.name        !== undefined && { name: data.name }),
      ...(data.email       !== undefined && { email: data.email }),
      ...(data.phone       !== undefined && { phone: data.phone }),
      ...(data.contactName !== undefined && { contactName: data.contactName }),
      ...(data.plan        !== undefined && { plan: data.plan }),
      ...(data.maxUsers    !== undefined && { maxUsers: data.maxUsers }),
      ...(data.maxEmployees!== undefined && { maxEmployees: data.maxEmployees }),
      ...(data.modules     !== undefined && { modules: data.modules }),
      ...(data.notes       !== undefined && { notes: data.notes }),
    },
  });
}

export async function suspendTenant(tenantId: string, reason: string) {
  return prisma.tenant.update({
    where: { id: tenantId },
    data: {
      isActive: false,
      suspendedAt: new Date(),
      suspendedReason: reason,
    },
  });
}

export async function activateTenant(tenantId: string) {
  return prisma.tenant.update({
    where: { id: tenantId },
    data: {
      isActive: true,
      suspendedAt: null,
      suspendedReason: null,
    },
  });
}

export async function deleteTenant(tenantId: string) {
  // Safety: only allow deleting tenants with no financial data
  const counts = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { _count: { select: { transactions: true, invoices: true, payrollRuns: true } } },
  });
  if (!counts) throw new Error('NOT_FOUND');
  const { transactions, invoices, payrollRuns } = counts._count;
  if (transactions > 0 || invoices > 0 || payrollRuns > 0) {
    throw new Error('HAS_DATA');
  }
  // Cascade via Prisma relations
  await prisma.tenant.delete({ where: { id: tenantId } });
}

// ─── Impersonate ─────────────────────────────────────────────────

export async function impersonateTenant(tenantId: string) {
  const admin = await prisma.user.findFirst({
    where: { tenantId, role: 'ADMIN', isActive: true },
  });
  if (!admin) throw new Error('NO_ADMIN');

  const token = jwt.sign(
    {
      userId: admin.id,
      tenantId: admin.tenantId,
      role: admin.role,
      email: admin.email,
      impersonatedBy: 'platform',
    },
    process.env.JWT_SECRET!,
    { expiresIn: '2h' }
  );

  return { token, user: { id: admin.id, email: admin.email, role: admin.role } };
}
