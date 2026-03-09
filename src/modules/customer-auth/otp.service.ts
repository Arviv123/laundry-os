import { logger } from '../../config/logger';

const OTP_STORE = new Map<string, { code: string; expiresAt: number; attempts: number }>();
const OTP_TTL = 5 * 60 * 1000; // 5 minutes
const MAX_VERIFY_ATTEMPTS = 5;

export function generateOTP(phone: string): string {
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  OTP_STORE.set(phone, { code, expiresAt: Date.now() + OTP_TTL, attempts: 0 });
  logger.info('OTP generated', { phone: phone.slice(-4) });
  return code;
}

export function verifyOTP(phone: string, code: string): boolean {
  const entry = OTP_STORE.get(phone);
  if (!entry) return false;
  if (Date.now() > entry.expiresAt) {
    OTP_STORE.delete(phone);
    return false;
  }
  if (entry.attempts >= MAX_VERIFY_ATTEMPTS) {
    OTP_STORE.delete(phone);
    return false;
  }
  if (entry.code !== code) {
    entry.attempts++;
    return false;
  }
  OTP_STORE.delete(phone);
  return true;
}
