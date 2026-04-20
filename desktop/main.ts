import { app, BrowserWindow } from "electron";
import { existsSync } from "node:fs";
import path from "node:path";

const DEV_SERVER_URL = process.env.ELECTRON_RENDERER_URL;
const isDevelopment = typeof DEV_SERVER_URL === "string" && DEV_SERVER_URL.length > 0;

function getPreloadPath(): string {
  return path.join(__dirname, "preload.js");
}

function getProductionRendererPath(): string {
  const rendererPath = path.resolve(__dirname, "../../client/dist/index.html");

  if (!existsSync(rendererPath)) {
    throw new Error(
      `React build not found at ${rendererPath}. Run "npm run build:desktop" from the repository root first.`,
    );
  }

  return rendererPath;
}

function createMainWindow(): BrowserWindow {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: getPreloadPath(),
    },
  });

  if (isDevelopment && DEV_SERVER_URL) {
    void mainWindow.loadURL(DEV_SERVER_URL);
  } else {
    void mainWindow.loadFile(getProductionRendererPath());
  }

  return mainWindow;
}

app.whenReady().then(() => {
  createMainWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
