/**
 * Support Tickets — קריאות תמיכה של טנאנטים לבעל הפלטפורמה
 */
import { Router, Response } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth';
import { enforceTenantIsolation } from '../../middleware/tenant';
import { AuthenticatedRequest } from '../../shared/types';
import { sendSuccess, sendError } from '../../shared/utils/response';
import { asyncHandler } from '../../shared/utils/asyncHandler';
import { prisma } from '../../config/database';

const router = Router();
router.use(authenticate as any);
router.use(enforceTenantIsolation as any);

// ─── Generate ticket number ─────────────────────────────────
async function generateTicketNumber(): Promise<string> {
  const count = await prisma.supportTicket.count();
  return `TK-${String(count + 1).padStart(4, '0')}`;
}

// ─── Schemas ─────────────────────────────────────────────────

const CreateTicketSchema = z.object({
  subject: z.string().min(1).max(200),
  description: z.string().min(1).max(5000),
  category: z.enum(['general', 'billing', 'technical', 'feature_request', 'bug']).default('general'),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).default('MEDIUM'),
});

const AddMessageSchema = z.object({
  message: z.string().min(1).max(5000),
});

// ─── List Tickets ────────────────────────────────────────────

router.get('/', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { status } = req.query;

  const where: any = { tenantId: req.user.tenantId };
  if (status) where.status = status;

  const tickets = await prisma.supportTicket.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    select: {
      id: true, ticketNumber: true, subject: true, category: true,
      status: true, priority: true, createdAt: true, updatedAt: true,
      resolvedAt: true, closedAt: true,
    },
  });

  sendSuccess(res, tickets);
}));

// ─── Get Ticket Detail ──────────────────────────────────────

router.get('/:id', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const ticket = await prisma.supportTicket.findFirst({
    where: { id: req.params.id, tenantId: req.user.tenantId },
  });
  if (!ticket) return sendError(res, 'קריאה לא נמצאה', 404);

  sendSuccess(res, ticket);
}));

// ─── Create Ticket ──────────────────────────────────────────

router.post('/', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const data = CreateTicketSchema.parse(req.body);
  const ticketNumber = await generateTicketNumber();

  const initialMessage = {
    sender: req.user.email || req.user.userId,
    senderType: 'tenant',
    message: data.description,
    createdAt: new Date().toISOString(),
  };

  const ticket = await prisma.supportTicket.create({
    data: {
      tenantId: req.user.tenantId,
      userId: req.user.userId,
      ticketNumber,
      subject: data.subject,
      description: data.description,
      category: data.category,
      priority: data.priority,
      messages: [initialMessage],
    },
  });

  sendSuccess(res, ticket, 201);
}));

// ─── Add Message to Ticket ──────────────────────────────────

router.post('/:id/messages', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { message } = AddMessageSchema.parse(req.body);

  const ticket = await prisma.supportTicket.findFirst({
    where: { id: req.params.id, tenantId: req.user.tenantId },
  });
  if (!ticket) return sendError(res, 'קריאה לא נמצאה', 404);

  if (ticket.status === 'CLOSED') {
    return sendError(res, 'לא ניתן להוסיף הודעה לקריאה סגורה', 400);
  }

  const messages = Array.isArray(ticket.messages) ? (ticket.messages as any[]) : [];
  messages.push({
    sender: req.user.email || req.user.userId,
    senderType: 'tenant',
    message,
    createdAt: new Date().toISOString(),
  });

  const updated = await prisma.supportTicket.update({
    where: { id: ticket.id },
    data: {
      messages,
      status: ticket.status === 'WAITING_FOR_CUSTOMER' ? 'IN_PROGRESS' : ticket.status,
    },
  });

  sendSuccess(res, updated);
}));

// ─── Close Ticket (by tenant) ───────────────────────────────

router.patch('/:id/close', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const ticket = await prisma.supportTicket.findFirst({
    where: { id: req.params.id, tenantId: req.user.tenantId },
  });
  if (!ticket) return sendError(res, 'קריאה לא נמצאה', 404);

  const updated = await prisma.supportTicket.update({
    where: { id: ticket.id },
    data: { status: 'CLOSED', closedAt: new Date() },
  });

  sendSuccess(res, updated);
}));

export default router;
