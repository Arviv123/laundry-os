import { z } from 'zod';
import { prisma } from '../../config/database';

// ─── Zod Schemas ────────────────────────────────────────────────────────────

export const CreateBranchSchema = z.object({
  name: z.string().min(1),
  code: z.string().min(1).max(10).toUpperCase(),
  address: z.object({
    street: z.string().optional(),
    city: z.string().optional(),
    zipCode: z.string().optional(),
  }).optional(),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  managerId: z.string().optional(),
});

export const UpdateBranchSchema = CreateBranchSchema.partial();

export const TransferEmployeeSchema = z.object({
  fromBranchId: z.string().min(1),
  toBranchId: z.string().min(1),
});

// ─── Types ──────────────────────────────────────────────────────────────────

export type CreateBranchInput = z.infer<typeof CreateBranchSchema>;
export type UpdateBranchInput = z.infer<typeof UpdateBranchSchema>;

export interface BranchSummary {
  branchId: string;
  name: string;
  code: string;
  employeeCount: number;
  activeInvoicesCount: number; // skipped — Invoice has no branchId in schema
  managerName: string | null;
  isActive: boolean;
}

export interface ConsolidatedReport {
  from: Date;
  to: Date;
  totalEmployees: number;
  branches: Array<{
    branchId: string;
    name: string;
    code: string;
    isActive: boolean;
    employeeCount: number;
    revenue: number; // sum of paid invoices for this tenant (approximated per branch as 0 — no branchId on Invoice)
  }>;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Verify a branch belongs to the given tenant. Returns the branch or throws.
 */
async function assertBranchBelongsToTenant(id: string, tenantId: string) {
  const branch = await prisma.branch.findFirst({ where: { id, tenantId } });
  if (!branch) throw new Error('Branch not found');
  return branch;
}

/**
 * Verify an employee belongs to the given tenant. Returns the employee or throws.
 */
async function assertEmployeeBelongsToTenant(employeeId: string, tenantId: string) {
  const employee = await prisma.employee.findFirst({ where: { id: employeeId, tenantId } });
  if (!employee) throw new Error('Employee not found');
  return employee;
}

// ─── Service Functions ───────────────────────────────────────────────────────

/**
 * List all branches for a tenant, optionally filtered by isActive.
 * Returns each branch with employee count and manager full name.
 */
export async function listBranches(
  tenantId: string,
  filters?: { isActive?: boolean }
) {
  const where: any = { tenantId };
  if (filters?.isActive !== undefined) {
    where.isActive = filters.isActive;
  }

  const branches = await prisma.branch.findMany({
    where,
    orderBy: { name: 'asc' },
    include: {
      manager: {
        select: { firstName: true, lastName: true },
      },
      employees: {
        select: { id: true },
        where: { isActive: true },
      },
    },
  });

  return branches.map(b => ({
    id: b.id,
    tenantId: b.tenantId,
    name: b.name,
    code: b.code,
    address: b.address,
    phone: b.phone,
    email: b.email,
    managerId: b.managerId,
    managerName: b.manager
      ? `${b.manager.firstName} ${b.manager.lastName}`
      : null,
    employeeCount: b.employees.length,
    isActive: b.isActive,
    createdAt: b.createdAt,
    updatedAt: b.updatedAt,
  }));
}

/**
 * Get a single branch with full details: manager info + employee list.
 */
export async function getBranch(id: string, tenantId: string) {
  const branch = await prisma.branch.findFirst({
    where: { id, tenantId },
    include: {
      manager: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          jobTitle: true,
          phone: true,
          personalEmail: true,
        },
      },
      employees: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          jobTitle: true,
          isActive: true,
        },
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      },
    },
  });

  if (!branch) throw new Error('Branch not found');
  return branch;
}

/**
 * Create a new branch.
 * Validates code uniqueness within tenant and, if managerId provided,
 * that the employee belongs to the tenant.
 */
export async function createBranch(tenantId: string, data: CreateBranchInput) {
  // Check code uniqueness
  const existing = await prisma.branch.findUnique({
    where: { tenantId_code: { tenantId, code: data.code } },
  });
  if (existing) throw new Error(`Branch code "${data.code}" already exists`);

  // Validate managerId if provided
  if (data.managerId) {
    await assertEmployeeBelongsToTenant(data.managerId, tenantId);
  }

  return prisma.branch.create({
    data: {
      tenantId,
      name: data.name,
      code: data.code,
      address: data.address ? data.address : undefined,
      phone: data.phone ?? null,
      email: data.email ?? null,
      managerId: data.managerId ?? null,
    },
    include: {
      manager: { select: { id: true, firstName: true, lastName: true, jobTitle: true } },
    },
  });
}

/**
 * Partial update of a branch.
 * Re-validates code uniqueness and managerId ownership.
 */
export async function updateBranch(
  id: string,
  tenantId: string,
  data: UpdateBranchInput
) {
  await assertBranchBelongsToTenant(id, tenantId);

  // If code is changing, check uniqueness
  if (data.code) {
    const conflict = await prisma.branch.findFirst({
      where: {
        tenantId,
        code: data.code,
        NOT: { id },
      },
    });
    if (conflict) throw new Error(`Branch code "${data.code}" already exists`);
  }

  // Validate managerId if provided
  if (data.managerId) {
    await assertEmployeeBelongsToTenant(data.managerId, tenantId);
  }

  const updateData: any = {};
  if (data.name !== undefined) updateData.name = data.name;
  if (data.code !== undefined) updateData.code = data.code;
  if (data.address !== undefined) updateData.address = data.address;
  if (data.phone !== undefined) updateData.phone = data.phone;
  if (data.email !== undefined) updateData.email = data.email;
  // Allow explicit null to unset managerId
  if ('managerId' in data) updateData.managerId = data.managerId ?? null;

  return prisma.branch.update({
    where: { id },
    data: updateData,
    include: {
      manager: { select: { id: true, firstName: true, lastName: true, jobTitle: true } },
    },
  });
}

/**
 * Deactivate a branch (soft-disable).
 * Fails if there are active employees still assigned to it.
 */
export async function deactivateBranch(id: string, tenantId: string) {
  const branch = await assertBranchBelongsToTenant(id, tenantId);

  if (!branch.isActive) throw new Error('Branch is already inactive');

  const activeEmployeeCount = await prisma.employee.count({
    where: { branchId: id, tenantId, isActive: true },
  });

  if (activeEmployeeCount > 0) {
    throw new Error(
      `Cannot deactivate branch: ${activeEmployeeCount} active employee(s) are still assigned. Reassign or unassign them first.`
    );
  }

  return prisma.branch.update({
    where: { id },
    data: { isActive: false },
  });
}

/**
 * Assign an employee to a branch.
 * Both the branch and the employee must belong to the tenant.
 */
export async function assignEmployee(
  branchId: string,
  employeeId: string,
  tenantId: string
) {
  await assertBranchBelongsToTenant(branchId, tenantId);
  const employee = await assertEmployeeBelongsToTenant(employeeId, tenantId);

  if (employee.branchId === branchId) {
    throw new Error('Employee is already assigned to this branch');
  }

  return prisma.employee.update({
    where: { id: employeeId },
    data: { branchId },
    select: { id: true, firstName: true, lastName: true, branchId: true },
  });
}

/**
 * Unassign an employee from any branch (sets branchId to null).
 */
export async function unassignEmployee(employeeId: string, tenantId: string) {
  await assertEmployeeBelongsToTenant(employeeId, tenantId);

  return prisma.employee.update({
    where: { id: employeeId },
    data: { branchId: null },
    select: { id: true, firstName: true, lastName: true, branchId: true },
  });
}

/**
 * Transfer an employee from one branch to another.
 * Verifies tenant ownership of both branches and the employee.
 */
export async function transferEmployee(
  employeeId: string,
  fromBranchId: string,
  toBranchId: string,
  tenantId: string
) {
  const employee = await assertEmployeeBelongsToTenant(employeeId, tenantId);
  await assertBranchBelongsToTenant(fromBranchId, tenantId);
  await assertBranchBelongsToTenant(toBranchId, tenantId);

  if (fromBranchId === toBranchId) {
    throw new Error('Source and destination branches are the same');
  }

  if (employee.branchId !== fromBranchId) {
    throw new Error('Employee is not assigned to the specified source branch');
  }

  return prisma.employee.update({
    where: { id: employeeId },
    data: { branchId: toBranchId },
    select: { id: true, firstName: true, lastName: true, branchId: true },
  });
}

/**
 * Get a summary of stats per branch.
 * Note: activeInvoicesCount is always 0 because Invoice has no branchId in the schema.
 */
export async function getBranchSummary(tenantId: string): Promise<BranchSummary[]> {
  const branches = await prisma.branch.findMany({
    where: { tenantId },
    orderBy: { name: 'asc' },
    include: {
      manager: { select: { firstName: true, lastName: true } },
      employees: {
        select: { id: true },
        where: { isActive: true },
      },
    },
  });

  return branches.map(b => ({
    branchId: b.id,
    name: b.name,
    code: b.code,
    employeeCount: b.employees.length,
    activeInvoicesCount: 0, // Invoice model has no branchId — cannot aggregate per branch
    managerName: b.manager
      ? `${b.manager.firstName} ${b.manager.lastName}`
      : null,
    isActive: b.isActive,
  }));
}

/**
 * Get a consolidated headcount report across all branches for a date range.
 * Revenue per branch is not available because Invoice has no branchId —
 * instead we return total tenant revenue for the period as context.
 */
export async function getConsolidatedReport(
  tenantId: string,
  filters: { from: Date; to: Date }
): Promise<ConsolidatedReport> {
  const { from, to } = filters;

  // Fetch all branches with employee counts
  const branches = await prisma.branch.findMany({
    where: { tenantId },
    orderBy: { name: 'asc' },
    include: {
      employees: {
        select: { id: true },
        where: { isActive: true },
      },
    },
  });

  // Aggregate paid invoice revenue for the whole tenant in the date range
  // (Invoice has no branchId so we can only provide a tenant-level total)
  const revenueAgg = await prisma.invoice.aggregate({
    where: {
      tenantId,
      status: 'PAID',
      paidAt: { gte: from, lte: to },
      deletedAt: null,
    },
    _sum: { total: true },
  });

  const totalRevenue = Number(revenueAgg._sum.total ?? 0);
  const totalEmployees = branches.reduce((sum, b) => sum + b.employees.length, 0);

  return {
    from,
    to,
    totalEmployees,
    branches: branches.map(b => ({
      branchId: b.id,
      name: b.name,
      code: b.code,
      isActive: b.isActive,
      employeeCount: b.employees.length,
      // Revenue cannot be split per branch — distribute proportionally by headcount as best effort,
      // or set to 0 and expose total at top level. We expose 0 per branch and total at root.
      revenue: 0,
    })),
    // Attach tenant-level total as an extra field (typed as any to keep the interface clean)
    ...(({ totalRevenue }) => ({ totalRevenue }))(({ totalRevenue })),
  } as ConsolidatedReport & { totalRevenue: number };
}
