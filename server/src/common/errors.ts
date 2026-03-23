export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly errorCode?: string,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const notFoundError = (entityName: string) => {
  return new AppError(404, `${entityName} not found.`);
};

type DatabaseLikeError = {
  code?: string;
};

export const isDatabaseError = (error: unknown): error is DatabaseLikeError => {
  return typeof error === "object" && error !== null && "code" in error;
};
