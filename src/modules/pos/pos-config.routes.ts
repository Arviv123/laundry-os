import { Router, Response } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth';
import { enforceTenantIsolation, withTenant } from '../../middleware/tenant';
import { requireMinRole } from '../../middleware/rbac';
import { AuthenticatedRequest } from '../../shared/types/index';
import { sendSuccess, sendError } from '../../shared/utils/response';
import { asyncHandler } from '../../shared/utils/asyncHandler';
import { prisma } from '../../config/database';

const router = Router();
router.use(authenticate as any);
router.use(enforceTenantIsolation as any);

// ─────────────────────────────────────────────────────────────────────────────
// BUTTON LAYOUTS
// ─────────────────────────────────────────────────────────────────────────────

// GET /pos/layouts — list all layouts for tenant
router.get('/layouts', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const layouts = await prisma.posButtonLayout.findMany({
    where: withTenant(req),
    include: { _count: { select: { buttons: true } } },
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
  });
  sendSuccess(res, layouts);
}));

// POST /pos/layouts — create layout
router.post('/layouts', requireMinRole('ADMIN') as any, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const schema = z.object({
    name:       z.string().min(1),
    isDefault:  z.boolean().optional().default(false),
    terminalId: z.string().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { sendError(res, parsed.error.message, 400); return; }

  const { isDefault, ...rest } = parsed.data;

  // If new layout is set as default, clear other defaults
  if (isDefault) {
    await prisma.posButtonLayout.updateMany({
      where: withTenant(req, { isDefault: true }),
      data:  { isDefault: false },
    });
  }

  const layout = await prisma.posButtonLayout.create({
    data: { ...rest, isDefault: isDefault ?? false, tenantId: req.user.tenantId },
  });
  sendSuccess(res, layout, 201);
}));

// GET /pos/layouts/:id — get layout with buttons
router.get('/layouts/:id', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const layout = await prisma.posButtonLayout.findFirst({
    where:   withTenant(req, { id: req.params.id }),
    include: {
      buttons: {
        include: { product: { select: { id: true, name: true, sellingPrice: true, barcode: true } } },
        orderBy: [{ row: 'asc' }, { col: 'asc' }],
      },
    },
  });
  if (!layout) { sendError(res, 'Layout not found', 404); return; }
  sendSuccess(res, layout);
}));

// PUT /pos/layouts/:id — update layout
router.put('/layouts/:id', requireMinRole('ADMIN') as any, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const schema = z.object({
    name:       z.string().min(1).optional(),
    terminalId: z.string().nullable().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { sendError(res, parsed.error.message, 400); return; }

  const existing = await prisma.posButtonLayout.findFirst({ where: withTenant(req, { id: req.params.id }) });
  if (!existing) { sendError(res, 'Layout not found', 404); return; }

  const layout = await prisma.posButtonLayout.update({
    where: { id: req.params.id },
    data:  parsed.data,
  });
  sendSuccess(res, layout);
}));

// DELETE /pos/layouts/:id — delete layout
router.delete('/layouts/:id', requireMinRole('ADMIN') as any, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const existing = await prisma.posButtonLayout.findFirst({ where: withTenant(req, { id: req.params.id }) });
  if (!existing) { sendError(res, 'Layout not found', 404); return; }

  await prisma.posButtonLayout.delete({ where: { id: req.params.id } });
  sendSuccess(res, { deleted: true });
}));

// POST /pos/layouts/:id/set-default — set as default
router.post('/layouts/:id/set-default', requireMinRole('ADMIN') as any, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const existing = await prisma.posButtonLayout.findFirst({ where: withTenant(req, { id: req.params.id }) });
  if (!existing) { sendError(res, 'Layout not found', 404); return; }

  await prisma.posButtonLayout.updateMany({
    where: withTenant(req, { isDefault: true }),
    data:  { isDefault: false },
  });
  const layout = await prisma.posButtonLayout.update({
    where: { id: req.params.id },
    data:  { isDefault: true },
  });
  sendSuccess(res, layout);
}));

// ─── Buttons ──────────────────────────────────────────────────────────────────

const buttonSchema = z.object({
  row:          z.number().int().min(0),
  col:          z.number().int().min(0),
  label:        z.string().min(1),
  color:        z.string().optional().default('#4F46E5'),
  icon:         z.string().optional(),
  type:         z.enum(['PRODUCT', 'CATEGORY', 'FUNCTION', 'PLU', 'LAYOUT_LINK']),
  productId:    z.string().optional(),
  categoryId:   z.string().optional(),
  functionCode: z.string().optional(),
  plu:          z.string().optional(),
  subLayoutId:  z.string().optional(),
});

// GET /pos/layouts/:id/buttons — list buttons sorted by row, col
router.get('/layouts/:id/buttons', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const layout = await prisma.posButtonLayout.findFirst({ where: withTenant(req, { id: req.params.id }) });
  if (!layout) { sendError(res, 'Layout not found', 404); return; }

  const buttons = await prisma.posButton.findMany({
    where:   { layoutId: req.params.id },
    include: { product: { select: { id: true, name: true, sellingPrice: true, barcode: true } } },
    orderBy: [{ row: 'asc' }, { col: 'asc' }],
  });
  sendSuccess(res, buttons);
}));

// POST /pos/layouts/:id/buttons — add button
router.post('/layouts/:id/buttons', requireMinRole('ADMIN') as any, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const layout = await prisma.posButtonLayout.findFirst({ where: withTenant(req, { id: req.params.id }) });
  if (!layout) { sendError(res, 'Layout not found', 404); return; }

  const parsed = buttonSchema.safeParse(req.body);
  if (!parsed.success) { sendError(res, parsed.error.message, 400); return; }

  // Verify product belongs to tenant if provided
  if (parsed.data.productId) {
    const product = await prisma.product.findFirst({ where: withTenant(req, { id: parsed.data.productId }) });
    if (!product) { sendError(res, 'Product not found', 404); return; }
  }

  const button = await prisma.posButton.create({
    data: { ...parsed.data, layoutId: req.params.id },
  });
  sendSuccess(res, button, 201);
}));

// PUT /pos/layouts/:layoutId/buttons/:buttonId — update button
router.put('/layouts/:layoutId/buttons/:buttonId', requireMinRole('ADMIN') as any, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const layout = await prisma.posButtonLayout.findFirst({ where: withTenant(req, { id: req.params.layoutId }) });
  if (!layout) { sendError(res, 'Layout not found', 404); return; }

  const existing = await prisma.posButton.findFirst({
    where: { id: req.params.buttonId, layoutId: req.params.layoutId },
  });
  if (!existing) { sendError(res, 'Button not found', 404); return; }

  const parsed = buttonSchema.partial().safeParse(req.body);
  if (!parsed.success) { sendError(res, parsed.error.message, 400); return; }

  const button = await prisma.posButton.update({
    where: { id: req.params.buttonId },
    data:  parsed.data,
  });
  sendSuccess(res, button);
}));

// DELETE /pos/layouts/:layoutId/buttons/:buttonId — remove button
router.delete('/layouts/:layoutId/buttons/:buttonId', requireMinRole('ADMIN') as any, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const layout = await prisma.posButtonLayout.findFirst({ where: withTenant(req, { id: req.params.layoutId }) });
  if (!layout) { sendError(res, 'Layout not found', 404); return; }

  const existing = await prisma.posButton.findFirst({
    where: { id: req.params.buttonId, layoutId: req.params.layoutId },
  });
  if (!existing) { sendError(res, 'Button not found', 404); return; }

  await prisma.posButton.delete({ where: { id: req.params.buttonId } });
  sendSuccess(res, { deleted: true });
}));

// POST /pos/layouts/:id/buttons/bulk — replace all buttons in layout
router.post('/layouts/:id/buttons/bulk', requireMinRole('ADMIN') as any, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const layout = await prisma.posButtonLayout.findFirst({ where: withTenant(req, { id: req.params.id }) });
  if (!layout) { sendError(res, 'Layout not found', 404); return; }

  const schema = z.object({
    buttons: z.array(buttonSchema),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { sendError(res, parsed.error.message, 400); return; }

  // Validate unique row/col combinations
  const positions = parsed.data.buttons.map(b => `${b.row}:${b.col}`);
  if (new Set(positions).size !== positions.length) {
    sendError(res, 'Duplicate row/col positions in bulk save', 400); return;
  }

  const buttons = await prisma.$transaction(async (tx) => {
    await tx.posButton.deleteMany({ where: { layoutId: req.params.id } });
    return tx.posButton.createMany({
      data: parsed.data.buttons.map(b => ({ ...b, layoutId: req.params.id })),
    });
  });
  sendSuccess(res, { count: buttons.count });
}));

// ─────────────────────────────────────────────────────────────────────────────
// PRODUCT VARIANTS
// ─────────────────────────────────────────────────────────────────────────────

// GET /pos/products/:productId/variants
router.get('/products/:productId/variants', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const product = await prisma.product.findFirst({ where: withTenant(req, { id: req.params.productId }) });
  if (!product) { sendError(res, 'Product not found', 404); return; }

  const variants = await prisma.productVariant.findMany({
    where:   { tenantId: req.user.tenantId, productId: req.params.productId },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  });
  sendSuccess(res, variants);
}));

// POST /pos/products/:productId/variants — add variant
router.post('/products/:productId/variants', requireMinRole('ADMIN') as any, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const product = await prisma.product.findFirst({ where: withTenant(req, { id: req.params.productId }) });
  if (!product) { sendError(res, 'Product not found', 404); return; }

  const schema = z.object({
    name:         z.string().min(1),
    sku:          z.string().optional(),
    barcode:      z.string().optional(),
    priceAdjust:  z.number().default(0),
    costAdjust:   z.number().default(0),
    attributes:   z.record(z.string(), z.unknown()).optional().default({}),
    sortOrder:    z.number().int().optional().default(0),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { sendError(res, parsed.error.message, 400); return; }

  const { attributes, ...variantRest } = parsed.data;
  const variant = await prisma.productVariant.create({
    data: {
      ...variantRest,
      attributes: attributes as any,
      productId:  req.params.productId,
      tenantId:   req.user.tenantId,
    },
  });
  sendSuccess(res, variant, 201);
}));

// PUT /pos/products/:productId/variants/:id — update variant
router.put('/products/:productId/variants/:id', requireMinRole('ADMIN') as any, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const existing = await prisma.productVariant.findFirst({
    where: { id: req.params.id, tenantId: req.user.tenantId, productId: req.params.productId },
  });
  if (!existing) { sendError(res, 'Variant not found', 404); return; }

  const schema = z.object({
    name:        z.string().min(1).optional(),
    sku:         z.string().nullable().optional(),
    barcode:     z.string().nullable().optional(),
    priceAdjust: z.number().optional(),
    costAdjust:  z.number().optional(),
    attributes:  z.record(z.string(), z.unknown()).optional(),
    sortOrder:   z.number().int().optional(),
    isActive:    z.boolean().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { sendError(res, parsed.error.message, 400); return; }

  const { attributes: updateAttrs, ...updateRest } = parsed.data;
  const variant = await prisma.productVariant.update({
    where: { id: req.params.id },
    data:  {
      ...updateRest,
      ...(updateAttrs !== undefined ? { attributes: updateAttrs as any } : {}),
    },
  });
  sendSuccess(res, variant);
}));

// DELETE /pos/products/:productId/variants/:id — deactivate variant
router.delete('/products/:productId/variants/:id', requireMinRole('ADMIN') as any, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const existing = await prisma.productVariant.findFirst({
    where: { id: req.params.id, tenantId: req.user.tenantId, productId: req.params.productId },
  });
  if (!existing) { sendError(res, 'Variant not found', 404); return; }

  const variant = await prisma.productVariant.update({
    where: { id: req.params.id },
    data:  { isActive: false },
  });
  sendSuccess(res, variant);
}));

// ─────────────────────────────────────────────────────────────────────────────
// COMBO PRODUCTS
// ─────────────────────────────────────────────────────────────────────────────

// GET /pos/combos — list combos
router.get('/combos', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const combos = await prisma.comboProduct.findMany({
    where:   withTenant(req, { isActive: true }),
    include: { _count: { select: { items: true } } },
    orderBy: { name: 'asc' },
  });
  sendSuccess(res, combos);
}));

// POST /pos/combos — create combo
router.post('/combos', requireMinRole('ADMIN') as any, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const schema = z.object({
    name:        z.string().min(1),
    description: z.string().optional(),
    price:       z.number().positive(),
    items:       z.array(z.object({
      productId:  z.string(),
      quantity:   z.number().positive().optional().default(1),
      isOptional: z.boolean().optional().default(false),
      groupName:  z.string().optional(),
    })).min(1),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { sendError(res, parsed.error.message, 400); return; }

  // Validate all products belong to tenant
  for (const item of parsed.data.items) {
    const product = await prisma.product.findFirst({ where: withTenant(req, { id: item.productId }) });
    if (!product) { sendError(res, `Product ${item.productId} not found`, 404); return; }
  }

  const combo = await prisma.comboProduct.create({
    data: {
      name:        parsed.data.name,
      description: parsed.data.description,
      price:       parsed.data.price,
      tenantId:    req.user.tenantId,
      items: {
        create: parsed.data.items.map(i => ({
          productId:  i.productId,
          quantity:   i.quantity,
          isOptional: i.isOptional,
          groupName:  i.groupName,
        })),
      },
    },
    include: { items: { include: { product: { select: { id: true, name: true, sellingPrice: true } } } } },
  });
  sendSuccess(res, combo, 201);
}));

// GET /pos/combos/:id — get combo with items
router.get('/combos/:id', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const combo = await prisma.comboProduct.findFirst({
    where:   withTenant(req, { id: req.params.id }),
    include: {
      items: {
        include: { product: { select: { id: true, name: true, sellingPrice: true, barcode: true, isActive: true } } },
      },
    },
  });
  if (!combo) { sendError(res, 'Combo not found', 404); return; }
  sendSuccess(res, combo);
}));

// PUT /pos/combos/:id — update combo
router.put('/combos/:id', requireMinRole('ADMIN') as any, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const existing = await prisma.comboProduct.findFirst({ where: withTenant(req, { id: req.params.id }) });
  if (!existing) { sendError(res, 'Combo not found', 404); return; }

  const schema = z.object({
    name:        z.string().min(1).optional(),
    description: z.string().nullable().optional(),
    price:       z.number().positive().optional(),
    isActive:    z.boolean().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { sendError(res, parsed.error.message, 400); return; }

  const combo = await prisma.comboProduct.update({
    where: { id: req.params.id },
    data:  parsed.data,
  });
  sendSuccess(res, combo);
}));

// DELETE /pos/combos/:id — deactivate combo
router.delete('/combos/:id', requireMinRole('ADMIN') as any, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const existing = await prisma.comboProduct.findFirst({ where: withTenant(req, { id: req.params.id }) });
  if (!existing) { sendError(res, 'Combo not found', 404); return; }

  const combo = await prisma.comboProduct.update({
    where: { id: req.params.id },
    data:  { isActive: false },
  });
  sendSuccess(res, combo);
}));

// POST /pos/combos/:id/items — add item to combo
router.post('/combos/:id/items', requireMinRole('ADMIN') as any, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const combo = await prisma.comboProduct.findFirst({ where: withTenant(req, { id: req.params.id }) });
  if (!combo) { sendError(res, 'Combo not found', 404); return; }

  const schema = z.object({
    productId:  z.string(),
    quantity:   z.number().positive().optional().default(1),
    isOptional: z.boolean().optional().default(false),
    groupName:  z.string().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { sendError(res, parsed.error.message, 400); return; }

  const product = await prisma.product.findFirst({ where: withTenant(req, { id: parsed.data.productId }) });
  if (!product) { sendError(res, 'Product not found', 404); return; }

  const item = await prisma.comboItem.create({
    data: { ...parsed.data, comboId: req.params.id },
    include: { product: { select: { id: true, name: true, sellingPrice: true } } },
  });
  sendSuccess(res, item, 201);
}));

// DELETE /pos/combos/:id/items/:itemId — remove item from combo
router.delete('/combos/:id/items/:itemId', requireMinRole('ADMIN') as any, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const combo = await prisma.comboProduct.findFirst({ where: withTenant(req, { id: req.params.id }) });
  if (!combo) { sendError(res, 'Combo not found', 404); return; }

  const item = await prisma.comboItem.findFirst({ where: { id: req.params.itemId, comboId: req.params.id } });
  if (!item) { sendError(res, 'Combo item not found', 404); return; }

  await prisma.comboItem.delete({ where: { id: req.params.itemId } });
  sendSuccess(res, { deleted: true });
}));

// ─────────────────────────────────────────────────────────────────────────────
// RECEIPT TEMPLATE
// ─────────────────────────────────────────────────────────────────────────────

const receiptTemplateSchema = z.object({
  showLogo:        z.boolean().optional(),
  logoBase64:      z.string().nullable().optional(),
  headerLine1:     z.string().nullable().optional(),
  headerLine2:     z.string().nullable().optional(),
  headerLine3:     z.string().nullable().optional(),
  headerLine4:     z.string().nullable().optional(),
  showVatNumber:   z.boolean().optional(),
  showCashierName: z.boolean().optional(),
  showTableNumber: z.boolean().optional(),
  showBarcode:     z.boolean().optional(),
  showQrCode:      z.boolean().optional(),
  footerLine1:     z.string().nullable().optional(),
  footerLine2:     z.string().nullable().optional(),
  footerLine3:     z.string().nullable().optional(),
  paperWidth:      z.enum(['58', '80']).transform(Number).optional(),
  fontSize:        z.enum(['small', 'normal', 'large']).optional(),
});

// GET /pos/receipt-template
router.get('/receipt-template', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tmpl = await prisma.posReceiptTemplate.findUnique({
    where: { tenantId: req.user.tenantId },
  });
  // Return defaults if not configured
  if (!tmpl) {
    sendSuccess(res, {
      tenantId:        req.user.tenantId,
      showLogo:        false,
      logoBase64:      null,
      headerLine1:     null,
      headerLine2:     null,
      headerLine3:     null,
      headerLine4:     null,
      showVatNumber:   true,
      showCashierName: true,
      showTableNumber: true,
      showBarcode:     false,
      showQrCode:      false,
      footerLine1:     'תודה על רכישתך!',
      footerLine2:     null,
      footerLine3:     null,
      paperWidth:      80,
      fontSize:        'normal',
    });
    return;
  }
  sendSuccess(res, tmpl);
}));

// PUT /pos/receipt-template — upsert
router.put('/receipt-template', requireMinRole('ADMIN') as any, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const parsed = receiptTemplateSchema.safeParse(req.body);
  if (!parsed.success) { sendError(res, parsed.error.message, 400); return; }

  const tmpl = await prisma.posReceiptTemplate.upsert({
    where:  { tenantId: req.user.tenantId },
    update: parsed.data,
    create: { ...parsed.data, tenantId: req.user.tenantId },
  });
  sendSuccess(res, tmpl);
}));

// POST /pos/receipt-template/preview — generate ESC/POS text preview
router.post('/receipt-template/preview', requireMinRole('ADMIN') as any, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tmplRaw = await prisma.posReceiptTemplate.findUnique({
    where: { tenantId: req.user.tenantId },
  });

  const tmpl = tmplRaw ?? {
    paperWidth:      80,
    fontSize:        'normal',
    showLogo:        false,
    logoBase64:      null,
    headerLine1:     null,
    headerLine2:     null,
    headerLine3:     null,
    headerLine4:     null,
    showVatNumber:   true,
    showCashierName: true,
    showTableNumber: true,
    showBarcode:     false,
    showQrCode:      false,
    footerLine1:     'תודה על רכישתך!',
    footerLine2:     null,
    footerLine3:     null,
  };

  const tenant = await prisma.tenant.findUnique({
    where:  { id: req.user.tenantId },
    select: { name: true, vatNumber: true, phone: true },
  });

  const width = Number(tmpl.paperWidth) === 58 ? 32 : 48;
  const divider = '-'.repeat(width);
  const center = (s: string) => s.padStart(Math.floor((width + s.length) / 2)).padEnd(width);

  const lines: string[] = [];
  lines.push(divider);
  if (tmpl.headerLine1) lines.push(center(tmpl.headerLine1));
  else if (tenant?.name) lines.push(center(tenant.name));
  if (tmpl.headerLine2) lines.push(center(tmpl.headerLine2));
  if (tmpl.headerLine3) lines.push(center(tmpl.headerLine3));
  if (tmpl.headerLine4) lines.push(center(tmpl.headerLine4));
  if (tmpl.showVatNumber && tenant?.vatNumber) lines.push(center(`עוסק מורשה: ${tenant.vatNumber}`));
  lines.push(divider);
  lines.push(`קופאי: ישראל ישראלי`);
  lines.push(`תאריך: ${new Date().toLocaleDateString('he-IL')}`);
  lines.push(`שעה:   ${new Date().toLocaleTimeString('he-IL')}`);
  lines.push(divider);
  lines.push(`מוצר לדוגמה                    ₪10.00`);
  lines.push(`מוצר נוסף                      ₪20.00`);
  lines.push(divider);
  lines.push(`סה"כ לפני מע"מ:               ₪25.42`);
  lines.push(`מע"מ (18%):                     ₪4.58`);
  lines.push(`סה"כ:                          ₪30.00`);
  lines.push(`שולם במזומן:                   ₪30.00`);
  lines.push(divider);
  if (tmpl.footerLine1) lines.push(center(tmpl.footerLine1));
  if (tmpl.footerLine2) lines.push(center(tmpl.footerLine2));
  if (tmpl.footerLine3) lines.push(center(tmpl.footerLine3));
  lines.push(divider);

  sendSuccess(res, { preview: lines.join('\n'), width, template: tmpl });
}));

// ─────────────────────────────────────────────────────────────────────────────
// RETURNS & EXCHANGES
// ─────────────────────────────────────────────────────────────────────────────

// POST /pos/returns/with-receipt
router.post('/returns/with-receipt', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const schema = z.object({
    originalTransactionId: z.string(),
    items: z.array(z.object({
      lineId:    z.string().optional(),
      productId: z.string(),
      quantity:  z.number().positive(),
      reason:    z.string().optional(),
    })).min(1),
    refundMethod: z.enum(['CASH', 'CREDIT_CARD', 'STORE_CREDIT', 'BANK_TRANSFER', 'CHECK', 'OTHER']),
    notes: z.string().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { sendError(res, parsed.error.message, 400); return; }

  // Verify original transaction belongs to tenant
  const original = await prisma.posTransaction.findFirst({
    where:   { id: parsed.data.originalTransactionId, tenantId: req.user.tenantId },
    include: { lines: true, session: true },
  });
  if (!original) { sendError(res, 'Original transaction not found', 404); return; }
  if (original.type !== 'SALE') { sendError(res, 'Can only return SALE transactions', 400); return; }

  // Validate return quantities against original
  for (const retItem of parsed.data.items) {
    const origLine = original.lines.find(l => l.productId === retItem.productId);
    if (!origLine) { sendError(res, `Product ${retItem.productId} not in original transaction`, 400); return; }
    if (Number(retItem.quantity) > Number(origLine.quantity)) {
      sendError(res, `Return quantity for product ${retItem.productId} exceeds purchased quantity`, 400); return;
    }
  }

  // Calculate return totals
  let subtotal = 0;
  const returnLines = parsed.data.items.map(item => {
    const origLine = original.lines.find(l => l.productId === item.productId)!;
    const unitPrice = Number(origLine.unitPrice);
    const lineTotal = unitPrice * item.quantity;
    subtotal += lineTotal;
    return {
      productId:   item.productId,
      description: `החזרה — ${origLine.description}`,
      quantity:    item.quantity,
      unitPrice:   unitPrice,
      discount:    0,
      vatRate:     Number(origLine.vatRate),
      lineTotal:   -lineTotal,
    };
  });
  const vatRate    = Number(original.lines[0]?.vatRate ?? 0.18);
  const vatAmount  = subtotal * vatRate / (1 + vatRate);
  const refundTotal = subtotal;

  const returnTx = await prisma.posTransaction.create({
    data: {
      tenantId:     req.user.tenantId,
      sessionId:    original.sessionId,
      type:         'RETURN',
      subtotal:     -subtotal,
      vatAmount:    -vatAmount,
      total:        -refundTotal,
      discount:     0,
      paymentMethod: parsed.data.refundMethod as any,
      amountPaid:   -refundTotal,
      change:       0,
      notes:        parsed.data.notes ?? `החזרה לעסקה ${original.receiptNumber ?? original.id}`,
      lines: { create: returnLines },
    },
    include: { lines: true },
  });

  sendSuccess(res, { returnTransaction: returnTx, refundAmount: refundTotal }, 201);
}));

// POST /pos/returns/without-receipt — manual return (ACCOUNTANT+)
router.post('/returns/without-receipt', requireMinRole('ACCOUNTANT') as any, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const schema = z.object({
    items: z.array(z.object({
      productId: z.string(),
      quantity:  z.number().positive(),
      unitPrice: z.number().nonnegative(),
      reason:    z.string().optional(),
    })).min(1),
    refundMethod: z.enum(['CASH', 'CREDIT_CARD', 'STORE_CREDIT', 'BANK_TRANSFER', 'CHECK', 'OTHER']),
    notes: z.string().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { sendError(res, parsed.error.message, 400); return; }

  // Need an open session
  const session = await prisma.posSession.findFirst({
    where: { tenantId: req.user.tenantId, status: 'OPEN' },
    orderBy: { openedAt: 'desc' },
  });
  if (!session) { sendError(res, 'No open POS session found', 400); return; }

  const vatRate = 0.18;
  let subtotal = 0;
  const returnLines = await Promise.all(parsed.data.items.map(async item => {
    const product = await prisma.product.findFirst({ where: withTenant(req, { id: item.productId }) });
    const lineTotal = item.unitPrice * item.quantity;
    subtotal += lineTotal;
    return {
      productId:   item.productId,
      description: product?.name ?? item.productId,
      quantity:    item.quantity,
      unitPrice:   item.unitPrice,
      discount:    0,
      vatRate,
      lineTotal:   -lineTotal,
    };
  }));

  const vatAmount  = subtotal * vatRate / (1 + vatRate);
  const returnTx = await prisma.posTransaction.create({
    data: {
      tenantId:     req.user.tenantId,
      sessionId:    session.id,
      type:         'RETURN',
      subtotal:     -subtotal,
      vatAmount:    -vatAmount,
      total:        -subtotal,
      discount:     0,
      paymentMethod: parsed.data.refundMethod as any,
      amountPaid:   -subtotal,
      change:       0,
      notes:        parsed.data.notes ?? 'החזרה ללא קבלה',
      lines: { create: returnLines },
    },
    include: { lines: true },
  });

  sendSuccess(res, { returnTransaction: returnTx, refundAmount: subtotal }, 201);
}));

// POST /pos/returns/exchange
router.post('/returns/exchange', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const schema = z.object({
    originalTransactionId: z.string().optional(),
    returnItems: z.array(z.object({
      productId: z.string(),
      quantity:  z.number().positive(),
    })).min(1),
    newItems: z.array(z.object({
      productId: z.string(),
      quantity:  z.number().positive(),
      unitPrice: z.number().nonnegative(),
    })).min(1),
    paymentMethod: z.enum(['CASH', 'CREDIT_CARD', 'BANK_TRANSFER', 'CHECK', 'OTHER']).optional(),
    amountDue:     z.number().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { sendError(res, parsed.error.message, 400); return; }

  // Need an open session
  const session = await prisma.posSession.findFirst({
    where: { tenantId: req.user.tenantId, status: 'OPEN' },
    orderBy: { openedAt: 'desc' },
  });
  if (!session) { sendError(res, 'No open POS session found', 400); return; }

  const vatRate = 0.18;

  // Build return lines
  let returnSubtotal = 0;
  const returnLines = await Promise.all(parsed.data.returnItems.map(async item => {
    let unitPrice = 0;
    if (parsed.data.originalTransactionId) {
      const orig = await prisma.posTransaction.findFirst({
        where:   { id: parsed.data.originalTransactionId, tenantId: req.user.tenantId },
        include: { lines: true },
      });
      const origLine = orig?.lines.find(l => l.productId === item.productId);
      unitPrice = Number(origLine?.unitPrice ?? 0);
    } else {
      const product = await prisma.product.findFirst({ where: withTenant(req, { id: item.productId }) });
      unitPrice = Number(product?.sellingPrice ?? 0);
    }
    const lineTotal = unitPrice * item.quantity;
    returnSubtotal += lineTotal;
    const product = await prisma.product.findFirst({ where: withTenant(req, { id: item.productId }), select: { name: true } });
    return {
      productId:   item.productId,
      description: `החזרה — ${product?.name ?? item.productId}`,
      quantity:    item.quantity,
      unitPrice,
      discount:    0,
      vatRate,
      lineTotal:   -lineTotal,
    };
  }));

  // Build sale lines
  let saleSubtotal = 0;
  const saleLines = await Promise.all(parsed.data.newItems.map(async item => {
    const lineTotal = item.unitPrice * item.quantity;
    saleSubtotal += lineTotal;
    const product = await prisma.product.findFirst({ where: withTenant(req, { id: item.productId }), select: { name: true } });
    return {
      productId:   item.productId,
      description: product?.name ?? item.productId,
      quantity:    item.quantity,
      unitPrice:   item.unitPrice,
      discount:    0,
      vatRate,
      lineTotal,
    };
  }));

  const netDue = saleSubtotal - returnSubtotal;

  const [returnTx, saleTx] = await prisma.$transaction(async (tx) => {
    const rTx = await tx.posTransaction.create({
      data: {
        tenantId:      req.user.tenantId,
        sessionId:     session.id,
        type:          'RETURN',
        subtotal:      -returnSubtotal,
        vatAmount:     -(returnSubtotal * vatRate / (1 + vatRate)),
        total:         -returnSubtotal,
        discount:      0,
        paymentMethod: (parsed.data.paymentMethod ?? 'CASH') as any,
        amountPaid:    -returnSubtotal,
        change:        0,
        notes:         'החלפה — חלק ההחזרה',
        lines: { create: returnLines },
      },
    });
    const sTx = await tx.posTransaction.create({
      data: {
        tenantId:      req.user.tenantId,
        sessionId:     session.id,
        type:          'SALE',
        subtotal:      saleSubtotal,
        vatAmount:     saleSubtotal * vatRate / (1 + vatRate),
        total:         saleSubtotal,
        discount:      0,
        paymentMethod: (parsed.data.paymentMethod ?? 'CASH') as any,
        amountPaid:    parsed.data.amountDue ?? netDue,
        change:        0,
        notes:         'החלפה — חלק המכירה החדשה',
        lines: { create: saleLines },
      },
    });
    return [rTx, sTx];
  });

  sendSuccess(res, {
    returnTransaction: returnTx,
    saleTransaction:   saleTx,
    netAmountDue:      netDue,
  }, 201);
}));

// ─────────────────────────────────────────────────────────────────────────────
// QUICK SETTINGS
// ─────────────────────────────────────────────────────────────────────────────

// GET /pos/settings — consolidated POS settings
router.get('/settings', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const [tenant, receiptTemplate, activePromotions, loyaltyProgram, terminals] = await Promise.all([
    prisma.tenant.findUnique({
      where:  { id: req.user.tenantId },
      select: { settings: true, taxSettings: true },
    }),
    prisma.posReceiptTemplate.findUnique({ where: { tenantId: req.user.tenantId } }),
    prisma.promotion.count({ where: { tenantId: req.user.tenantId, isActive: true } }),
    prisma.loyaltyProgram.findUnique({ where: { tenantId: req.user.tenantId } }),
    prisma.posTerminal.findMany({ where: { tenantId: req.user.tenantId, isActive: true }, select: { id: true, name: true, location: true } }),
  ]);

  const settings = (tenant?.settings ?? {}) as Record<string, unknown>;
  const taxSettings = (tenant?.taxSettings ?? {}) as Record<string, unknown>;

  sendSuccess(res, {
    receiptTemplate,
    activePromotionsCount: activePromotions,
    loyaltyProgram,
    terminals,
    posSettings: {
      requireCustomerForSale:    settings['requireCustomerForSale']    ?? false,
      allowNegativeStock:        settings['allowNegativeStock']        ?? false,
      requireManagerForVoid:     settings['requireManagerForVoid']     ?? true,
      requireManagerForRefund:   settings['requireManagerForRefund']   ?? true,
      autoApplyPromotions:       settings['autoApplyPromotions']       ?? true,
      defaultVatRate:            taxSettings['vatRate']                 ?? 0.18,
    },
  });
}));

// PUT /pos/settings/quick — save quick settings
router.put('/settings/quick', requireMinRole('ADMIN') as any, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const schema = z.object({
    requireCustomerForSale:  z.boolean().optional(),
    allowNegativeStock:      z.boolean().optional(),
    requireManagerForVoid:   z.boolean().optional(),
    requireManagerForRefund: z.boolean().optional(),
    autoApplyPromotions:     z.boolean().optional(),
    defaultVatRate:          z.number().min(0).max(1).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { sendError(res, parsed.error.message, 400); return; }

  const tenant = await prisma.tenant.findUnique({
    where:  { id: req.user.tenantId },
    select: { settings: true, taxSettings: true },
  });

  const existingSettings  = (tenant?.settings  ?? {}) as Record<string, unknown>;
  const existingTaxSettings = (tenant?.taxSettings ?? {}) as Record<string, unknown>;

  const { defaultVatRate, ...posKeys } = parsed.data;
  const newSettings    = { ...existingSettings,    ...posKeys };
  const newTaxSettings = defaultVatRate !== undefined
    ? { ...existingTaxSettings, vatRate: defaultVatRate }
    : existingTaxSettings;

  await prisma.tenant.update({
    where: { id: req.user.tenantId },
    data:  { settings: newSettings as any, taxSettings: newTaxSettings as any },
  });

  sendSuccess(res, { updated: true, posSettings: newSettings, taxSettings: newTaxSettings });
}));

// GET /pos/manager-functions — list functions requiring manager approval
router.get('/manager-functions', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenant = await prisma.tenant.findUnique({
    where:  { id: req.user.tenantId },
    select: { settings: true },
  });
  const settings = (tenant?.settings ?? {}) as Record<string, unknown>;

  const functions = [
    {
      code:        'VOID',
      name:        'ביטול עסקה',
      nameEn:      'Void Transaction',
      requiresManager: settings['requireManagerForVoid'] !== false,
    },
    {
      code:        'REFUND',
      name:        'החזר כספי',
      nameEn:      'Refund',
      requiresManager: settings['requireManagerForRefund'] !== false,
    },
    {
      code:        'PRICE_OVERRIDE',
      name:        'עקיפת מחיר',
      nameEn:      'Price Override',
      requiresManager: true,
    },
    {
      code:        'DISCOUNT',
      name:        'הנחה ידנית',
      nameEn:      'Manual Discount',
      requiresManager: false,
    },
    {
      code:        'NO_SALE',
      name:        'פתיחת מגירה',
      nameEn:      'No Sale / Open Drawer',
      requiresManager: settings['requireManagerForVoid'] !== false,
    },
  ];

  sendSuccess(res, functions);
}));

export default router;
