import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

export type DatabaseLogger = {
  info(message: string, metadata?: Record<string, unknown>): void;
  warn(message: string, metadata?: Record<string, unknown>): void;
  error(message: string, metadata?: Record<string, unknown>): void;
};

type QueryParameter = string | number | bigint | Buffer | null | boolean | Date;
export type StatementParams = readonly QueryParameter[] | undefined;
export type TransactionMode = "deferred" | "immediate";

export type DesktopDatabase = {
  readonly path: string;
  all<T>(sql: string, params?: StatementParams): T[];
  backup(destinationFile: string): Promise<void>;
  close(): void;
  exec(sql: string): void;
  get<T>(sql: string, params?: StatementParams): T | undefined;
  pragma<T = unknown>(statement: string, options?: Database.PragmaOptions): T;
  run(sql: string, params?: StatementParams): Database.RunResult;
  transaction<T>(handler: (database: DesktopDatabase) => T, mode?: TransactionMode): T;
};

type CreateDesktopDatabaseOptions = {
  databasePath: string;
  logger?: DatabaseLogger;
};

type SqliteLikeError = Error & {
  code?: string;
};

const DEFAULT_LOGGER: DatabaseLogger = {
  info(message, metadata) {
    console.info(message, metadata ?? {});
  },
  warn(message, metadata) {
    console.warn(message, metadata ?? {});
  },
  error(message, metadata) {
    console.error(message, metadata ?? {});
  },
};

function ensureDatabaseDirectoryExists(databasePath: string): void {
  fs.mkdirSync(path.dirname(databasePath), { recursive: true });
}

function applyPragmas(connection: Database.Database): void {
  connection.pragma("journal_mode = WAL");
  connection.pragma("foreign_keys = ON");
  connection.pragma("synchronous = FULL");
  connection.pragma("busy_timeout = 5000");
}

function normalizeParameter(parameter: QueryParameter): string | number | bigint | Buffer | null {
  if (parameter === null) {
    return null;
  }

  if (typeof parameter === "boolean") {
    return parameter ? 1 : 0;
  }

  if (parameter instanceof Date) {
    return parameter.toISOString();
  }

  return parameter;
}

function normalizeParameters(params?: StatementParams): Array<string | number | bigint | Buffer | null> {
  return (params ?? []).map((parameter) => normalizeParameter(parameter));
}

function summarizeSql(sql: string): string {
  return sql.replace(/\s+/g, " ").trim().slice(0, 180);
}

function logDatabaseError(
  logger: DatabaseLogger,
  label: string,
  sql: string,
  error: unknown,
): void {
  const sqliteError = error as SqliteLikeError | undefined;

  logger.error(label, {
    code: sqliteError?.code,
    message: error instanceof Error ? error.message : "Unknown database error",
    sql: summarizeSql(sql),
  });
}

export function createDesktopDatabase(options: CreateDesktopDatabaseOptions): DesktopDatabase {
  const logger = options.logger ?? DEFAULT_LOGGER;

  ensureDatabaseDirectoryExists(options.databasePath);

  const connection = new Database(options.databasePath);
  const statementCache = new Map<string, Database.Statement>();
  let closed = false;

  applyPragmas(connection);

  const getStatement = (sql: string): Database.Statement => {
    const cachedStatement = statementCache.get(sql);

    if (cachedStatement) {
      return cachedStatement;
    }

    const statement = connection.prepare(sql);
    statementCache.set(sql, statement);
    return statement;
  };

  const database: DesktopDatabase = {
    path: options.databasePath,
    exec(sql: string) {
      try {
        connection.exec(sql);
      } catch (error) {
        logDatabaseError(logger, "[desktop:db.exec.failed]", sql, error);
        throw error;
      }
    },
    pragma<T = unknown>(statement: string, options?: Database.PragmaOptions): T {
      try {
        return connection.pragma(statement, options) as T;
      } catch (error) {
        logDatabaseError(logger, "[desktop:db.pragma.failed]", statement, error);
        throw error;
      }
    },
    run(sql: string, params?: StatementParams) {
      try {
        return getStatement(sql).run(...normalizeParameters(params));
      } catch (error) {
        logDatabaseError(logger, "[desktop:db.run.failed]", sql, error);
        throw error;
      }
    },
    get<T>(sql: string, params?: StatementParams): T | undefined {
      try {
        return getStatement(sql).get(...normalizeParameters(params)) as T | undefined;
      } catch (error) {
        logDatabaseError(logger, "[desktop:db.get.failed]", sql, error);
        throw error;
      }
    },
    all<T>(sql: string, params?: StatementParams): T[] {
      try {
        return getStatement(sql).all(...normalizeParameters(params)) as T[];
      } catch (error) {
        logDatabaseError(logger, "[desktop:db.all.failed]", sql, error);
        throw error;
      }
    },
    async backup(destinationFile: string): Promise<void> {
      try {
        await connection.backup(destinationFile);
      } catch (error) {
        logDatabaseError(logger, "[desktop:db.backup.failed]", destinationFile, error);
        throw error;
      }
    },
    transaction<T>(
      handler: (database: DesktopDatabase) => T,
      mode: TransactionMode = "deferred",
    ): T {
      const transactionRunner = connection.transaction(() => handler(database));
      return mode === "immediate" ? transactionRunner.immediate() : transactionRunner();
    },
    close() {
      if (closed) {
        return;
      }

      closed = true;
      statementCache.clear();
      connection.close();
    },
  };

  logger.info("[desktop:db] connection opened", {
    path: options.databasePath,
  });

  return database;
}
