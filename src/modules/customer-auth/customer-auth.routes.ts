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
    ...(process.env.NODE_ENV === 'development' ? { code } : {}),
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

  const customer = await prisma.customer.findFirst({
    where: { id: payload.customerId, tenantId: payload.tenantId },
    include: {
      laundryOrders: {
        where: { tenantId: payload.tenantId },
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

// ─── Helper: extract & verify customer JWT ──────────────────────

function extractCustomerPayload(req: Request): { customerId: string; tenantId: string } | null {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return null;
  try {
    const payload = jwt.verify(authHeader.split(' ')[1], process.env.JWT_SECRET!) as any;
    if (!payload.customerId) return null;
    return { customerId: payload.customerId, tenantId: payload.tenantId };
  } catch {
    return null;
  }
}

// ─── GET /customer-auth/orders — all orders ─────────────────────

router.get('/orders', asyncHandler(async (req: Request, res: Response) => {
  const payload = extractCustomerPayload(req);
  if (!payload) return sendError(res, 'Unauthorized', 401);

  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
  const status = req.query.status as string | undefined;

  const where: any = { customerId: payload.customerId, tenantId: payload.tenantId };
  if (status) where.status = status;

  const [orders, total] = await Promise.all([
    prisma.laundryOrder.findMany({
      where,
      include: { items: { include: { service: true } } },
      orderBy: { receivedAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.laundryOrder.count({ where }),
  ]);

  sendSuccess(res, { orders, total, page, totalPages: Math.ceil(total / limit) });
}));

// ─── POST /customer-auth/orders — request pickup ────────────────

const pickupSchema = z.object({
  address: z.object({
    street: z.string().min(1),
    city: z.string().min(1),
    floor: z.string().optional(),
    apartment: z.string().optional(),
    notes: z.string().optional(),
  }),
  notes: z.string().optional(),
  preferredDate: z.string().optional(),
  preferredTime: z.string().optional(),
});

router.post('/orders', asyncHandler(async (req: Request, res: Response) => {
  const payload = extractCustomerPayload(req);
  if (!payload) return sendError(res, 'Unauthorized', 401);

  const parsed = pickupSchema.safeParse(req.body);
  if (!parsed.success) return sendError(res, parsed.error.message, 400);

  const { address, notes, preferredDate, preferredTime } = parsed.data;

  const orderNumber = `ORD-${new Date().getFullYear()}-PICK-${Date.now().toString(36).toUpperCase()}`;

  const order = await prisma.laundryOrder.create({
    data: {
      tenantId: payload.tenantId,
      orderNumber,
      customerId: payload.customerId,
      status: 'PENDING_PICKUP',
      priority: 'NORMAL',
      source: 'ONLINE',
      deliveryType: 'HOME_DELIVERY',
      deliveryAddress: address,
      notes: [notes, preferredTime ? `זמן מועדף: ${preferredTime}` : ''].filter(Boolean).join(' | ') || 'בקשת איסוף מהאפליקציה',
      promisedAt: preferredDate ? new Date(preferredDate) : undefined,
      subtotal: 0,
      deliveryFee: 0,
      vatAmount: 0,
      total: 0,
      statusHistory: [{ status: 'PENDING_PICKUP', changedAt: new Date(), note: 'בקשת איסוף מאפליקציית לקוח' }],
    },
  });

  sendSuccess(res, order, 201);
}));

// ─── GET /customer-auth/prepaid — prepaid balance ───────────────

router.get('/prepaid', asyncHandler(async (req: Request, res: Response) => {
  const payload = extractCustomerPayload(req);
  if (!payload) return sendError(res, 'Unauthorized', 401);

  const account = await prisma.prepaidAccount.findFirst({
    where: { customerId: payload.customerId, tenantId: payload.tenantId },
  });

  sendSuccess(res, account ?? { balance: 0, currency: 'ILS' });
}));

// ─── PATCH /customer-auth/profile — update name ─────────────────

router.patch('/profile', asyncHandler(async (req: Request, res: Response) => {
  const payload = extractCustomerPayload(req);
  if (!payload) return sendError(res, 'Unauthorized', 401);

  const { name, email } = z.object({
    name: z.string().min(1).optional(),
    email: z.string().email().optional(),
  }).parse(req.body);

  const customer = await prisma.customer.update({
    where: { id: payload.customerId },
    data: { ...(name && { name }), ...(email && { email }) },
  });

  sendSuccess(res, customer);
}));

export default router;
