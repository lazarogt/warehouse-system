import path from "node:path";

export function getPackagedRendererPath(mainProcessDistPath: string): string {
  return path.join(mainProcessDistPath, "../renderer/index.html");
}

export function getPackagedRendererDistPath(mainProcessDistPath: string): string {
  return path.dirname(getPackagedRendererPath(mainProcessDistPath));
}
