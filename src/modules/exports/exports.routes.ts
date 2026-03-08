import { Router, Response } from 'express';
import { authenticate } from '../../middleware/auth';
import { enforceTenantIsolation } from '../../middleware/tenant';
import { AuthenticatedRequest } from '../../shared/types';
import { sendError } from '../../shared/utils/response';
import { asyncHandler } from '../../shared/utils/asyncHandler';
import { prisma } from '../../config/database';
import * as XLSX from 'xlsx';

const router = Router();
router.use(authenticate as any);
router.use(enforceTenantIsolation as any);

function sendExcel(res: Response, data: any[], sheetName: string, fileName: string) {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(data);
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
  res.send(buf);
}

// GET /exports/orders
router.get('/orders', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const orders = await prisma.laundryOrder.findMany({
    where: { tenantId: req.user!.tenantId },
    include: { customer: { select: { name: true, phone: true } } },
    orderBy: { createdAt: 'desc' },
    take: 5000,
  });

  const rows = orders.map(o => ({
    'מספר הזמנה': o.orderNumber,
    'לקוח': (o as any).customer?.name || '',
    'טלפון': (o as any).customer?.phone || '',
    'סטטוס': o.status,
    'סה"כ': Number(o.total),
    'תאריך': new Date(o.createdAt).toLocaleDateString('he-IL'),
  }));
  sendExcel(res, rows, 'הזמנות', 'orders.xlsx');
}));

// GET /exports/customers
router.get('/customers', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const customers = await prisma.customer.findMany({
    where: { tenantId: req.user!.tenantId },
    orderBy: { createdAt: 'desc' },
    take: 10000,
  });

  const rows = customers.map(c => ({
    'שם': c.name,
    'טלפון': c.phone || '',
    'אימייל': c.email || '',
    'כתובת': typeof c.address === 'string' ? c.address : JSON.stringify(c.address || ''),
    'סה"כ הזמנות': c.totalOrders,
    'סה"כ הוצאות': Number(c.totalSpent),
    'תאריך הצטרפות': new Date(c.createdAt).toLocaleDateString('he-IL'),
  }));
  sendExcel(res, rows, 'לקוחות', 'customers.xlsx');
}));

// GET /exports/invoices
router.get('/invoices', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const invoices = await prisma.invoice.findMany({
    where: { tenantId: req.user!.tenantId },
    include: { customer: { select: { name: true } } },
    orderBy: { date: 'desc' },
    take: 5000,
  });

  const rows = invoices.map(inv => ({
    'מספר חשבונית': inv.number,
    'לקוח': (inv as any).customer?.name || '',
    'סכום נטו': Number(inv.subtotal),
    'מע"מ': Number(inv.vatAmount),
    'סה"כ': Number(inv.total),
    'סטטוס': inv.status,
    'תאריך': new Date(inv.date).toLocaleDateString('he-IL'),
  }));
  sendExcel(res, rows, 'חשבוניות', 'invoices.xlsx');
}));

export default router;
