import { Router } from 'express';
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

const CompanySettingsSchema = z.object({
  name:           z.string().min(1).optional(),
  businessNumber: z.string().optional(),
  vatNumber:      z.string().optional(),
  phone:          z.string().optional(),
  email:          z.string().email().optional().or(z.literal('')),
  logoUrl:        z.string().url().optional().or(z.literal('')),
  address: z.object({
    street:  z.string().optional(),
    city:    z.string().optional(),
    zip:     z.string().optional(),
    country: z.string().optional(),
  }).optional(),
  // Invoice template settings stored in settings JSON
  invoiceSettings: z.object({
    defaultPaymentTerms: z.string().optional(),
    defaultVatRate:      z.number().min(0).max(1).optional(),
    invoiceFooter:       z.string().optional(),
    bankDetails:         z.string().optional(),  // bank details for invoice footer
    showItemCodes:       z.boolean().optional(),
    showBarcode:         z.boolean().optional(),
  }).optional(),
});

// GET /settings/company — get company profile
router.get('/company', asyncHandler(async (req: AuthenticatedRequest, res) => {
  const tenant = await prisma.tenant.findUnique({
    where: { id: req.user!.tenantId },
    select: {
      id: true, name: true, businessNumber: true, vatNumber: true,
      phone: true, email: true, logoUrl: true, address: true,
      taxSettings: true, settings: true,
    },
  });
  if (!tenant) return sendError(res, 'Tenant not found', 404);
  sendSuccess(res, tenant);
}));

// PATCH /settings/company — update company profile
router.patch('/company', asyncHandler(async (req: AuthenticatedRequest, res) => {
  const body = CompanySettingsSchema.safeParse(req.body);
  if (!body.success) return sendError(res, body.error.message, 400);

  const { invoiceSettings, ...tenantFields } = body.data;

  // Build update object
  const updateData: any = {};
  if (tenantFields.name !== undefined)           updateData.name = tenantFields.name;
  if (tenantFields.businessNumber !== undefined) updateData.businessNumber = tenantFields.businessNumber;
  if (tenantFields.vatNumber !== undefined)      updateData.vatNumber = tenantFields.vatNumber;
  if (tenantFields.phone !== undefined)          updateData.phone = tenantFields.phone;
  if (tenantFields.email !== undefined)          updateData.email = tenantFields.email || null;
  if (tenantFields.logoUrl !== undefined)        updateData.logoUrl = tenantFields.logoUrl || null;
  if (tenantFields.address !== undefined)        updateData.address = tenantFields.address;

  // Merge invoiceSettings into settings JSON
  if (invoiceSettings) {
    const current = await prisma.tenant.findUnique({
      where: { id: req.user!.tenantId },
      select: { settings: true },
    });
    const currentSettings = (current?.settings as any) ?? {};
    updateData.settings = { ...currentSettings, invoiceSettings: { ...(currentSettings.invoiceSettings ?? {}), ...invoiceSettings } };
  }

  const updated = await prisma.tenant.update({
    where: { id: req.user!.tenantId },
    data:  updateData,
    select: {
      id: true, name: true, businessNumber: true, vatNumber: true,
      phone: true, email: true, logoUrl: true, address: true,
      taxSettings: true, settings: true,
    },
  });

  sendSuccess(res, updated);
}));

export default router;
