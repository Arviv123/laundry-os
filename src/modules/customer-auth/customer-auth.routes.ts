/**
 * Customer Auth Routes — אימות לקוח בטלפון + OTP
 * Phone + OTP login for customer-facing apps
 */
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import jwt from 'jsonwebtoken';
import { sendSuccess, sendError } from '../../shared/utils/response';
import { asyncHandler } from '../../shared/utils/asyncHandler';
import { prisma } from '../../config/database';
import { logger } from '../../config/logger';
import { generateOTP, verifyOTP } from './otp.service';
import { formatIsraeliPhone, sendCustomMessage } from '../whatsapp/whatsapp.service';

const router = Router();

// ─── Send OTP ────────────────────────────────────────────────────

const sendOtpSchema = z.object({
  phone: z.string().min(9),
  tenantSlug: z.string().min(1),
});

router.post('/send-otp', asyncHandler(async (req: Request, res: Response) => {
  const { phone, tenantSlug } = sendOtpSchema.parse(req.body);

  // Find tenant by id, then by name
  let tenant = await prisma.tenant.findUnique({ where: { id: tenantSlug } });
  if (!tenant) {
    tenant = await prisma.tenant.findFirst({
      where: { name: { contains: tenantSlug, mode: 'insensitive' } },
    });
  }

  if (!tenant) {
    return sendError(res, 'עסק לא נמצא', 404);
  }

  const code = generateOTP(phone);

  // Try sending OTP via WhatsApp
  try {
    const normalizedPhone = formatIsraeliPhone(phone);
    await sendCustomMessage(tenant.id, normalizedPhone, 'קוד אימות: ' + code);
  } catch (err) {
    logger.warn('Failed to send OTP via WhatsApp, code still generated', {
      phone: phone.slice(-4),
      error: err instanceof Error ? err.message : String(err),
    });
  }

  sendSuccess(res, {
    success: true,
    message: 'OTP sent',
    ...(process.env.NODE_ENV !== 'production' ? { code } : {}),
  });
}));

// ─── Verify OTP ──────────────────────────────────────────────────

const verifyOtpSchema = z.object({
  phone: z.string().min(9),
  tenantSlug: z.string().min(1),
  code: z.string().min(4).max(6),
});

router.post('/verify-otp', asyncHandler(async (req: Request, res: Response) => {
  const { phone, tenantSlug, code } = verifyOtpSchema.parse(req.body);

  // Find tenant by id, then by name
  let tenant = await prisma.tenant.findUnique({ where: { id: tenantSlug } });
  if (!tenant) {
    tenant = await prisma.tenant.findFirst({
      where: { name: { contains: tenantSlug, mode: 'insensitive' } },
    });
  }

  if (!tenant) {
    return sendError(res, 'עסק לא נמצא', 404);
  }

  // Verify OTP
  if (!verifyOTP(phone, code)) {
    return sendError(res, 'קוד אימות שגוי או פג תוקף', 401);
  }

  const normalizedPhone = formatIsraeliPhone(phone);

  // Find or create customer — try both normalized and original formats
  let customer = await prisma.customer.findFirst({
    where: {
      tenantId: tenant.id,
      OR: [
        { phone: normalizedPhone },
        { phone: phone },
        { phone: { contains: phone.replace(/^0/, '') } },
      ],
    },
  });

  if (!customer) {
    customer = await prisma.customer.create({
      data: {
        tenantId: tenant.id,
        name: 'לקוח חדש',
        phone: normalizedPhone,
      },
    });
    logger.info('New customer created via OTP', { customerId: customer.id, phone: normalizedPhone.slice(-4) });
  }

  // Generate JWT
  const token = jwt.sign(
    { customerId: customer.id, tenantId: tenant.id, role: 'CUSTOMER' },
    process.env.JWT_SECRET!,
    { expiresIn: '30d' }
  );

  sendSuccess(res, { token, customer });
}));

// ─── Me (authenticated) ─────────────────────────────────────────

router.get('/me', asyncHandler(async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return sendError(res, 'Unauthorized - missing token', 401);
  }

  const token = authHeader.split(' ')[1];

  let payload: { customerId: string; tenantId: string; role: string };
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET!) as typeof payload;
  } catch {
    return sendError(res, 'Unauthorized - invalid token', 401);
  }

  if (!payload.customerId) {
    return sendError(res, 'Unauthorized - not a customer token', 401);
  }

  const customer = await prisma.customer.findUnique({
    where: { id: payload.customerId },
    include: {
      laundryOrders: {
        orderBy: { receivedAt: 'desc' },
        take: 10,
      },
    },
  });

  if (!customer) {
    return sendError(res, 'לקוח לא נמצא', 404);
  }

  sendSuccess(res, customer);
}));

export default router;
