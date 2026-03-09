/**
 * Marketing Automations & Campaigns Router
 *
 * Mounted at: /api/automations
 *
 * All routes require:
 *   - authenticate             — valid JWT
 *   - enforceTenantIsolation   — active tenant
 */

import { Router, Response } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth';
import { enforceTenantIsolation } from '../../middleware/tenant';
import { requireMinRole } from '../../middleware/rbac';
import { AuthenticatedRequest } from '../../shared/types';
import { sendSuccess, sendError } from '../../shared/utils/response';
import { asyncHandler } from '../../shared/utils/asyncHandler';
import { prisma } from '../../config/database';
import { sendCustomMessage, formatIsraeliPhone } from '../whatsapp/whatsapp.service';
import { logger } from '../../config/logger';

const router = Router();

// Apply auth and tenant guards to every route in this router
router.use(authenticate as any);
router.use(enforceTenantIsolation as any);
router.use(requireMinRole('ADMIN') as any);

// ─── Validation Schemas ──────────────────────────────────────────────────────

const CreateAutomationSchema = z.object({
  name:       z.string().min(1),
  trigger:    z.enum(['ORDER_STATUS_CHANGE', 'ORDER_CREATED', 'CUSTOMER_BIRTHDAY', 'CUSTOMER_INACTIVITY', 'SCHEDULED']),
  channel:    z.enum(['WHATSAPP', 'SMS', 'EMAIL', 'IN_APP']),
  template:   z.string().min(1),
  conditions: z.record(z.any()).optional(),
  isActive:   z.boolean().optional(),
});

const CreateCampaignSchema = z.object({
  name:        z.string().min(1),
  channel:     z.enum(['WHATSAPP', 'SMS', 'EMAIL', 'IN_APP']),
  template:    z.string().min(1),
  targetQuery: z.record(z.any()).optional(),
  scheduledAt: z.string().datetime().optional(),
});

// ═══════════════════════════════════════════════════════════════════════════════
// Automations CRUD
// ═══════════════════════════════════════════════════════════════════════════════

// ─── GET /api/automations ────────────────────────────────────────────────────
// List all automations for the tenant
router.get(
  '/',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const automations = await prisma.marketingAutomation.findMany({
      where: { tenantId: req.user.tenantId },
      orderBy: { createdAt: 'desc' },
    });
    sendSuccess(res, automations);
  })
);

// ─── POST /api/automations ───────────────────────────────────────────────────
// Create a new automation
router.post(
  '/',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const parsed = CreateAutomationSchema.safeParse(req.body);
    if (!parsed.success) { sendError(res, parsed.error.message); return; }

    const automation = await prisma.marketingAutomation.create({
      data: {
        ...parsed.data,
        tenantId: req.user.tenantId,
      },
    });
    sendSuccess(res, automation, 201);
  })
);

// ─── PATCH /api/automations/:id ──────────────────────────────────────────────
// Update an existing automation
router.patch(
  '/:id',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const parsed = CreateAutomationSchema.partial().safeParse(req.body);
    if (!parsed.success) { sendError(res, parsed.error.message); return; }

    const existing = await prisma.marketingAutomation.findUnique({ where: { id: req.params.id } });
    if (!existing || existing.tenantId !== req.user.tenantId) {
      sendError(res, 'Automation not found', 404);
      return;
    }

    const updated = await prisma.marketingAutomation.update({
      where: { id: req.params.id },
      data: parsed.data,
    });
    sendSuccess(res, updated);
  })
);

// ─── DELETE /api/automations/:id ─────────────────────────────────────────────
// Delete an automation
router.delete(
  '/:id',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const existing = await prisma.marketingAutomation.findUnique({ where: { id: req.params.id } });
    if (!existing || existing.tenantId !== req.user.tenantId) {
      sendError(res, 'Automation not found', 404);
      return;
    }

    await prisma.marketingAutomation.delete({ where: { id: req.params.id } });
    sendSuccess(res, { message: 'Automation deleted' });
  })
);

// ─── POST /api/automations/:id/test ──────────────────────────────────────────
// Test an automation by sending the template to a test phone number
router.post(
  '/:id/test',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { phone } = req.body;
    if (!phone) { sendError(res, 'phone is required'); return; }

    const automation = await prisma.marketingAutomation.findUnique({ where: { id: req.params.id } });
    if (!automation || automation.tenantId !== req.user.tenantId) {
      sendError(res, 'Automation not found', 404);
      return;
    }

    // Replace template variables with sample data
    const sampleData: Record<string, string> = {
      customerName: 'לקוח לדוגמה',
      orderNumber:  'ORD-2026-TEST',
      status:       'מוכן לאיסוף',
      total:        '150.00',
      businessName: 'העסק שלך',
    };

    let message = automation.template;
    for (const [key, value] of Object.entries(sampleData)) {
      message = message.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
    }

    const formattedPhone = formatIsraeliPhone(phone);
    const result = await sendCustomMessage(req.user.tenantId, formattedPhone, message);

    if (result.success) {
      sendSuccess(res, { message: 'Test message sent', phone: formattedPhone });
    } else {
      sendError(res, result.error ?? 'Failed to send test message', 500);
    }
  })
);

// ═══════════════════════════════════════════════════════════════════════════════
// Campaigns CRUD
// ═══════════════════════════════════════════════════════════════════════════════

// ─── GET /api/automations/campaigns ──────────────────────────────────────────
// List all campaigns for the tenant
router.get(
  '/campaigns',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const campaigns = await prisma.marketingCampaign.findMany({
      where: { tenantId: req.user.tenantId },
      orderBy: { createdAt: 'desc' },
    });
    sendSuccess(res, campaigns);
  })
);

// ─── POST /api/automations/campaigns ─────────────────────────────────────────
// Create a new campaign
router.post(
  '/campaigns',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const parsed = CreateCampaignSchema.safeParse(req.body);
    if (!parsed.success) { sendError(res, parsed.error.message); return; }

    const campaign = await prisma.marketingCampaign.create({
      data: {
        ...parsed.data,
        scheduledAt: parsed.data.scheduledAt ? new Date(parsed.data.scheduledAt) : undefined,
        tenantId: req.user.tenantId,
      },
    });
    sendSuccess(res, campaign, 201);
  })
);

// ─── PATCH /api/automations/campaigns/:id ────────────────────────────────────
// Update an existing campaign
router.patch(
  '/campaigns/:id',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const parsed = CreateCampaignSchema.partial().safeParse(req.body);
    if (!parsed.success) { sendError(res, parsed.error.message); return; }

    const existing = await prisma.marketingCampaign.findUnique({ where: { id: req.params.id } });
    if (!existing || existing.tenantId !== req.user.tenantId) {
      sendError(res, 'Campaign not found', 404);
      return;
    }

    const updated = await prisma.marketingCampaign.update({
      where: { id: req.params.id },
      data: {
        ...parsed.data,
        scheduledAt: parsed.data.scheduledAt ? new Date(parsed.data.scheduledAt) : undefined,
      },
    });
    sendSuccess(res, updated);
  })
);

// ─── DELETE /api/automations/campaigns/:id ───────────────────────────────────
// Delete a campaign (only if DRAFT)
router.delete(
  '/campaigns/:id',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const existing = await prisma.marketingCampaign.findUnique({ where: { id: req.params.id } });
    if (!existing || existing.tenantId !== req.user.tenantId) {
      sendError(res, 'Campaign not found', 404);
      return;
    }

    if (existing.status !== 'DRAFT') {
      sendError(res, 'Only DRAFT campaigns can be deleted', 400);
      return;
    }

    await prisma.marketingCampaign.delete({ where: { id: req.params.id } });
    sendSuccess(res, { message: 'Campaign deleted' });
  })
);

// ─── POST /api/automations/campaigns/:id/send ────────────────────────────────
// Execute a campaign: send messages to targeted customers
router.post(
  '/campaigns/:id/send',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = req.user.tenantId;

    const campaign = await prisma.marketingCampaign.findUnique({ where: { id: req.params.id } });
    if (!campaign || campaign.tenantId !== tenantId) {
      sendError(res, 'Campaign not found', 404);
      return;
    }

    if (campaign.status !== 'DRAFT' && campaign.status !== 'SCHEDULED') {
      sendError(res, 'Campaign can only be sent from DRAFT or SCHEDULED status', 400);
      return;
    }

    // Mark as SENDING
    await prisma.marketingCampaign.update({
      where: { id: campaign.id },
      data: { status: 'SENDING' },
    });

    // ── Build target customer query based on segment ──────────────────────────
    const targetQuery = campaign.targetQuery as Record<string, any> | null;
    const segment = targetQuery?.segment ?? 'ALL';
    const now = new Date();

    let customers: { id: string; name: string; phone: string | null }[];

    switch (segment) {
      case 'INACTIVE': {
        // Customers with no laundry order in the last 30 days
        const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        customers = await prisma.customer.findMany({
          where: {
            tenantId,
            phone: { not: null },
            status: 'ACTIVE',
            NOT: {
              laundryOrders: {
                some: {
                  receivedAt: { gte: thirtyDaysAgo },
                },
              },
            },
          },
          select: { id: true, name: true, phone: true },
        });
        break;
      }

      case 'VIP': {
        // Customers with 10+ total orders
        customers = await prisma.customer.findMany({
          where: {
            tenantId,
            phone: { not: null },
            status: 'ACTIVE',
            totalOrders: { gte: 10 },
          },
          select: { id: true, name: true, phone: true },
        });
        break;
      }

      case 'NEW': {
        // Customers who joined in the last 30 days
        const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        customers = await prisma.customer.findMany({
          where: {
            tenantId,
            phone: { not: null },
            createdAt: { gte: thirtyDaysAgo },
          },
          select: { id: true, name: true, phone: true },
        });
        break;
      }

      case 'ALL':
      default: {
        // All customers with a phone number
        customers = await prisma.customer.findMany({
          where: {
            tenantId,
            phone: { not: null },
          },
          select: { id: true, name: true, phone: true },
        });
        break;
      }
    }

    // ── Get tenant name for template variable replacement ─────────────────────
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { name: true },
    });
    const businessName = tenant?.name ?? '';

    // ── Send messages ─────────────────────────────────────────────────────────
    let sentCount = 0;
    let failedCount = 0;

    for (const customer of customers) {
      if (!customer.phone) continue;

      let message = campaign.template;
      message = message.replace(/\{\{customerName\}\}/g, customer.name);
      message = message.replace(/\{\{businessName\}\}/g, businessName);

      try {
        const formattedPhone = formatIsraeliPhone(customer.phone);
        const result = await sendCustomMessage(tenantId, formattedPhone, message);
        if (result.success) {
          sentCount++;
        } else {
          failedCount++;
        }
      } catch {
        failedCount++;
      }
    }

    // ── Update campaign with results ──────────────────────────────────────────
    const updatedCampaign = await prisma.marketingCampaign.update({
      where: { id: campaign.id },
      data: {
        status:      'SENT',
        sentAt:      new Date(),
        sentCount,
        failedCount,
      },
    });

    sendSuccess(res, updatedCampaign);
  })
);

// ═══════════════════════════════════════════════════════════════════════════════
// Automation Engine (exported for use by other modules)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Trigger all active automations matching the given trigger for a tenant.
 *
 * Called from other modules (e.g., orders) when an event occurs.
 * Replaces template variables from the context and sends via WhatsApp.
 *
 * Never throws — logs errors internally.
 */
export async function triggerAutomations(
  tenantId: string,
  trigger:  string,
  context:  Record<string, string>
): Promise<void> {
  try {
    // Find all active automations for this trigger
    const automations = await prisma.marketingAutomation.findMany({
      where: {
        tenantId,
        trigger: trigger as any,
        isActive: true,
      },
    });

    if (automations.length === 0) return;

    // Get tenant name for {{businessName}} replacement
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { name: true },
    });
    const businessName = tenant?.name ?? '';

    for (const automation of automations) {
      try {
        // For ORDER_STATUS_CHANGE: check if conditions.targetStatus matches context.newStatus
        if (trigger === 'ORDER_STATUS_CHANGE') {
          const conditions = automation.conditions as Record<string, any> | null;
          if (conditions?.targetStatus && conditions.targetStatus !== context.newStatus) {
            continue; // Skip — status does not match the automation's target
          }
        }

        // Replace template variables
        let message = automation.template;
        const variables: Record<string, string> = {
          ...context,
          businessName,
        };

        for (const [key, value] of Object.entries(variables)) {
          message = message.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
        }

        // Send via WhatsApp
        const phone = context.customerPhone;
        if (!phone) {
          logger.warn(`[Automations] No customerPhone in context for automation ${automation.id}`);
          continue;
        }

        const formattedPhone = formatIsraeliPhone(phone);
        await sendCustomMessage(tenantId, formattedPhone, message);

        // Update automation stats
        await prisma.marketingAutomation.update({
          where: { id: automation.id },
          data: {
            totalSent: { increment: 1 },
            lastRunAt: new Date(),
          },
        });
      } catch (err) {
        logger.error(`[Automations] Error executing automation ${automation.id}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  } catch (err) {
    logger.error(`[Automations] Error in triggerAutomations: ${err instanceof Error ? err.message : String(err)}`);
  }
}

export default router;
