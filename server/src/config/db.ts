import type { PoolClient, QueryResult, QueryResultRow } from "pg";
import { Pool, types } from "pg";
import { env } from "./env";

types.setTypeParser(20, (value) => Number(value));

export const pool = new Pool({
  host: env.database.host,
  port: env.database.port,
  database: env.database.name,
  user: env.database.user,
  password: env.database.password,
});

export const query = <T extends QueryResultRow>(
  text: string,
  params?: unknown[],
): Promise<QueryResult<T>> => {
  return pool.query<T>(text, params).catch((error) => {
    if (process.env.NODE_ENV !== "test") {
      console.error("[db.query.failed]", {
        code: error?.code,
        message: error instanceof Error ? error.message : "Unknown database error",
        statement: text.replace(/\s+/g, " ").trim().slice(0, 180),
      });
    }

    throw error;
  });
};

export const withTransaction = async <T>(callback: (client: PoolClient) => Promise<T>) => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");

    if (process.env.NODE_ENV !== "test") {
      console.error("[db.transaction.failed]", {
        code: (error as { code?: string } | null)?.code,
        message: error instanceof Error ? error.message : "Unknown transaction error",
      });
    }

    throw error;
  } finally {
    client.release();
  }
};

export const checkDatabaseConnection = async () => {
  const client = await pool.connect();

  try {
    await client.query("SELECT 1");
    return true;
  } finally {
    client.release();
  }
};
