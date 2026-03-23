import type { User } from "../../../shared/src";

declare global {
  namespace Express {
    interface Request {
      authenticatedUser?: User;
      sessionToken?: string;
    }
  }
}

export {};
