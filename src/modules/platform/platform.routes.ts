import { Router, Request, Response } from 'express';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { platformAuthenticate } from '../../middleware/platformAuth';
import { asyncHandler } from '../../shared/utils/asyncHandler';
import { sendSuccess, sendError } from '../../shared/utils/response';
import { PlatformAdminRequest } from '../../shared/types';
import { prisma } from '../../config/database';
import * as svc from './platform.service';

const router = Router();

// Rate limit for platform login
const platformLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1_000,
  max: 10,
  message: { success: false, error: 'Too many login attempts' },
});

// ─── Public: Platform Login ───────────────────────────────────────

router.post('/auth/login', platformLoginLimiter, asyncHandler(async (req: Request, res: Response) => {
  const { email, password } = req.body;
  if (!email || !password) {
    sendError(res, 'Email and password are required');
    return;
  }
  try {
    const result = await svc.loginPlatformAdmin(email, password);
    sendSuccess(res, result);
  } catch {
    sendError(res, 'Invalid credentials', 401);
  }
}));

// ─── Protected: all routes below require platform token ───────────
router.use(platformAuthenticate);

// ─── Platform Stats ───────────────────────────────────────────────

router.get('/stats', asyncHandler(async (_req: Request, res: Response) => {
  const stats = await svc.getPlatformStats();
  sendSuccess(res, stats);
}));

// ─── Tenant CRUD ──────────────────────────────────────────────────

router.get('/tenants', asyncHandler(async (req: Request, res: Response) => {
  const search = req.query.search as string | undefined;
  const tenants = await svc.listTenants(search);
  sendSuccess(res, tenants);
}));

router.post('/tenants', asyncHandler(async (req: Request, res: Response) => {
  const { name, businessNumber, vatNumber, email, phone, contactName,
          plan, maxUsers, maxEmployees,
          adminEmail, adminPassword, adminFirstName, adminLastName } = req.body;

  if (!name || !businessNumber || !adminEmail || !adminPassword || !adminFirstName || !adminLastName) {
    sendError(res, 'Missing required fields');
    return;
  }

  const tenant = await svc.createTenant({
    name, businessNumber, vatNumber, email, phone, contactName,
    plan, maxUsers, maxEmployees,
    adminEmail, adminPassword, adminFirstName, adminLastName,
  });

  sendSuccess(res, tenant, 201);
}));

router.get('/tenants/:id', asyncHandler(async (req: Request, res: Response) => {
  try {
    const tenant = await svc.getTenantDetail(req.params.id);
    sendSuccess(res, tenant);
  } catch {
    sendError(res, 'Tenant not found', 404);
  }
}));

router.patch('/tenants/:id', asyncHandler(async (req: Request, res: Response) => {
  const tenant = await svc.updateTenant(req.params.id, req.body);
  sendSuccess(res, tenant);
}));

router.post('/tenants/:id/suspend', asyncHandler(async (req: Request, res: Response) => {
  const { reason } = req.body;
  if (!reason) { sendError(res, 'Reason is required'); return; }
  const tenant = await svc.suspendTenant(req.params.id, reason);
  sendSuccess(res, tenant);
}));

router.post('/tenants/:id/activate', asyncHandler(async (req: Request, res: Response) => {
  const tenant = await svc.activateTenant(req.params.id);
  sendSuccess(res, tenant);
}));

router.delete('/tenants/:id', asyncHandler(async (req: Request, res: Response) => {
  try {
    await svc.deleteTenant(req.params.id);
    res.status(204).send();
  } catch (e: any) {
    if (e.message === 'NOT_FOUND') { sendError(res, 'Tenant not found', 404); return; }
    if (e.message === 'HAS_DATA')  { sendError(res, 'Cannot delete tenant with financial data'); return; }
    throw e;
  }
}));

// ─── Impersonation ────────────────────────────────────────────────

router.post('/tenants/:id/impersonate', asyncHandler(async (req: Request, res: Response) => {
  try {
    const result = await svc.impersonateTenant(req.params.id);
    sendSuccess(res, result);
  } catch (e: any) {
    if (e.message === 'NO_ADMIN') { sendError(res, 'No active admin found for this tenant', 404); return; }
    throw e;
  }
}));

// ─── Platform Admin Management ────────────────────────────────────

router.get('/admins', asyncHandler(async (_req: Request, res: Response) => {
  const admins = await svc.listPlatformAdmins();
  sendSuccess(res, admins);
}));

router.post('/admins', asyncHandler(async (req: Request, res: Response) => {
  const { email, password, name } = req.body;
  if (!email || !password || !name) { sendError(res, 'Missing required fields'); return; }
  const admin = await svc.createPlatformAdmin(email, password, name);
  sendSuccess(res, admin, 201);
}));

router.patch('/admins/:id/deactivate', asyncHandler(async (req: Request, res: Response) => {
  const requester = (req as any).platformAdmin.adminId;
  try {
    const admin = await svc.deactivatePlatformAdmin(req.params.id, requester);
    sendSuccess(res, admin);
  } catch (e: any) {
    if (e.message === 'SELF_DEACTIVATE') { sendError(res, 'Cannot deactivate yourself'); return; }
    if (e.message === 'LAST_ADMIN') { sendError(res, 'Cannot deactivate the last active admin'); return; }
    throw e;
  }
}));

router.patch('/admins/:id/activate', asyncHandler(async (req: Request, res: Response) => {
  const admin = await svc.reactivatePlatformAdmin(req.params.id);
  sendSuccess(res, admin);
}));

// ─── Platform Activity ────────────────────────────────────────────

router.get('/activity', asyncHandler(async (_req: Request, res: Response) => {
  const activity = await svc.getPlatformActivity();
  sendSuccess(res, activity);
}));

// ─── Support Tickets (Platform Admin manages) ────────────────────

// List all tickets across tenants
router.get('/support-tickets', asyncHandler(async (req: Request, res: Response) => {
  const { status, tenantId } = req.query as any;
  const where: any = {};
  if (status) where.status = status;
  if (tenantId) where.tenantId = tenantId;

  const tickets = await prisma.supportTicket.findMany({
    where,
    include: { tenant: { select: { name: true } } },
    orderBy: { createdAt: 'desc' },
  });
  sendSuccess(res, tickets);
}));

// Get single ticket
router.get('/support-tickets/:id', asyncHandler(async (req: Request, res: Response) => {
  const ticket = await prisma.supportTicket.findUnique({
    where: { id: req.params.id },
    include: { tenant: { select: { name: true, email: true, phone: true } } },
  });
  if (!ticket) return sendError(res, 'Ticket not found', 404);
  sendSuccess(res, ticket);
}));

// Reply to ticket (platform admin)
router.post('/support-tickets/:id/reply', asyncHandler(async (req: Request, res: Response) => {
  const { message } = z.object({ message: z.string().min(1) }).parse(req.body);
  const platformReq = req as PlatformAdminRequest;

  const ticket = await prisma.supportTicket.findUnique({ where: { id: req.params.id } });
  if (!ticket) return sendError(res, 'Ticket not found', 404);

  const messages = Array.isArray(ticket.messages) ? (ticket.messages as any[]) : [];
  messages.push({
    sender: platformReq.platformAdmin?.email || 'Platform Admin',
    senderType: 'platform',
    message,
    createdAt: new Date().toISOString(),
  });

  const updated = await prisma.supportTicket.update({
    where: { id: ticket.id },
    data: {
      messages,
      status: 'WAITING_FOR_CUSTOMER',
      assignedTo: platformReq.platformAdmin?.adminId,
    },
  });
  sendSuccess(res, updated);
}));

// Update ticket status
router.patch('/support-tickets/:id/status', asyncHandler(async (req: Request, res: Response) => {
  const { status } = z.object({
    status: z.enum(['OPEN', 'IN_PROGRESS', 'WAITING_FOR_CUSTOMER', 'RESOLVED', 'CLOSED']),
  }).parse(req.body);

  const data: any = { status };
  if (status === 'RESOLVED') data.resolvedAt = new Date();
  if (status === 'CLOSED') data.closedAt = new Date();

  const updated = await prisma.supportTicket.update({
    where: { id: req.params.id },
    data,
  });
  sendSuccess(res, updated);
}));

export default router;
