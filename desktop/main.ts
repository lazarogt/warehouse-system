import { app, BrowserWindow, dialog, net, protocol } from "electron";
import { existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  initializeDesktopDatabase,
  type DesktopDatabaseRuntime,
} from "./src/main/db/init";
import { registerWarehouseIpcHandlers } from "./src/main/ipc/warehouse-ipc";
import { registerWarehouseSyncIpcHandlers } from "./src/main/ipc/warehouse-sync-ipc";
import {
  createSyncAwareWarehouseDataService,
  createWarehouseSyncService,
  type WarehouseSyncService,
} from "./src/main/sync/sync-service";

const APP_PROTOCOL = "app";
const DEV_SERVER_URL = process.env.ELECTRON_RENDERER_URL;
const isDevelopment = typeof DEV_SERVER_URL === "string" && DEV_SERVER_URL.length > 0;
const hasSingleInstanceLock = app.requestSingleInstanceLock();

let mainWindow: BrowserWindow | null = null;
let desktopDatabaseRuntime: DesktopDatabaseRuntime | null = null;
let warehouseSyncService: WarehouseSyncService | null = null;

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
  const rendererPath = path.join(__dirname, "../../client/dist/index.html");

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
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: getPreloadPath(),
    },
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  await loadRenderer(mainWindow);
  return mainWindow;
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
    try {
      desktopDatabaseRuntime = initializeDesktopDatabase({
        userDataPath: app.getPath("userData"),
        isDevelopment,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "An unknown database error occurred.";

      console.error("[desktop:db] startup failed", {
        message,
      });
      dialog.showErrorBox("Database Initialization Failed", message);
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

    registerWarehouseIpcHandlers({
      warehouseDataService: createSyncAwareWarehouseDataService(
        desktopDatabaseRuntime.services.warehouseData,
        warehouseSyncService,
      ),
    });
    registerWarehouseSyncIpcHandlers({
      syncService: warehouseSyncService,
    });
    warehouseSyncService.start();

    await createMainWindow();

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
    warehouseSyncService?.stop();
    warehouseSyncService = null;
    desktopDatabaseRuntime?.close();
    desktopDatabaseRuntime = null;
  });
}
