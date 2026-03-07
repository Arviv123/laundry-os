import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { AuthenticatedRequest } from '../shared/types';
import { sendError } from '../shared/utils/response';

interface JwtPayload {
  userId?:     string;
  employeeId?: string; // mobile-only sessions
  tenantId:    string;
  role:        string;
  email?:      string;
}

export function authenticate(
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
    ) as JwtPayload;

    (req as AuthenticatedRequest).user = {
      userId:     payload.userId   ?? '',
      employeeId: payload.employeeId,
      tenantId:   payload.tenantId,
      role:       payload.role as AuthenticatedRequest['user']['role'],
      email:      payload.email ?? '',
    };

    next();
  } catch {
    sendError(res, 'Unauthorized - invalid token', 401);
  }
}
