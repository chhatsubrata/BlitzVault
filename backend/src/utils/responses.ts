import { Response } from "express";

type ApiResponsePayload<T> = {
    success: boolean;
    message: string;
    data?: T;
    errors?: string[];
};

const sendResponse = <T>(
    res: Response,
    statusCode: number,
    payload: ApiResponsePayload<T>
) => {
    return res.status(statusCode).json(payload);
};

export const successResponse = <T>(
    res: Response,
    message: string,
    data?: T
) => sendResponse(res, 200, { success: true, message, data });

export const createdResponse = <T>(
    res: Response,
    message: string,
    data?: T
) => sendResponse(res, 201, { success: true, message, data });

export const badRequestResponse = (
    res: Response,
    message: string,
    errors?: string[]
) => sendResponse(res, 400, { success: false, message, errors });

export const unauthorizedResponse = (
    res: Response,
    message = "Unauthorized"
) => sendResponse(res, 401, { success: false, message });

export const notFoundResponse = (
    res: Response,
    message = "Resource not found"
) => sendResponse(res, 404, { success: false, message });

export const internalServerErrorResponse = (
    res: Response,
    message = "Internal server error"
) => sendResponse(res, 500, { success: false, message });
