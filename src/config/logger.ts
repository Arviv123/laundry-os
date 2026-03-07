import { createLogger, format, transports } from 'winston';

const { combine, timestamp, colorize, printf, json, errors } = format;

const isDev = (process.env.NODE_ENV ?? 'development') === 'development';

// Human-readable format for development
const devFormat = combine(
  colorize(),
  timestamp({ format: 'HH:mm:ss' }),
  errors({ stack: true }),
  printf(({ level, message, timestamp, stack, ...meta }) => {
    const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
    return `${timestamp} [${level}] ${message}${metaStr}${stack ? '\n' + stack : ''}`;
  })
);

// JSON format for production (structured logging)
const prodFormat = combine(
  timestamp(),
  errors({ stack: true }),
  json()
);

export const logger = createLogger({
  level:      process.env.LOG_LEVEL ?? (isDev ? 'debug' : 'info'),
  format:     isDev ? devFormat : prodFormat,
  transports: [
    new transports.Console(),
    // In production, add file transports or external services (Datadog, CloudWatch, etc.)
    ...(isDev ? [] : [
      new transports.File({ filename: 'logs/error.log', level: 'error', maxsize: 10_000_000, maxFiles: 5 }),
      new transports.File({ filename: 'logs/combined.log', maxsize: 10_000_000, maxFiles: 10 }),
    ]),
  ],
  exceptionHandlers: [
    new transports.Console(),
  ],
  rejectionHandlers: [
    new transports.Console(),
  ],
});
