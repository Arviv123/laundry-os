/**
 * Barcode Scanner & Fast Search API
 *
 * Designed for real-time use from:
 *  - POS terminals (barcode scanner emulating keyboard)
 *  - Invoice / Sales-Order creation screens (product/customer search)
 *  - Any document where the user needs instant lookup
 *
 * Barcode scanners send keystrokes at < 50 ms intervals then an Enter key.
 * The frontend should detect this pattern, collect the string, then call:
 *   GET /api/scan/barcode/:value
 *
 * All endpoints return within a single indexed DB query — optimised for speed.
 */

import { Router, Response } from 'express';
import { authenticate }       from '../../middleware/auth';
import { enforceTenantIsolation, withTenant } from '../../middleware/tenant';
import { AuthenticatedRequest } from '../../shared/types/index';
import { sendSuccess, sendError } from '../../shared/utils/response';
import { asyncHandler }           from '../../shared/utils/asyncHandler';
import { prisma }                 from '../../config/database';

const router = Router();
router.use(authenticate as any);
router.use(enforceTenantIsolation as any);

// ─── Product lookup by barcode ─────────────────────────────────────────────
// GET /api/scan/barcode/:value
// Called instantly when the scanner sends a barcode string.
// Also tries SKU match if no barcode found (some systems print the SKU as barcode).
router.get('/barcode/:value', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { value } = req.params;
  const tenantId  = req.user.tenantId;

  // 1. Try exact barcode match
  let product = await prisma.product.findFirst({
    where:   { tenantId, barcode: value, isActive: true },
    include: {
      category:    { select: { id: true, name: true } },
      stockLevels: {
        where:   { warehouse: { isActive: true } },
        include: { warehouse: { select: { id: true, name: true, isDefault: true } } },
      },
    },
  });

  // 2. Fallback: SKU match (some printers barcode the SKU)
  if (!product) {
    product = await prisma.product.findFirst({
      where:   { tenantId, sku: value, isActive: true },
      include: {
        category:    { select: { id: true, name: true } },
        stockLevels: {
          where:   { warehouse: { isActive: true } },
          include: { warehouse: { select: { id: true, name: true, isDefault: true } } },
        },
      },
    });
  }

  if (!product) {
    sendError(res, `No product found for barcode: ${value}`, 404);
    return;
  }

  // Total available stock across all warehouses
  const totalStock = product.stockLevels.reduce((sum, sl) => sum + Number(sl.quantity), 0);

  sendSuccess(res, {
    ...product,
    totalStock,
    // Convenience fields for POS / invoice line auto-fill
    displayPrice: Number(product.sellingPrice),
    vatRate:      Number(product.vatRate),
    priceWithVat: Math.round(Number(product.sellingPrice) * (1 + Number(product.vatRate)) * 100) / 100,
  });
}));

// ─── Customer lookup by loyalty barcode ──────────────────────────────────────
// GET /api/scan/customer-barcode/:value
router.get('/customer-barcode/:value', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { value } = req.params;
  const tenantId  = req.user.tenantId;

  const customer = await prisma.customer.findFirst({
    where: { tenantId, loyaltyBarcode: value },
    select: {
      id: true, name: true, email: true, phone: true,
      businessId: true, status: true, type: true,
      creditLimit: true, paymentTermsDays: true, priceListId: true,
      priceList: { select: { id: true, name: true } },
    },
  });

  if (!customer) {
    sendError(res, `No customer found for barcode: ${value}`, 404);
    return;
  }
  sendSuccess(res, customer);
}));

// ─── Product search (name / SKU / barcode — autocomplete) ─────────────────
// GET /api/scan/products?q=abc&limit=10
// Returns lightweight list for dropdown/autocomplete.
router.get('/products', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const q       = ((req.query.q as string) ?? '').trim();
  const limit   = Math.min(parseInt((req.query.limit as string) ?? '15'), 50);
  const tenantId = req.user.tenantId;

  if (q.length < 1) {
    sendError(res, 'Query must be at least 1 character', 400);
    return;
  }

  const products = await prisma.product.findMany({
    where: {
      tenantId,
      isActive: true,
      OR: [
        { name:    { contains: q, mode: 'insensitive' } },
        { sku:     { contains: q, mode: 'insensitive' } },
        { barcode: { contains: q, mode: 'insensitive' } },
        { description: { contains: q, mode: 'insensitive' } },
      ],
    },
    select: {
      id: true, sku: true, name: true, barcode: true,
      sellingPrice: true, vatRate: true, unitOfMeasure: true,
      isService: true, imageUrl: true,
      category: { select: { id: true, name: true } },
      stockLevels: {
        where:   { warehouse: { isDefault: true, isActive: true } },
        select:  { quantity: true },
        take: 1,
      },
    },
    orderBy: [
      { name: 'asc' },
    ],
    take: limit,
  });

  const result = products.map(p => ({
    ...p,
    sellingPrice: Number(p.sellingPrice),
    vatRate:      Number(p.vatRate),
    priceWithVat: Math.round(Number(p.sellingPrice) * (1 + Number(p.vatRate)) * 100) / 100,
    defaultStock: p.stockLevels[0] ? Number(p.stockLevels[0].quantity) : null,
  }));

  sendSuccess(res, result);
}));

// ─── Customer search (name / phone / email / businessId) ─────────────────
// GET /api/scan/customers?q=abc&limit=10
router.get('/customers', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const q       = ((req.query.q as string) ?? '').trim();
  const limit   = Math.min(parseInt((req.query.limit as string) ?? '15'), 50);
  const tenantId = req.user.tenantId;

  if (q.length < 1) {
    sendError(res, 'Query must be at least 1 character', 400);
    return;
  }

  const customers = await prisma.customer.findMany({
    where: {
      tenantId,
      OR: [
        { name:       { contains: q, mode: 'insensitive' } },
        { phone:      { contains: q } },
        { email:      { contains: q, mode: 'insensitive' } },
        { businessId: { contains: q } },
        { loyaltyBarcode: { contains: q } },
      ],
    },
    select: {
      id: true, name: true, email: true, phone: true,
      businessId: true, status: true, type: true,
      creditLimit: true, paymentTermsDays: true,
      priceListId: true, loyaltyBarcode: true,
      address: true,
    },
    orderBy: { name: 'asc' },
    take: limit,
  });

  sendSuccess(res, customers);
}));

// ─── POS Scan (barcode → full POS line item) ──────────────────────────────
// GET /api/scan/pos/:barcode?warehouseId=xxx&priceListId=xxx
// Returns a ready-to-use POS transaction line.
router.get('/pos/:barcode', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { barcode } = req.params;
  const tenantId    = req.user.tenantId;
  const warehouseId = req.query.warehouseId as string | undefined;
  const priceListId = req.query.priceListId as string | undefined;

  // Find product
  let product = await prisma.product.findFirst({
    where: {
      tenantId,
      isActive: true,
      OR: [{ barcode }, { sku: barcode }],
    },
    include: {
      category: { select: { name: true } },
      priceListItems: priceListId
        ? { where: { priceListId }, take: 1 }
        : undefined,
      stockLevels: {
        where: warehouseId
          ? { warehouseId }
          : { warehouse: { isDefault: true, isActive: true } },
        include: { warehouse: { select: { id: true, name: true } } },
        take: 1,
      },
    },
  });

  if (!product) {
    sendError(res, `ברקוד לא נמצא: ${barcode}`, 404);
    return;
  }

  // Resolve price: price list → default selling price
  let unitPrice = Number(product.sellingPrice);
  if (priceListId && product.priceListItems && product.priceListItems.length > 0) {
    unitPrice = Number(product.priceListItems[0].unitPrice);
  }

  const stockLevel = product.stockLevels[0];
  const available  = stockLevel ? Number(stockLevel.quantity) : null;

  // Warn if out of stock (but don't block — service items have no stock)
  const stockWarning = !product.isService && available !== null && available <= 0
    ? 'אזהרה: מלאי אזל'
    : undefined;

  sendSuccess(res, {
    // Ready-to-use POS line fields
    productId:   product.id,
    sku:         product.sku,
    barcode:     product.barcode,
    description: product.name,
    unitPrice,
    vatRate:     Number(product.vatRate),
    priceWithVat: Math.round(unitPrice * (1 + Number(product.vatRate)) * 100) / 100,
    unitOfMeasure: product.unitOfMeasure,
    quantity:    1,         // default — cashier can change
    discount:    0,
    isService:   product.isService,
    category:    product.category?.name ?? null,
    // Stock info
    availableStock: available,
    warehouseId:    stockLevel?.warehouse?.id ?? null,
    warehouseName:  stockLevel?.warehouse?.name ?? null,
    stockWarning,
  });
}));

// ─── Invoice / Quote line lookup ──────────────────────────────────────────
// GET /api/scan/invoice-line/:barcode?priceListId=xxx
// Same as POS scan but without warehouse context — for invoice creation.
router.get('/invoice-line/:barcode', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { barcode } = req.params;
  const tenantId    = req.user.tenantId;
  const priceListId = req.query.priceListId as string | undefined;

  const product = await prisma.product.findFirst({
    where: {
      tenantId,
      isActive: true,
      OR: [{ barcode }, { sku: barcode }],
    },
    include: {
      category: { select: { name: true } },
      priceListItems: priceListId
        ? { where: { priceListId }, take: 1 }
        : undefined,
    },
  });

  if (!product) {
    sendError(res, `ברקוד לא נמצא: ${barcode}`, 404);
    return;
  }

  let unitPrice = Number(product.sellingPrice);
  if (priceListId && product.priceListItems && product.priceListItems.length > 0) {
    unitPrice = Number(product.priceListItems[0].unitPrice);
  }

  sendSuccess(res, {
    productId:    product.id,
    sku:          product.sku,
    barcode:      product.barcode,
    description:  product.name,
    unitPrice,
    vatRate:      Number(product.vatRate),
    priceWithVat: Math.round(unitPrice * (1 + Number(product.vatRate)) * 100) / 100,
    unitOfMeasure: product.unitOfMeasure,
    quantity:     1,
    isService:    product.isService,
    category:     product.category?.name ?? null,
  });
}));

export default router;
