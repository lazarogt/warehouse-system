import fs from "node:fs";
import path from "node:path";

const workspaceRoot = path.resolve(import.meta.dirname, "../..");
const rendererSourcePath = path.join(workspaceRoot, "client", "dist");
const rendererTargetPath = path.join(workspaceRoot, "desktop", "renderer");

if (!fs.existsSync(rendererSourcePath)) {
  throw new Error(
    `Renderer build not found at ${rendererSourcePath}. Run "npm run build --prefix client" first.`,
  );
}

fs.rmSync(rendererTargetPath, { force: true, recursive: true });
fs.mkdirSync(path.dirname(rendererTargetPath), { recursive: true });
fs.cpSync(rendererSourcePath, rendererTargetPath, { recursive: true });

console.info(`[desktop:build] renderer prepared at ${rendererTargetPath}`);
