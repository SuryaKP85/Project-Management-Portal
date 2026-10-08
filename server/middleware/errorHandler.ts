import { Request, Response, NextFunction } from 'express';
import { DatabaseError } from 'pg';

/**
 * Sprint 24 — a failure raised by PostgreSQL (or by losing the connection) is
 * never reported as success, nor as a client validation error: a unique
 * violation is 409 CONFLICT, anything else 503 PERSISTENCE_FAILED. The
 * database's own message (SQL, column names) is not sent to the client.
 */
export function databaseFailure(err: any): { status: number; code: string; message: string } | null {
  const fromDatabase =
    err instanceof DatabaseError ||
    (!!err && typeof err.code === 'string' && /^[0-9A-Z]{5}$/.test(err.code) && typeof err.severity === 'string') ||
    /Connection terminated|ECONNREFUSED|timeout exceeded when trying to connect/i.test(String(err?.message || ''));
  if (!fromDatabase) return null;
  if (err.code === '23505') return { status: 409, code: 'CONFLICT', message: 'A record with the same identity already exists. Nothing was changed.' };
  // Data exceptions (class 22: too long, invalid date or number) and other integrity violations
  // (class 23: a reference to a record that does not exist, a missing or out-of-range value) come
  // from the request's values; retrying cannot help, so they are not a persistence failure.
  if (/^2[23]/.test(String(err.code))) return { status: 400, code: 'VALIDATION_ERROR', message: 'A value in the request is not valid for storage (for example, it refers to a record that does not exist). Nothing was changed.' };
  return { status: 503, code: 'PERSISTENCE_FAILED', message: 'The database could not complete the request. Nothing was changed.' };
}

/** Sends the database failure response when err is one; returns whether it did. */
export function respondToDatabaseFailure(res: Response, err: any): boolean {
  const failure = databaseFailure(err);
  if (!failure) return false;
  console.error('[Database]', err?.code || '', err?.message || err);
  res.status(failure.status).json({ success: false, error: { code: failure.code, message: failure.message } });
  return true;
}

export function errorHandler(err: any, req: Request, res: Response, _next: NextFunction) {
  console.error(`[Error] ${req.method} ${req.url}:`, err.stack || err.message);
  if (respondToDatabaseFailure(res, err)) return;

  const statusCode = err.statusCode || err.status || 500;
  const message = err.message || 'Internal Server Error';
  const code = err.code || (statusCode === 500 ? 'INTERNAL_ERROR' : 'API_ERROR');

  res.status(statusCode).json({
    success: false,
    error: {
      code,
      message,
      ...(process.env.NODE_ENV !== 'production' ? { stack: err.stack } : {}),
    },
  });
}
