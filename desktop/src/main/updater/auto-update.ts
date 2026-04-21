import { app, dialog } from "electron";
import { autoUpdater } from "electron-updater";
import { isAutoUpdateEnabled } from "./update-config";

const STARTUP_UPDATE_CHECK_DELAY_MS = 15_000;
const UPDATE_RECHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

type UpdaterLogger = Pick<Console, "error" | "info" | "warn">;

export type DesktopAutoUpdateRuntime = {
  start(): void;
  stop(): void;
};

type ConfigureAutoUpdatesOptions = {
  env?: NodeJS.ProcessEnv;
  isPackaged?: boolean;
  logger?: UpdaterLogger;
};

export function configureAutoUpdates(
  options?: ConfigureAutoUpdatesOptions,
): DesktopAutoUpdateRuntime {
  const logger = options?.logger ?? console;
  const isPackaged = options?.isPackaged ?? app.isPackaged;
  const env = options?.env ?? process.env;
  let intervalHandle: NodeJS.Timeout | null = null;
  let startupTimeoutHandle: NodeJS.Timeout | null = null;
  let started = false;

  const shouldEnable = isAutoUpdateEnabled({
    env,
    isPackaged,
  });

  const checkForUpdates = async () => {
    try {
      await autoUpdater.checkForUpdates();
    } catch (error) {
      logger.warn("[desktop:update] check failed", {
        message: error instanceof Error ? error.message : "Unknown auto-update error",
      });
    }
  };

  return {
    start() {
      if (!shouldEnable || started) {
        if (!shouldEnable) {
          logger.info("[desktop:update] auto-update disabled", {
            isPackaged,
          });
        }

        return;
      }

      started = true;
      autoUpdater.autoDownload = false;
      autoUpdater.autoInstallOnAppQuit = true;

      autoUpdater.on("checking-for-update", () => {
        logger.info("[desktop:update] checking for updates");
      });

      autoUpdater.on("update-available", async (updateInfo) => {
        logger.info("[desktop:update] update available", {
          version: updateInfo.version,
        });

        try {
          await autoUpdater.downloadUpdate();
        } catch (error) {
          logger.error("[desktop:update] download failed", {
            message: error instanceof Error ? error.message : "Unknown download error",
          });
        }
      });

      autoUpdater.on("update-not-available", (updateInfo) => {
        logger.info("[desktop:update] no update available", {
          version: updateInfo.version,
        });
      });

      autoUpdater.on("error", (error) => {
        logger.error("[desktop:update] updater error", {
          message: error instanceof Error ? error.message : "Unknown updater error",
        });
      });

      autoUpdater.on("update-downloaded", async (updateInfo) => {
        logger.info("[desktop:update] update downloaded", {
          version: updateInfo.version,
        });

        const result = await dialog.showMessageBox({
          type: "info",
          buttons: ["Restart and Install", "Later"],
          defaultId: 0,
          cancelId: 1,
          title: "Update Ready",
          message: `Version ${updateInfo.version} is ready to install.`,
          detail: "warehouse-system will restart to finish applying the update.",
        });

        if (result.response === 0) {
          autoUpdater.quitAndInstall();
        }
      });

      startupTimeoutHandle = setTimeout(() => {
        void checkForUpdates();
      }, STARTUP_UPDATE_CHECK_DELAY_MS);

      intervalHandle = setInterval(() => {
        void checkForUpdates();
      }, UPDATE_RECHECK_INTERVAL_MS);
    },

    stop() {
      if (startupTimeoutHandle) {
        clearTimeout(startupTimeoutHandle);
        startupTimeoutHandle = null;
      }

      if (intervalHandle) {
        clearInterval(intervalHandle);
        intervalHandle = null;
      }

      started = false;
      autoUpdater.removeAllListeners();
    },
  };
}
