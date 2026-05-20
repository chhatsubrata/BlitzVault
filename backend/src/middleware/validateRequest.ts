import { NextFunction, Request, Response } from "express";
import { ZodError, ZodSchema } from "zod";
import { badRequestResponse } from "../utils/responses";

type RequestSegment = "body" | "params" | "query";

export const validateRequest = <T>(
    schema: ZodSchema<T>,
    segment: RequestSegment = "body"
) => {
    return (req: Request, res: Response, next: NextFunction) => {
        try {
            const parsedData = schema.parse(req[segment]);
            // Keep parsed values in one shared location so controllers can read
            // fully validated input without depending on mutable req internals.
            const validatedRequest = (res.locals.validatedRequest ??= {});
            validatedRequest[segment] = parsedData;

            // Express query typing/proxy behavior can make req.query unsafe to
            // overwrite; body/params are still updated for backward compatibility.
            if (segment !== "query") {
                req[segment] = parsedData as Request[RequestSegment];
            }
            next();
        } catch (error) {
            if (error instanceof ZodError) {
                const validationErrors = error.issues.map(
                    (issue) =>
                        `${issue.path.join(".") || "value"}: ${issue.message}`
                );
                return badRequestResponse(
                    res,
                    "Validation failed for request payload.",
                    validationErrors
                );
            }

            return badRequestResponse(res, "Invalid request payload.");
        }
    };
};
