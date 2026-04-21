import { app, BrowserWindow, dialog, net, protocol } from "electron";
import { existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { getPackagedRendererPath } from "./src/main/app/runtime-paths";
import {
  createDesktopBackupService,
  getBackupsDirectory,
  restoreBackupFile,
  runIntegrityCheck,
  type DesktopBackupService,
} from "./src/main/backup/backup-service";
import {
  DATABASE_FILENAME,
  initializeDesktopDatabase,
  type DesktopDatabaseRuntime,
} from "./src/main/db/init";
import { registerBackupIpcHandlers } from "./src/main/ipc/backup-ipc";
import { registerWarehouseIpcHandlers } from "./src/main/ipc/warehouse-ipc";
import { registerWarehouseSyncIpcHandlers } from "./src/main/ipc/warehouse-sync-ipc";
import {
  createSyncAwareWarehouseDataService,
  createWarehouseSyncService,
  type WarehouseSyncService,
} from "./src/main/sync/sync-service";
import { configureAutoUpdates, type DesktopAutoUpdateRuntime } from "./src/main/updater/auto-update";

const APP_PROTOCOL = "app";
const DEV_SERVER_URL = process.env.ELECTRON_RENDERER_URL;
const isDevelopment = typeof DEV_SERVER_URL === "string" && DEV_SERVER_URL.length > 0;
const hasSingleInstanceLock = app.requestSingleInstanceLock();

let mainWindow: BrowserWindow | null = null;
let desktopDatabaseRuntime: DesktopDatabaseRuntime | null = null;
let warehouseSyncService: WarehouseSyncService | null = null;
let desktopBackupService: DesktopBackupService | null = null;
let desktopAutoUpdateRuntime: DesktopAutoUpdateRuntime | null = null;

protocol.registerSchemesAsPrivileged([
  {
    scheme: APP_PROTOCOL,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
    },
  },
]);

function getPreloadPath(): string {
  return path.join(__dirname, "preload.js");
}

function getProductionRendererPath(): string {
  const rendererPath = getPackagedRendererPath(__dirname);

  if (!existsSync(rendererPath)) {
    throw new Error(
      `React build not found at ${rendererPath}. Run "npm run build:desktop" from the repository root first.`,
    );
  }

  return rendererPath;
}

function getProductionDistPath(): string {
  return path.dirname(getProductionRendererPath());
}

function getEnvironmentLabel(): "dev" | "prod" {
  return isDevelopment ? "dev" : "prod";
}

function logEnvironment(rendererTarget: string): void {
  console.info(`[desktop:${getEnvironmentLabel()}] renderer target: ${rendererTarget}`);
}

function getProductionAppUrl(route = "/"): string {
  const normalizedRoute = route.replace(/^\/+/, "");

  return normalizedRoute.length > 0
    ? `${APP_PROTOCOL}://-/${normalizedRoute}`
    : `${APP_PROTOCOL}://-/`;
}

function resolveAssetPath(requestUrl: string): string {
  const url = new URL(requestUrl);
  const requestPath = decodeURIComponent(url.pathname).replace(/^\/+/, "");
  const normalizedPath = requestPath.length > 0 ? requestPath : "index.html";
  const distRoot = getProductionDistPath();
  const candidatePath = path.resolve(distRoot, normalizedPath);
  const relativePath = path.relative(distRoot, candidatePath);
  const isPathTraversal = relativePath.startsWith("..") || path.isAbsolute(relativePath);

  if (isPathTraversal) {
    return getProductionRendererPath();
  }

  if (existsSync(candidatePath)) {
    return candidatePath;
  }

  return path.extname(normalizedPath) === "" ? getProductionRendererPath() : candidatePath;
}

async function handleAppProtocol(request: Request): Promise<Response> {
  const assetPath = resolveAssetPath(request.url);

  if (!existsSync(assetPath)) {
    return new Response("Not Found", { status: 404 });
  }

  return net.fetch(pathToFileURL(assetPath).toString());
}

async function loadRenderer(window: BrowserWindow): Promise<void> {
  if (isDevelopment && DEV_SERVER_URL) {
    logEnvironment(DEV_SERVER_URL);
    await window.loadURL(DEV_SERVER_URL);
    return;
  }

  const productionUrl = getProductionAppUrl();
  logEnvironment(productionUrl);
  await window.loadURL(productionUrl);
}

async function createMainWindow(): Promise<BrowserWindow> {
  if (mainWindow && !mainWindow.isDestroyed()) {
    return mainWindow;
  }

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 1024,
    minHeight: 720,
    backgroundColor: "#08111f",
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: getPreloadPath(),
      sandbox: false,
    },
  });

  if (isDevelopment) {
    mainWindow.webContents.on("console-message", (_event, level, message, line, sourceId) => {
      const channel = level >= 2 ? "error" : "log";
      const sourceLabel = sourceId ? `${sourceId}:${line}` : `renderer:${line}`;

      console[channel](`[desktop:renderer] ${sourceLabel} ${message}`);
    });

    mainWindow.webContents.on(
      "did-fail-load",
      (_event, errorCode, errorDescription, validatedUrl, isMainFrame) => {
        console.error("[desktop:renderer] load failed", {
          errorCode,
          errorDescription,
          isMainFrame,
          validatedUrl,
        });
      },
    );
  }

  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  await loadRenderer(mainWindow);
  return mainWindow;
}

function getDatabasePath(): string {
  return path.join(app.getPath("userData"), DATABASE_FILENAME);
}

function stopDatabaseRuntime(): void {
  warehouseSyncService?.stop();
  warehouseSyncService = null;
  desktopDatabaseRuntime?.close();
  desktopDatabaseRuntime = null;
}

function stopDesktopServices(): void {
  desktopAutoUpdateRuntime?.stop();
  desktopAutoUpdateRuntime = null;
  desktopBackupService?.stop();
  desktopBackupService = null;
  stopDatabaseRuntime();
}

async function promptForRestoreBackup(userDataPath: string): Promise<string | null> {
  const backupsDirectory = getBackupsDirectory(userDataPath);

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
    title: "Select backup to restore",
  });

  return result.canceled ? null : result.filePaths[0] ?? null;
}

async function promptRestoreAfterFailure(
  title: string,
  detail: string,
  userDataPath: string,
): Promise<boolean> {
  const result = await dialog.showMessageBox({
    buttons: ["Restore backup", "Quit"],
    cancelId: 1,
    defaultId: 0,
    detail,
    message: title,
    noLink: true,
    type: "warning",
  });

  if (result.response !== 0) {
    return false;
  }

  const backupFilePath = await promptForRestoreBackup(userDataPath);

  if (!backupFilePath) {
    return false;
  }

  try {
    restoreBackupFile({
      backupFilePath,
      databasePath: getDatabasePath(),
      logger: console,
    });
    return true;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "An unknown backup restore error occurred.";

    dialog.showErrorBox("Restore Failed", message);
    return true;
  }
}

async function initializeDatabaseWithRecovery(): Promise<DesktopDatabaseRuntime | null> {
  const userDataPath = app.getPath("userData");

  while (true) {
    let runtime: DesktopDatabaseRuntime;

    try {
      runtime = initializeDesktopDatabase({
        userDataPath,
        isDevelopment,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "An unknown database error occurred.";

      console.error("[desktop:db] startup failed", {
        message,
      });

      const restoreAttempted = await promptRestoreAfterFailure(
        "Database Initialization Failed",
        `${message}\n\nYou can restore a backup from the local backups folder.`,
        userDataPath,
      );

      if (restoreAttempted) {
        continue;
      }

      return null;
    }

    const integrity = runIntegrityCheck(runtime.database);

    if (integrity.ok) {
      console.info("[desktop:db] integrity_check ok");
      return runtime;
    }

    console.error("[desktop:db] integrity_check failed", {
      message: integrity.message,
    });

    runtime.close();

    const restoreAttempted = await promptRestoreAfterFailure(
      "Database Integrity Check Failed",
      `${integrity.message}\n\nRestore a backup before opening the app.`,
      userDataPath,
    );

    if (restoreAttempted) {
      continue;
    }

    return null;
  }
}

function scheduleAppRestart(): void {
  setTimeout(() => {
    app.relaunch();
    app.exit(0);
  }, 150);
}

if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!mainWindow) {
      return;
    }

    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }

    mainWindow.focus();
  });

  app.whenReady().then(async () => {
    desktopDatabaseRuntime = await initializeDatabaseWithRecovery();

    if (!desktopDatabaseRuntime) {
      app.quit();
      return;
    }

    if (!isDevelopment) {
      protocol.handle(APP_PROTOCOL, handleAppProtocol);
    }

    warehouseSyncService = createWarehouseSyncService({
      database: desktopDatabaseRuntime.database,
      userDataPath: app.getPath("userData"),
    });
    desktopBackupService = createDesktopBackupService({
      getDatabase: () => desktopDatabaseRuntime?.database ?? null,
      getDatabasePath: () => desktopDatabaseRuntime?.databasePath ?? getDatabasePath(),
      logger: console,
      onBeforeRestore: () => {
        stopDatabaseRuntime();
      },
      userDataPath: app.getPath("userData"),
    });

    registerWarehouseIpcHandlers({
      warehouseDataService: createSyncAwareWarehouseDataService(
        desktopDatabaseRuntime.services.warehouseData,
        warehouseSyncService,
      ),
    });
    registerWarehouseSyncIpcHandlers({
      syncService: warehouseSyncService,
    });
    registerBackupIpcHandlers({
      backupService: desktopBackupService,
      logger: console,
      promptForRestorePath: () => promptForRestoreBackup(app.getPath("userData")),
      scheduleRestart: scheduleAppRestart,
    });
    warehouseSyncService.start();
    desktopBackupService.start();

    await createMainWindow();
    desktopAutoUpdateRuntime = configureAutoUpdates({
      logger: console,
    });
    desktopAutoUpdateRuntime.start();

    app.on("activate", async () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        await createMainWindow();
      }
    });
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
      app.quit();
    }
  });

  app.on("will-quit", () => {
    stopDesktopServices();
  });
}
