import { Response } from 'express';
import { ApiResponse } from '../types';

export function sendSuccess<T>(
  res: Response,
  data: T,
  statusCode = 200,
  meta?: ApiResponse<T>['meta']
): void {
  const response: ApiResponse<T> = { success: true, data, meta };
  res.status(statusCode).json(response);
}

export function sendError(
  res: Response,
  message: string,
  statusCode = 400
): void {
  const response: ApiResponse = { success: false, error: message };
  res.status(statusCode).json(response);
}
