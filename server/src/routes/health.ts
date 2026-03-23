import { Router } from "express";
import { APP_NAME, APP_VERSION, type HealthResponse } from "../../../shared/src";
import { checkDatabaseConnection } from "../config/db";

const router = Router();

router.get("/", async (_request, response) => {
  const baseResponse = {
    service: APP_NAME,
    version: APP_VERSION,
    timestamp: new Date().toISOString(),
  };

  try {
    await checkDatabaseConnection();

    const payload: HealthResponse = {
      ...baseResponse,
      status: "ok",
      database: {
        status: "up",
      },
    };

    response.status(200).json(payload);
  } catch {
    const payload: HealthResponse = {
      ...baseResponse,
      status: "degraded",
      database: {
        status: "down",
      },
    };

    response.status(503).json(payload);
  }
});

export default router;

