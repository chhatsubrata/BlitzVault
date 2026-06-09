// Terminal middleware for unmatched routes. Forwards a NotFoundError to the
// central errorHandler so the response uses the target error envelope.

import { NextFunction, Request, Response } from "express";
import { NotFoundError } from "../shared/errors/AppError";

export const notFoundHandler = (req: Request, _res: Response, next: NextFunction) => {
    next(new NotFoundError(`Route not found: ${req.method} ${req.originalUrl.split("?")[0]}`));
};
