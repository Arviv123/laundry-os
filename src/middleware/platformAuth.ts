import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { PlatformAdminRequest } from '../shared/types';
import { sendError } from '../shared/utils/response';

interface PlatformJwtPayload {
  adminId:    string;
  email:      string;
  name:       string;
  isPlatform: true;
}

export function platformAuthenticate(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    sendError(res, 'Unauthorized - missing token', 401);
    return;
  }

  const token = authHeader.split(' ')[1];

  try {
    const payload = jwt.verify(
      token,
      process.env.JWT_SECRET!
    ) as PlatformJwtPayload;

    if (!payload.isPlatform) {
      sendError(res, 'Unauthorized - not a platform token', 403);
      return;
    }

    (req as PlatformAdminRequest).platformAdmin = {
      adminId: payload.adminId,
      email:   payload.email,
      name:    payload.name,
    };

    next();
  } catch {
    sendError(res, 'Unauthorized - invalid token', 401);
  }
}
