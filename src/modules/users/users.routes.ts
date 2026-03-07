import { Router, Response } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { randomBytes } from 'crypto';
import { authenticate } from '../../middleware/auth';
import { enforceTenantIsolation, withTenant } from '../../middleware/tenant';
import { requireMinRole } from '../../middleware/rbac';
import { AuthenticatedRequest } from '../../shared/types/index';
import { sendSuccess, sendError } from '../../shared/utils/response';
import { asyncHandler } from '../../shared/utils/asyncHandler';
import { prisma } from '../../config/database';
import rateLimit from 'express-rate-limit';

const forgotPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1_000, // 15 minutes
  max: 5,
  message: { success: false, error: 'Too many reset attempts. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const router = Router();

// ─── Public: Login ────────────────────────────────────────────────

router.post('/auth/login', asyncHandler(async (req, res: Response) => {
  const schema = z.object({
    email:    z.string().email(),
    password: z.string().min(8),
    tenantId: z.string().optional(), // optional — lookup by email if not provided
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { sendError(res, parsed.error.message); return; }

  const whereClause = parsed.data.tenantId
    ? { email: parsed.data.email, tenantId: parsed.data.tenantId }
    : { email: parsed.data.email };

  const user = await prisma.user.findFirst({
    where:   whereClause,
    include: { tenant: { select: { isActive: true } } },
  });

  if (!user || !user.isActive || !user.tenant?.isActive) {
    sendError(res, 'Invalid credentials', 401);
    return;
  }

  const passwordMatch = await bcrypt.compare(parsed.data.password, user.passwordHash);
  if (!passwordMatch) {
    sendError(res, 'Invalid credentials', 401);
    return;
  }

  const token = jwt.sign(
    { userId: user.id, tenantId: user.tenantId, role: user.role, email: user.email },
    process.env.JWT_SECRET!,
    { expiresIn: process.env.JWT_EXPIRES_IN ?? '7d' } as any
  );

  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

  sendSuccess(res, {
    token,
    user: { id: user.id, email: user.email, role: user.role, firstName: user.firstName, lastName: user.lastName },
  });
}));

// ─── Protected Routes ─────────────────────────────────────────────

router.use(authenticate as any);
router.use(enforceTenantIsolation as any);

// GET /users  (admin only)
router.get(
  '/',
  requireMinRole('ADMIN') as any,
  async (req: AuthenticatedRequest, res: Response) => {
    const users = await prisma.user.findMany({
      where:  withTenant(req),
      select: { id: true, email: true, role: true, firstName: true, lastName: true, isActive: true, lastLoginAt: true },
      orderBy: { lastName: 'asc' },
    });
    sendSuccess(res, users);
  }
);

// GET /users/me
router.get('/me', async (req: AuthenticatedRequest, res: Response) => {
  const user = await prisma.user.findUnique({
    where:  { id: req.user.userId },
    select: { id: true, email: true, role: true, firstName: true, lastName: true },
  });
  sendSuccess(res, user);
});

// POST /users  (create new user)
router.post(
  '/',
  requireMinRole('ADMIN') as any,
  async (req: AuthenticatedRequest, res: Response) => {
    const schema = z.object({
      email:     z.string().email(),
      password:  z.string().min(8),
      role:      z.enum(['EMPLOYEE', 'SALESPERSON', 'HR_MANAGER', 'ACCOUNTANT', 'ADMIN']),
      firstName: z.string().min(1),
      lastName:  z.string().min(1),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) { sendError(res, parsed.error.message); return; }

    const passwordHash = await bcrypt.hash(parsed.data.password, 12);

    try {
      const user = await prisma.user.create({
        data: {
          ...parsed.data,
          passwordHash,
          tenantId: req.user.tenantId,
        },
        select: { id: true, email: true, role: true, firstName: true, lastName: true },
      });
      sendSuccess(res, user, 201);
    } catch (err: any) {
      if (err.code === 'P2002') sendError(res, 'Email already exists for this tenant');
      else throw err;
    }
  }
);

// PATCH /users/:id/role
router.patch(
  '/:id/role',
  requireMinRole('ADMIN') as any,
  async (req: AuthenticatedRequest, res: Response) => {
    const schema = z.object({
      role: z.enum(['EMPLOYEE', 'SALESPERSON', 'HR_MANAGER', 'ACCOUNTANT', 'ADMIN']),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) { sendError(res, parsed.error.message); return; }

    const user = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!user || user.tenantId !== req.user.tenantId) { sendError(res, 'User not found', 404); return; }

    const updated = await prisma.user.update({
      where: { id: req.params.id },
      data:  { role: parsed.data.role },
      select: { id: true, email: true, role: true },
    });
    sendSuccess(res, updated);
  }
);

// ─── Password Reset ───────────────────────────────────────────────

// POST /users/auth/forgot-password — request reset token
router.post('/auth/forgot-password', forgotPasswordLimiter, asyncHandler(async (req: any, res: Response) => {
  const schema = z.object({
    email:    z.string().email(),
    tenantId: z.string().min(1),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { sendError(res, parsed.error.message); return; }

  const user = await prisma.user.findFirst({
    where: { email: parsed.data.email, tenantId: parsed.data.tenantId, isActive: true },
  });

  // Always return success to prevent email enumeration
  if (!user) { sendSuccess(res, { message: 'If the email exists, a reset link was sent' }); return; }

  // Invalidate old tokens
  await prisma.passwordResetToken.updateMany({
    where: { userId: user.id, usedAt: null },
    data:  { usedAt: new Date() },
  });

  const token = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

  await prisma.passwordResetToken.create({
    data: { tenantId: user.tenantId, userId: user.id, token, expiresAt },
  });

  // In production: send email via sendgrid/resend/nodemailer
  // For now, return token directly (dev only)
  const isDev = (process.env.NODE_ENV ?? 'development') === 'development';
  sendSuccess(res, {
    message: 'If the email exists, a reset link was sent',
    ...(isDev ? { devToken: token } : {}),
  });
}));

// POST /users/auth/reset-password — use token to set new password
router.post('/auth/reset-password', asyncHandler(async (req: any, res: Response) => {
  const schema = z.object({
    token:       z.string().min(1),
    newPassword: z.string().min(8),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { sendError(res, parsed.error.message); return; }

  const resetToken = await prisma.passwordResetToken.findUnique({
    where: { token: parsed.data.token },
  });

  if (!resetToken || resetToken.usedAt || resetToken.expiresAt < new Date()) {
    sendError(res, 'Invalid or expired reset token', 400);
    return;
  }

  const passwordHash = await bcrypt.hash(parsed.data.newPassword, 12);

  await prisma.$transaction([
    prisma.user.update({ where: { id: resetToken.userId }, data: { passwordHash } }),
    prisma.passwordResetToken.update({ where: { id: resetToken.id }, data: { usedAt: new Date() } }),
  ]);

  sendSuccess(res, { message: 'Password changed successfully' });
}));

// ─── Change Password (logged in) ──────────────────────────────────

router.post('/auth/change-password', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const schema = z.object({
    currentPassword: z.string().min(1),
    newPassword:     z.string().min(8),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { sendError(res, parsed.error.message); return; }

  const user = await prisma.user.findUnique({ where: { id: req.user.userId } });
  if (!user) { sendError(res, 'User not found', 404); return; }

  const match = await bcrypt.compare(parsed.data.currentPassword, user.passwordHash);
  if (!match) { sendError(res, 'Current password is incorrect', 400); return; }

  const passwordHash = await bcrypt.hash(parsed.data.newPassword, 12);
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });

  sendSuccess(res, { message: 'Password changed successfully' });
}));

// ─── API Keys ─────────────────────────────────────────────────────

// GET /users/api-keys
router.get(
  '/api-keys',
  requireMinRole('ADMIN') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const keys = await prisma.apiKey.findMany({
      where:   withTenant(req),
      select:  { id: true, name: true, keyPrefix: true, scopes: true, isActive: true, lastUsedAt: true, expiresAt: true, createdAt: true, createdBy: true },
      orderBy: { createdAt: 'desc' },
    });
    sendSuccess(res, keys);
  })
);

// POST /users/api-keys — generate new API key
router.post(
  '/api-keys',
  requireMinRole('ADMIN') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const schema = z.object({
      name:      z.string().min(1),
      scopes:    z.array(z.string()).default(['read:*']),
      expiresAt: z.string().datetime().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) { sendError(res, parsed.error.message); return; }

    // Generate a raw key: erpk_<random>
    const rawKey   = 'erpk_' + randomBytes(24).toString('hex');
    const keyHash  = await bcrypt.hash(rawKey, 10);
    const keyPrefix = rawKey.slice(0, 12);

    const apiKey = await prisma.apiKey.create({
      data: {
        tenantId:  req.user.tenantId,
        name:      parsed.data.name,
        keyHash,
        keyPrefix,
        scopes:    parsed.data.scopes,
        expiresAt: parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : undefined,
        createdBy: req.user.userId,
      },
      select: { id: true, name: true, keyPrefix: true, scopes: true, expiresAt: true, createdAt: true },
    });

    // Return raw key ONLY on creation — never stored in plaintext
    sendSuccess(res, { ...apiKey, key: rawKey }, 201);
  })
);

// DELETE /users/api-keys/:id — revoke
router.delete(
  '/api-keys/:id',
  requireMinRole('ADMIN') as any,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const key = await prisma.apiKey.findUnique({ where: { id: req.params.id } });
    if (!key || key.tenantId !== req.user.tenantId) { sendError(res, 'API key not found', 404); return; }
    await prisma.apiKey.update({ where: { id: req.params.id }, data: { isActive: false } });
    sendSuccess(res, { message: 'API key revoked' });
  })
);

export default router;
