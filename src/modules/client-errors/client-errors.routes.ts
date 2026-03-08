import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';

const router = Router();
const LOG_FILE = path.join(process.cwd(), 'logs', 'client-errors.log');

// Ensure logs directory exists
const logsDir = path.dirname(LOG_FILE);
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// POST /api/client-errors — receive and log frontend errors
router.post('/', (req: Request, res: Response) => {
  const { url, method, status, message, data, timestamp } = req.body;
  const line = `[${timestamp || new Date().toISOString()}] ${method?.toUpperCase()} ${url} → ${status} | ${message}${data ? ` | ${JSON.stringify(data)}` : ''}\n`;

  fs.appendFile(LOG_FILE, line, (err) => {
    if (err) console.error('Failed to write client error log:', err);
  });

  res.json({ ok: true });
});

// GET /api/client-errors — read the log file
router.get('/', (_req: Request, res: Response) => {
  if (!fs.existsSync(LOG_FILE)) {
    res.json({ logs: '', count: 0 });
    return;
  }
  const content = fs.readFileSync(LOG_FILE, 'utf8');
  const lines = content.trim().split('\n').filter(Boolean);
  res.json({ logs: content, count: lines.length });
});

// DELETE /api/client-errors — clear the log file
router.delete('/', (_req: Request, res: Response) => {
  fs.writeFileSync(LOG_FILE, '', 'utf8');
  res.json({ ok: true, message: 'Log cleared' });
});

export default router;
