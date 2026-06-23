import { Router, Request, Response, NextFunction } from 'express';

/**
 * Wraps an async Express route handler so rejected promises are caught
 * and forwarded to Express's error handler (returns JSON, never HTML).
 */
export function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<any>) {
    return (req: Request, res: Response, next: NextFunction) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
}
