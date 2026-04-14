import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

export const SQLITE_NOW_EXPRESSION = "strftime('%Y-%m-%dT%H:%M:%fZ', 'now')";
const OPTIMIZE_INTERVAL_MS = 6 * 60 * 60 * 1000;

type StatementParams = readonly unknown[] | undefined;
type SqliteStatementResult = {
  changes: number;
  lastInsertRowid: number | bigint;
};

type QueryResult<T> = {
  rows: T[];
};

export type DatabaseExecutor = {
  queryAll<T>(sql: string, params?: StatementParams): T[];
  queryOne<T>(sql: string, params?: StatementParams): T | null;
  execute(sql: string, params?: StatementParams): SqliteStatementResult;
  query<T>(sql: string, params?: StatementParams): QueryResult<T>;
};

export type DatabaseClient = DatabaseExecutor;

type TransactionRunner<T> = (() => T) & {
  immediate: () => T;
};

type SqliteLikeError = Error & {
  code?: string;
};

let databaseInstance: Database.Database | null = null;
let optimizeTimer: NodeJS.Timeout | null = null;
const statementCache = new Map<string, Database.Statement>();

const safeRequireElectronApp = () => {
  if (!process.versions?.electron) {
    return null;
  }

  try {
    const electron = require("electron") as { app?: { getPath(name: string): string } };
    return electron.app ?? null;
  } catch {
    return null;
  }
};

const resolveDatabasePath = () => {
  if (process.env.SQLITE_DB_PATH?.trim()) {
    return path.resolve(process.env.SQLITE_DB_PATH.trim());
  }

  const electronApp = safeRequireElectronApp();

  if (electronApp) {
    return path.join(electronApp.getPath("userData"), "database.db");
  }

  return path.resolve(process.cwd(), "./data/database.db");
};

const ensureDatabaseDirectoryExists = (databasePath: string) => {
  fs.mkdirSync(path.dirname(databasePath), { recursive: true });
};

const logDatabaseError = (label: string, sql: string, error: unknown) => {
  if (process.env.NODE_ENV === "test") {
    return;
  }

  const databaseError = error as SqliteLikeError | undefined;
  console.error(label, {
    code: databaseError?.code,
    message: error instanceof Error ? error.message : "Unknown database error",
    statement: sql.replace(/\s+/g, " ").trim().slice(0, 180),
  });
};

const normalizeSql = (sql: string) => {
  return sql
    .replace(/\bNOW\(\)/gi, SQLITE_NOW_EXPRESSION)
    .replace(/\bILIKE\b/gi, "LIKE")
    .replace(/\bNULLS FIRST\b/gi, "")
    .replace(/\bFOR UPDATE(?: OF [\w."]+)?\b/gi, "")
    .replace(/::[a-zA-Z_][a-zA-Z0-9_\[\]]*/g, "");
};

const convertParams = (sql: string, params?: StatementParams) => {
  const normalizedSql = normalizeSql(sql);
  const values = (params ?? []).map((value) => {
    if (value === null || value === undefined) {
      return null;
    }

    if (typeof value === "boolean") {
      return value ? 1 : 0;
    }

    if (value instanceof Date) {
      return value.toISOString();
    }

    if (Buffer.isBuffer(value)) {
      return value;
    }

    if (Array.isArray(value) || typeof value === "object") {
      return JSON.stringify(value);
    }

    return value;
  });
  const placeholderMatches = normalizedSql.match(/\$(\d+)/g);

  if (!placeholderMatches || placeholderMatches.length === 0) {
    return {
      sql: normalizedSql,
      params: [...values],
    };
  }

  const orderedParams: unknown[] = [];
  const convertedSql = normalizedSql.replace(/\$(\d+)/g, (_match, rawIndex) => {
    const index = Number(rawIndex) - 1;
    orderedParams.push(values[index]);
    return "?";
  });

  return {
    sql: convertedSql,
    params: orderedParams,
  };
};

const getStatement = (sql: string) => {
  const connection = getDatabase();
  const cachedStatement = statementCache.get(sql);

  if (cachedStatement) {
    return cachedStatement;
  }

  const statement = connection.prepare(sql);
  statementCache.set(sql, statement);
  return statement;
};

const createExecutor = (): DatabaseExecutor => ({
  queryAll<T>(sql: string, params?: StatementParams) {
    const converted = convertParams(sql, params);

    try {
      const statement = getStatement(converted.sql);
      return statement.reader ? (statement.all(...converted.params) as T[]) : [];
    } catch (error) {
      logDatabaseError("[db.queryAll.failed]", sql, error);
      throw error;
    }
  },
  queryOne<T>(sql: string, params?: StatementParams) {
    const converted = convertParams(sql, params);

    try {
      const statement = getStatement(converted.sql);
      return statement.reader ? ((statement.get(...converted.params) as T | undefined) ?? null) : null;
    } catch (error) {
      logDatabaseError("[db.queryOne.failed]", sql, error);
      throw error;
    }
  },
  execute(sql: string, params?: StatementParams) {
    const converted = convertParams(sql, params);

    try {
      const result = getStatement(converted.sql).run(...converted.params);
      return {
        changes: result.changes,
        lastInsertRowid: result.lastInsertRowid,
      };
    } catch (error) {
      logDatabaseError("[db.execute.failed]", sql, error);
      throw error;
    }
  },
  query<T>(sql: string, params?: StatementParams) {
    const converted = convertParams(sql, params);
    const statement = getStatement(converted.sql);

    if (!statement.reader) {
      statement.run(...converted.params);
      return { rows: [] };
    }

    return {
      rows: statement.all(...converted.params) as T[],
    };
  },
});

const scheduleOptimize = () => {
  if (optimizeTimer) {
    return;
  }

  optimizeTimer = setInterval(() => {
    try {
      getDatabase().pragma("optimize");
    } catch (error) {
      if (process.env.NODE_ENV !== "test") {
        console.error("[db.optimize.failed]", {
          message: error instanceof Error ? error.message : "Unknown optimize error",
        });
      }
    }
  }, OPTIMIZE_INTERVAL_MS);

  optimizeTimer.unref();
};

const applyPragmas = (database: Database.Database) => {
  database.pragma("journal_mode = WAL");
  database.pragma("foreign_keys = ON");
  database.pragma("synchronous = NORMAL");
  database.pragma("busy_timeout = 5000");
  database.pragma("wal_autocheckpoint = 1000");
};

export const getDatabase = () => {
  if (databaseInstance) {
    return databaseInstance;
  }

  const databasePath = resolveDatabasePath();
  ensureDatabaseDirectoryExists(databasePath);

  databaseInstance = new Database(databasePath);
  applyPragmas(databaseInstance);
  scheduleOptimize();

  return databaseInstance;
};

export const queryAll = <T>(sql: string, params?: StatementParams) => {
  return createExecutor().queryAll<T>(sql, params);
};

export const queryOne = <T>(sql: string, params?: StatementParams) => {
  return createExecutor().queryOne<T>(sql, params);
};

export const execute = (sql: string, params?: StatementParams) => {
  return createExecutor().execute(sql, params);
};

export const query = <T>(sql: string, params?: StatementParams): QueryResult<T> => {
  return createExecutor().query<T>(sql, params);
};

export const transaction = <T>(callback: (tx: DatabaseExecutor) => T): TransactionRunner<T> => {
  const run = getDatabase().transaction(() => callback(createExecutor()));
  const wrapped = (() => run()) as TransactionRunner<T>;
  wrapped.immediate = () => run.immediate();
  return wrapped;
};

export const withTransaction = async <T>(callback: (tx: DatabaseExecutor) => Promise<T> | T) => {
  const tx = createExecutor();
  execute("BEGIN IMMEDIATE");

  try {
    const result = await callback(tx);
    execute("COMMIT");
    return result;
  } catch (error) {
    execute("ROLLBACK");
    throw error;
  }
};

export const runOptimize = () => {
  getDatabase().pragma("optimize");
};

export const checkDatabaseConnection = async () => {
  queryOne<{ ok: number }>("SELECT 1 AS ok");
  return true;
};

export const closeDatabase = async () => {
  if (optimizeTimer) {
    clearInterval(optimizeTimer);
    optimizeTimer = null;
  }

  statementCache.clear();

  if (databaseInstance) {
    databaseInstance.close();
    databaseInstance = null;
  }
};
