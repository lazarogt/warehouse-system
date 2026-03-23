export type ServiceStatus = "ok" | "degraded";
export type DatabaseStatus = "up" | "down";

export interface HealthResponse {
  status: ServiceStatus;
  service: string;
  version: string;
  timestamp: string;
  database: {
    status: DatabaseStatus;
  };
}

