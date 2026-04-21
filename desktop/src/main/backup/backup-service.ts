import fs from "node:fs";
import path from "node:path";
import type {
  CreateBackupResult,
  RestoreBackupResult,
} from "../../../../shared/src/types/desktop-backup-ipc";
import type { DatabaseLogger, DesktopDatabase } from "../db/database";

export const BACKUPS_DIRECTORY_NAME = "backups";
export const AUTO_BACKUP_INTERVAL_MS = 30 * 60 * 1000;
export const MAX_BACKUP_FILES = 10;

type BackupReason = CreateBackupResult["reason"];

type CreateDesktopBackupServiceOptions = {
  autoBackupIntervalMs?: number;
  getDatabase: () => DesktopDatabase | null;
  getDatabasePath: () => string | null;
  logger?: DatabaseLogger;
  maxBackupFiles?: number;
  onBeforeRestore?: () => Promise<void> | void;
  userDataPath: string;
};

export type DesktopBackupService = {
  createBackup: (reason?: BackupReason) => Promise<CreateBackupResult>;
  getBackupsDirectory: () => string;
  restoreBackup: (filePath: string) => Promise<RestoreBackupResult>;
  start: () => void;
  stop: () => void;
};

export type DatabaseIntegrityCheckResult = {
  ok: boolean;
  message: string;
};

type RestoreBackupFileOptions = {
  backupFilePath: string;
  databasePath: string;
  logger?: DatabaseLogger;
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

function ensureDirectoryExists(directoryPath: string): void {
  fs.mkdirSync(directoryPath, { recursive: true });
}

function sanitizeTimestamp(date = new Date()): string {
  return date.toISOString().replace(/[:.]/g, "-");
}

function buildBackupFileName(reason: BackupReason, date = new Date()): string {
  return `warehouse-${reason}-${sanitizeTimestamp(date)}.db`;
}

function removeFileIfExists(filePath: string): void {
  if (fs.existsSync(filePath)) {
    fs.rmSync(filePath, { force: true });
  }
}

function getWalPath(databasePath: string): string {
  return `${databasePath}-wal`;
}

function getShmPath(databasePath: string): string {
  return `${databasePath}-shm`;
}

export function getBackupsDirectory(userDataPath: string): string {
  return path.join(userDataPath, BACKUPS_DIRECTORY_NAME);
}

function toBackupRecord(filePath: string, reason: BackupReason): CreateBackupResult {
  const stats = fs.statSync(filePath);

  return {
    fileName: path.basename(filePath),
    filePath,
    createdAt: new Date(stats.mtimeMs).toISOString(),
    size: stats.size,
    reason,
  };
}

function listBackupFiles(backupsDirectory: string): string[] {
  if (!fs.existsSync(backupsDirectory)) {
    return [];
  }

  return fs
    .readdirSync(backupsDirectory)
    .filter((entry) => entry.endsWith(".db"))
    .map((entry) => path.join(backupsDirectory, entry))
    .sort((left, right) => fs.statSync(right).mtimeMs - fs.statSync(left).mtimeMs);
}

function rotateBackups(backupsDirectory: string, maxBackupFiles: number, logger: DatabaseLogger): void {
  const backupFiles = listBackupFiles(backupsDirectory);

  backupFiles.slice(maxBackupFiles).forEach((filePath) => {
    removeFileIfExists(filePath);
    logger.info("[desktop:backup] rotated backup", {
      filePath,
    });
  });
}

export function runIntegrityCheck(database: DesktopDatabase): DatabaseIntegrityCheckResult {
  const result = String(database.pragma<string>("integrity_check", { simple: true }) ?? "").trim();

  if (result.toLowerCase() === "ok") {
    return {
      ok: true,
      message: "ok",
    };
  }

  return {
    ok: false,
    message: result || "Integrity check failed.",
  };
}

export function restoreBackupFile(options: RestoreBackupFileOptions): void {
  const logger = options.logger ?? DEFAULT_LOGGER;
  const { backupFilePath, databasePath } = options;

  if (!fs.existsSync(backupFilePath)) {
    throw new Error(`Backup file not found at ${backupFilePath}.`);
  }

  ensureDirectoryExists(path.dirname(databasePath));

  const stagedRestorePath = `${databasePath}.restore-${Date.now()}.tmp`;
  const rollbackPath = `${databasePath}.rollback-${Date.now()}`;

  fs.copyFileSync(backupFilePath, stagedRestorePath);

  try {
    removeFileIfExists(getWalPath(databasePath));
    removeFileIfExists(getShmPath(databasePath));

    if (fs.existsSync(databasePath)) {
      fs.renameSync(databasePath, rollbackPath);
    }

    fs.renameSync(stagedRestorePath, databasePath);
    removeFileIfExists(rollbackPath);

    logger.info("[desktop:backup] database restored", {
      backupFilePath,
      databasePath,
    });
  } catch (error) {
    removeFileIfExists(stagedRestorePath);

    if (!fs.existsSync(databasePath) && fs.existsSync(rollbackPath)) {
      fs.renameSync(rollbackPath, databasePath);
    }

    logger.error("[desktop:backup] database restore failed", {
      backupFilePath,
      databasePath,
      message: error instanceof Error ? error.message : "Unknown restore error",
    });
    throw error;
  }
}

class DefaultDesktopBackupService implements DesktopBackupService {
  private readonly autoBackupIntervalMs: number;
  private readonly getDatabase: () => DesktopDatabase | null;
  private readonly getDatabasePath: () => string | null;
  private readonly logger: DatabaseLogger;
  private readonly maxBackupFiles: number;
  private readonly onBeforeRestore?: () => Promise<void> | void;
  private readonly backupsDirectory: string;
  private intervalHandle?: NodeJS.Timeout;

  constructor(options: CreateDesktopBackupServiceOptions) {
    this.autoBackupIntervalMs = options.autoBackupIntervalMs ?? AUTO_BACKUP_INTERVAL_MS;
    this.backupsDirectory = getBackupsDirectory(options.userDataPath);
    this.getDatabase = options.getDatabase;
    this.getDatabasePath = options.getDatabasePath;
    this.logger = options.logger ?? DEFAULT_LOGGER;
    this.maxBackupFiles = options.maxBackupFiles ?? MAX_BACKUP_FILES;
    this.onBeforeRestore = options.onBeforeRestore;
  }

  start(): void {
    if (this.intervalHandle) {
      return;
    }

    this.intervalHandle = setInterval(() => {
      void this.createBackup("automatic").catch((error: unknown) => {
        this.logger.warn("[desktop:backup] automatic backup skipped", {
          message: error instanceof Error ? error.message : "Unknown automatic backup error",
        });
      });
    }, this.autoBackupIntervalMs);
    this.intervalHandle.unref();

    this.logger.info("[desktop:backup] automatic backup started", {
      backupsDirectory: this.backupsDirectory,
      intervalMs: this.autoBackupIntervalMs,
      maxBackupFiles: this.maxBackupFiles,
    });
  }

  stop(): void {
    if (!this.intervalHandle) {
      return;
    }

    clearInterval(this.intervalHandle);
    this.intervalHandle = undefined;
    this.logger.info("[desktop:backup] automatic backup stopped");
  }

  getBackupsDirectory(): string {
    return this.backupsDirectory;
  }

  async createBackup(reason: BackupReason = "manual"): Promise<CreateBackupResult> {
    const database = this.getDatabase();

    if (!database) {
      throw new Error("Database runtime is not available for backup.");
    }

    ensureDirectoryExists(this.backupsDirectory);
    database.pragma("wal_checkpoint(TRUNCATE)");

    const backupFilePath = path.join(this.backupsDirectory, buildBackupFileName(reason));
    await database.backup(backupFilePath);
    rotateBackups(this.backupsDirectory, this.maxBackupFiles, this.logger);

    const backupRecord = toBackupRecord(backupFilePath, reason);

    this.logger.info("[desktop:backup] backup created", {
      reason,
      filePath: backupRecord.filePath,
      size: backupRecord.size,
    });

    return backupRecord;
  }

  async restoreBackup(filePath: string): Promise<RestoreBackupResult> {
    const databasePath = this.getDatabasePath();

    if (!databasePath) {
      throw new Error("Database path is not available for restore.");
    }

    const preRestoreBackup = await this.createBackup("restore-point");
    await this.onBeforeRestore?.();
    restoreBackupFile({
      backupFilePath: filePath,
      databasePath,
      logger: this.logger,
    });

    return {
      restored: true,
      restoredFrom: filePath,
      preRestoreBackupPath: preRestoreBackup.filePath,
      restartRequired: true,
    };
  }
}

export function createDesktopBackupService(
  options: CreateDesktopBackupServiceOptions,
): DesktopBackupService {
  return new DefaultDesktopBackupService(options);
}
