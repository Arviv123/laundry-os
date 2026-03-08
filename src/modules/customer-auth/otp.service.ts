import { logger } from '../../config/logger';

const OTP_STORE = new Map<string, { code: string; expiresAt: number }>();
const OTP_TTL = 5 * 60 * 1000; // 5 minutes
const MASTER_CODE = '5252'; // קוד מאסטר לבדיקות

export function generateOTP(phone: string): string {
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  OTP_STORE.set(phone, { code, expiresAt: Date.now() + OTP_TTL });
  logger.info('OTP generated', { phone: phone.slice(-4) });
  return code;
}

export function verifyOTP(phone: string, code: string): boolean {
  // Master code always passes
  if (code === MASTER_CODE) return true;

  const entry = OTP_STORE.get(phone);
  if (!entry) return false;
  if (Date.now() > entry.expiresAt) {
    OTP_STORE.delete(phone);
    return false;
  }
  if (entry.code !== code) return false;
  OTP_STORE.delete(phone);
  return true;
}
