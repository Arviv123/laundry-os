import { Router, Request, Response } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { authenticate } from '../../middleware/auth';
import { requireRole } from '../../middleware/rbac';
import { AuthenticatedRequest } from '../../shared/types';
import { sendSuccess, sendError } from '../../shared/utils/response';
import { asyncHandler } from '../../shared/utils/asyncHandler';
import { prisma } from '../../config/database';
import { initTenantDefaults } from '../accounting/default-chart';

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1_000, // 1 hour
  max: 10,
  message: { success: false, error: 'יותר מדי ניסיונות רישום — נסה שוב בעוד שעה' },
});

const router = Router();

// ─── Public: Register a new tenant (business) ────────────────────

const RegisterSchema = z.object({
  // Business info
  businessName:   z.string().min(2),
  businessNumber: z.string().min(8),  // ח.פ. / ע.מ.
  vatNumber:      z.string().optional(),
  phone:          z.string().optional(),
  email:          z.string().email().optional(),
  address: z.object({
    street:  z.string(),
    city:    z.string(),
    zip:     z.string().optional(),
    country: z.string().default('IL'),
  }),
  // First admin user
  adminFirstName: z.string().min(1),
  adminLastName:  z.string().min(1),
  adminEmail:     z.string().email(),
  adminPassword:  z.string().min(8),
  // Subscription plan
  plan: z.enum(['STARTER', 'PROFESSIONAL', 'ENTERPRISE']).default('STARTER'),
});

router.post(
  '/register',
  registerLimiter,
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = RegisterSchema.safeParse(req.body);
    if (!parsed.success) {
      sendError(res, parsed.error.message);
      return;
    }

    const {
      businessName, businessNumber, vatNumber, phone, email, address,
      adminFirstName, adminLastName, adminEmail, adminPassword, plan,
    } = parsed.data;

    // Check business number uniqueness
    const existingTenant = await prisma.tenant.findUnique({
      where: { businessNumber },
    });
    if (existingTenant) {
      sendError(res, 'Business number already registered', 409);
      return;
    }

    // Check admin email uniqueness across all tenants
    const existingUser = await prisma.user.findFirst({
      where: { email: adminEmail },
    });
    if (existingUser) {
      sendError(res, 'Email already in use', 409);
      return;
    }

    const passwordHash = await bcrypt.hash(adminPassword, 12);

    // Create tenant + admin user + defaults in one transaction
    const result = await prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: {
          name:           businessName,
          businessNumber,
          vatNumber,
          phone,
          email,
          address,
          taxSettings: { vatRate: 0.18, taxYear: 2026 },
          settings:    { plan, trialEndsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) },
        },
      });

      const adminUser = await tx.user.create({
        data: {
          tenantId:     tenant.id,
          email:        adminEmail,
          passwordHash,
          role:         'ADMIN',
          firstName:    adminFirstName,
          lastName:     adminLastName,
        },
        select: { id: true, email: true, role: true },
      });

      // Seed chart of accounts, Israeli holidays, leave types
      await initTenantDefaults(tenant.id, tx);

      return { tenant, adminUser };
    }, { timeout: 30_000 });

    sendSuccess(res, {
      tenantId:   result.tenant.id,
      tenantName: result.tenant.name,
      plan,
      adminUser:  result.adminUser,
      message:    'הרישום הושלם בהצלחה! התחבר עם פרטי המנהל שלך.',
    }, 201);
  })
);

// ─── Protected Routes (require auth) ─────────────────────────────

router.use(authenticate as any);

// GET /tenants/me — current tenant info
router.get(
  '/me',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenant = await prisma.tenant.findUnique({
      where: { id: req.user.tenantId },
      select: {
        id: true, name: true, businessNumber: true, vatNumber: true,
        address: true, phone: true, email: true, logoUrl: true,
        taxSettings: true, settings: true, createdAt: true,
        _count: { select: { users: true, employees: true, customers: true } },
      },
    });

    if (!tenant) { sendError(res, 'Tenant not found', 404); return; }
    sendSuccess(res, tenant);
  })
);

// PATCH /tenants/settings — update settings
router.patch(
  '/settings',
  requireRole('ADMIN', 'SUPER_ADMIN') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const schema = z.object({
      phone:       z.string().optional(),
      email:       z.string().email().optional(),
      logoUrl:     z.string().url().optional(),
      taxSettings: z.record(z.any()).optional(),
      settings:    z.record(z.any()).optional(),
      address:     z.record(z.any()).optional(),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) { sendError(res, parsed.error.message); return; }

    const current = await prisma.tenant.findUnique({
      where: { id: req.user.tenantId },
      select: { taxSettings: true, settings: true },
    });

    const updated = await prisma.tenant.update({
      where: { id: req.user.tenantId },
      data: {
        ...parsed.data,
        taxSettings: parsed.data.taxSettings
          ? { ...(current?.taxSettings as object), ...parsed.data.taxSettings }
          : undefined,
        settings: parsed.data.settings
          ? { ...(current?.settings as object), ...parsed.data.settings }
          : undefined,
      },
    });

    sendSuccess(res, updated);
  })
);

export default router;
