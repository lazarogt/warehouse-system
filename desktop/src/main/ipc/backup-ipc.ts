import { dialog, ipcMain } from "electron";
import type { ApiResponse } from "../../../../shared/src/types/desktop-warehouse-ipc";
import type {
  CreateBackupResult,
  RestoreBackupPayload,
  RestoreBackupResult,
} from "../../../../shared/src/types/desktop-backup-ipc";
import type { DatabaseLogger } from "../db/database";
import type { DesktopBackupService } from "../backup/backup-service";
import { BACKUP_IPC_CHANNELS } from "../../shared/backup-ipc-channels";

type IpcHandlerRegistrar = {
  handle(
    channel: string,
    listener: (_event: unknown, payload?: unknown) => Promise<unknown> | unknown,
  ): void;
};

type RegisterBackupIpcHandlersOptions = {
  logger?: DatabaseLogger;
  promptForRestorePath?: () => Promise<string | null>;
  registrar?: IpcHandlerRegistrar;
  scheduleRestart?: () => void;
  backupService: DesktopBackupService;
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

function successResponse<T>(data: T): ApiResponse<T> {
  return {
    success: true,
    data,
  };
}

function errorResponse(message: string): ApiResponse<never> {
  return {
    success: false,
    error: {
      code: "INTERNAL_ERROR",
      message,
    },
  };
}

function isRestorePayload(payload: unknown): payload is RestoreBackupPayload {
  return payload === undefined || (payload !== null && typeof payload === "object");
}

async function defaultPromptForRestorePath(
  backupsDirectory: string,
): Promise<string | null> {
  const result = await dialog.showOpenDialog({
    buttonLabel: "Restore Backup",
    defaultPath: backupsDirectory,
    filters: [
      {
        name: "SQLite Backup",
        extensions: ["db", "sqlite", "backup"],
      },
    ],
    properties: ["openFile"],
    title: "Select backup file",
  });

  return result.canceled ? null : result.filePaths[0] ?? null;
}

export function registerBackupIpcHandlers(options: RegisterBackupIpcHandlersOptions): void {
  const registrar = options.registrar ?? ipcMain;
  const logger = options.logger ?? DEFAULT_LOGGER;
  const promptForRestorePath =
    options.promptForRestorePath ??
    (() => defaultPromptForRestorePath(options.backupService.getBackupsDirectory()));

  registrar.handle(
    BACKUP_IPC_CHANNELS.create,
    async (): Promise<ApiResponse<CreateBackupResult>> => {
      try {
        const backup = await options.backupService.createBackup("manual");
        return successResponse(backup);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unable to create backup.";

        logger.error("[desktop:backup-ipc] create backup failed", {
          message,
        });

        return errorResponse("Unable to create backup.");
      }
    },
  );

  registrar.handle(
    BACKUP_IPC_CHANNELS.restore,
    async (event, payload): Promise<ApiResponse<RestoreBackupResult>> => {
      void event;

      try {
        if (!isRestorePayload(payload)) {
          return errorResponse("Invalid restore payload.");
        }

        const selectedFilePath = payload?.filePath || (await promptForRestorePath());

        if (!selectedFilePath) {
          return successResponse({
            restored: false,
            restoredFrom: null,
            preRestoreBackupPath: null,
            restartRequired: false,
          });
        }

        const result = await options.backupService.restoreBackup(selectedFilePath);
        options.scheduleRestart?.();
        return successResponse(result);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unable to restore backup.";

        logger.error("[desktop:backup-ipc] restore backup failed", {
          message,
        });

        return errorResponse("Unable to restore backup.");
      }
    },
  );

  logger.info("[desktop:backup-ipc] handlers registered", {
    createChannel: BACKUP_IPC_CHANNELS.create,
    restoreChannel: BACKUP_IPC_CHANNELS.restore,
  });
}
