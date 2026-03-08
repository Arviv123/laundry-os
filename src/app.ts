import 'dotenv/config';
import * as Sentry from '@sentry/node';

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV ?? 'development',
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
  });
}

import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import swaggerUi from 'swagger-ui-express';

import { logger } from './config/logger';
import { prisma } from './config/database';

// Routes — Core
import tenantsRouter    from './modules/tenants/tenants.routes';
import usersRouter      from './modules/users/users.routes';
import platformRouter   from './modules/platform/platform.routes';

// Routes — Accounting
import accountingRouter from './modules/accounting/accounting.routes';
import agingRouter      from './modules/accounting/aging.routes';
import ledgerRouter     from './modules/ledger/ledger.routes';

// Routes — CRM
import crmRouter        from './modules/crm/crm.routes';

// Routes — Invoices
import invoicesRouter   from './modules/invoices/invoices.routes';

// Routes — Inventory (supplies)
import inventoryRouter  from './modules/inventory/inventory.routes';

// Routes — POS
import posRouter        from './modules/pos/pos.routes';
import posPhase2Router  from './modules/pos/pos-phase2.routes';

// Routes — RFID
import rfidRouter       from './modules/rfid/rfid.routes';

// Routes — Scanning
import scanRouter       from './modules/scan/scan.routes';

// Routes — Notifications
import notificationsRouter from './modules/notifications/notifications.routes';

// Routes — Branches
import branchesRouter   from './modules/branches/branches.routes';

// Routes — Settings
import settingsRouter   from './modules/settings/settings.routes';

// Routes — Audit
import auditRouter      from './modules/audit/audit.routes';

// Routes — Laundry-Specific
import ordersRouter           from './modules/orders/orders.routes';
import servicesCatalogRouter  from './modules/services-catalog/services.routes';
import machinesRouter         from './modules/machines/machines.routes';
import deliveryRouter         from './modules/delivery/delivery.routes';
import prepaidRouter          from './modules/prepaid/prepaid.routes';
import customerPortalRouter   from './modules/customer-portal/customer-portal.routes';
import dashboardRouter        from './modules/dashboard/dashboard.routes';

// Swagger
import { swaggerSpec } from './config/swagger';

const app  = express();
const PORT = process.env.PORT ?? 3000;

// Trust proxy (Render uses reverse proxy)
app.set('trust proxy', 1);

// ─── Security ─────────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false }));
const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? '').split(',').map(o => o.trim()).filter(Boolean);
const isWildcard = allowedOrigins.includes('*');

app.use(cors({
  origin: isWildcard ? true : (origin, callback) => {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error(`Origin ${origin} not allowed by CORS`), false);
  },
  credentials: !isWildcard,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
  maxAge: 86400,
}));

// ─── Rate Limiting ────────────────────────────────────────────
app.use('/api/users/auth', rateLimit({
  windowMs: 15 * 60 * 1_000,
  max: 20,
  message: { success: false, error: 'Too many login attempts' },
}));

app.use('/api', rateLimit({ windowMs: 60_000, max: 300 }));

// ─── Body Parser ──────────────────────────────────────────────
app.use(express.json({ limit: '2mb' }));

// ─── Request Logger ───────────────────────────────────────────
app.use((req, _res, next) => {
  logger.debug(`${req.method} ${req.path}`, { ip: req.ip });
  next();
});

// ─── Health Check ─────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    app: 'LaundryOS',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    env: process.env.NODE_ENV ?? 'development',
  });
});

app.get('/health/db', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'ok', db: 'connected' });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(503).json({ status: 'error', db: 'disconnected', detail: msg });
  }
});

// ─── Swagger ──────────────────────────────────────────────────
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customSiteTitle: 'LaundryOS API Docs',
}));
app.get('/api/docs.json', (_req, res) => res.json(swaggerSpec));

// ─── Platform Routes ──────────────────────────────────────────
app.use('/api/platform', platformRouter);

// ─── Core Routes ──────────────────────────────────────────────
app.use('/api/tenants',    tenantsRouter);
app.use('/api/users',      usersRouter);
app.use('/api/accounting', accountingRouter);
app.use('/api/aging',      agingRouter);
app.use('/api/ledger',     ledgerRouter);
app.use('/api/crm',        crmRouter);
app.use('/api/invoices',   invoicesRouter);
app.use('/api/inventory',  inventoryRouter);
app.use('/api/pos',        posRouter);
app.use('/api/pos',        posPhase2Router);
app.use('/api/rfid',       rfidRouter);
app.use('/api/scan',       scanRouter);
app.use('/api/notifications', notificationsRouter);
app.use('/api/branches',   branchesRouter);
app.use('/api/settings',   settingsRouter);
app.use('/api/audit',      auditRouter);

// ─── Laundry Routes ──────────────────────────────────────────
app.use('/api/orders',           ordersRouter);
app.use('/api/services',         servicesCatalogRouter);
app.use('/api/machines',         machinesRouter);
app.use('/api/delivery',         deliveryRouter);
app.use('/api/prepaid',          prepaidRouter);
app.use('/api/customer-portal',  customerPortalRouter);
app.use('/api/dashboard',        dashboardRouter);

// ─── Sentry Error Handler ─────────────────────────────────────
if (process.env.SENTRY_DSN) {
  app.use(Sentry.expressErrorHandler());
}

// ─── Global Error Handler ─────────────────────────────────────
app.use((err: Error, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const correlationId = Math.random().toString(36).substring(2, 15);
  const isDev = process.env.NODE_ENV !== 'production';
  logger.error('Unhandled error', {
    correlationId, message: err.message,
    stack: isDev ? err.stack : '[hidden]',
    method: req.method, path: req.path,
  });
  res.status(500).json({
    success: false,
    error: isDev ? err.message : 'Internal server error',
    correlationId,
  });
});

// ─── 404 ──────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ success: false, error: 'Route not found' });
});

// ─── Start ────────────────────────────────────────────────────
app.listen(PORT, () => {
  logger.info(`LaundryOS running on port ${PORT} [${process.env.NODE_ENV ?? 'development'}]`);
  logger.info(`Swagger: http://localhost:${PORT}/api/docs`);
  logger.info(`Health:  http://localhost:${PORT}/health`);
});

export default app;
