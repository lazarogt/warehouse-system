import cors from "cors";
import express from "express";
import { API_PREFIX, APP_NAME } from "../../shared/src";
import { env } from "./config/env";
import { errorHandler, notFoundHandler } from "./common/http";
import authRouter from "./modules/auth/auth.router";
import {
  requireAuthentication,
  requirePasswordChangeComplete,
  requireRoles,
} from "./modules/auth/auth.middleware";
import categoryRouter from "./modules/categories/category.router";
import alertsRouter from "./modules/alerts/alerts.router";
import adjustmentRouter from "./modules/adjustments/adjustment.router";
import inventoryRouter from "./modules/inventory/inventory.router";
import locationRouter from "./modules/locations/location.router";
import productRouter from "./modules/products/product.router";
import reportsRouter from "./modules/reports/reports.router";
import transferRouter from "./modules/transfers/transfer.router";
import userRouter from "./modules/users/user.router";
import healthRouter from "./routes/health";
import warehouseRouter from "./modules/warehouses/warehouse.router";
import cycleCountRouter from "./modules/cycle-counts/cycle-count.router";

export const createApp = () => {
  const app = express();

  app.use(
    cors({
      origin: env.corsOrigin,
      credentials: true,
    }),
  );
  app.use(express.json({ limit: "1mb" }));

  app.get("/", (_request, response) => {
    response.json({
      message: `${APP_NAME} server running`,
    });
  });

  app.use(`${API_PREFIX}/health`, healthRouter);
  app.use(`${API_PREFIX}/auth`, authRouter);
  app.use(
    `${API_PREFIX}/users`,
    requireAuthentication,
    requirePasswordChangeComplete,
    requireRoles("admin"),
    userRouter,
  );
  app.use(`${API_PREFIX}/warehouses`, requireAuthentication, requirePasswordChangeComplete, warehouseRouter);
  app.use(`${API_PREFIX}/categories`, requireAuthentication, requirePasswordChangeComplete, categoryRouter);
  app.use(`${API_PREFIX}/products`, requireAuthentication, requirePasswordChangeComplete, productRouter);
  app.use(`${API_PREFIX}/inventory`, requireAuthentication, requirePasswordChangeComplete, inventoryRouter);
  app.use(`${API_PREFIX}/locations`, requireAuthentication, requirePasswordChangeComplete, locationRouter);
  app.use(`${API_PREFIX}/transfers`, requireAuthentication, requirePasswordChangeComplete, transferRouter);
  app.use(`${API_PREFIX}/adjustments`, requireAuthentication, requirePasswordChangeComplete, adjustmentRouter);
  app.use(`${API_PREFIX}/cycle-counts`, requireAuthentication, requirePasswordChangeComplete, cycleCountRouter);
  app.use(`${API_PREFIX}/alerts`, requireAuthentication, requirePasswordChangeComplete, alertsRouter);
  app.use(`${API_PREFIX}/reports`, requireAuthentication, requirePasswordChangeComplete, reportsRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
};
