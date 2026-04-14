import type { NextFunction, Request, Response } from "express";
import { AppError, isDatabaseError } from "./errors";

type AsyncHandler = (request: Request, response: Response, next: NextFunction) => Promise<void>;

export const asyncHandler =
  (handler: AsyncHandler) => (request: Request, response: Response, next: NextFunction) => {
    void handler(request, response, next).catch(next);
  };

export const notFoundHandler = (_request: Request, response: Response) => {
  response.status(404).json({
    message: "Route not found.",
  });
};

const sendErrorResponse = (response: Response, statusCode: number, message: string) => {
  response.status(statusCode).json({
    message,
  });
};

export const errorHandler = (
  error: unknown,
  request: Request,
  response: Response,
  _next: NextFunction,
) => {
  const logError = (statusCode: number, message: string, extra?: Record<string, unknown>) => {
    if (process.env.NODE_ENV === "test") {
      return;
    }

    console.error("[http.error]", {
      method: request.method,
      path: request.originalUrl,
      statusCode,
      message,
      ...extra,
    });
  };

  if (error instanceof AppError) {
    if (error.statusCode !== 401 && error.statusCode !== 403 && error.statusCode !== 404) {
      logError(error.statusCode, error.message, error.errorCode ? { errorCode: error.errorCode } : undefined);
    }
    sendErrorResponse(response, error.statusCode, error.message);
    return;
  }

  if (error instanceof SyntaxError && "body" in (error as unknown as Record<string, unknown>)) {
    logError(400, "Request body contains invalid JSON.");
    sendErrorResponse(response, 400, "Request body contains invalid JSON.");
    return;
  }

  if (isDatabaseError(error)) {
    if (
      error.code === "23505" ||
      error.code === "SQLITE_CONSTRAINT_UNIQUE"
    ) {
      logError(409, "A record with that unique value already exists.", { code: error.code });
      sendErrorResponse(response, 409, "A record with that unique value already exists.");
      return;
    }

    if (
      error.code === "23503" ||
      error.code === "SQLITE_CONSTRAINT_FOREIGNKEY"
    ) {
      logError(409, "Operation cannot be completed because related records exist.", { code: error.code });
      sendErrorResponse(response, 409, "Operation cannot be completed because related records exist.");
      return;
    }

    if (
      error.code === "22P02" ||
      error.code === "23514" ||
      error.code === "SQLITE_CONSTRAINT_CHECK" ||
      error.code === "SQLITE_CONSTRAINT_NOTNULL" ||
      error.code === "SQLITE_CONSTRAINT_PRIMARYKEY"
    ) {
      logError(400, "Invalid data provided.", { code: error.code });
      sendErrorResponse(response, 400, "Invalid data provided.");
      return;
    }
  }

  logError(500, "Internal server error.", {
    error: error instanceof Error ? error.message : "Unknown error",
  });

  sendErrorResponse(response, 500, "Internal server error.");
};
