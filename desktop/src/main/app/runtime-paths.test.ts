import assert from "node:assert/strict";
import path from "node:path";
import { test } from "vitest";
import { getPackagedRendererDistPath, getPackagedRendererPath } from "./runtime-paths";

test("getPackagedRendererPath resolves the bundled renderer relative to the compiled main process", () => {
  const mainProcessDistPath = path.join("/workspace", "desktop", "dist");

  assert.equal(
    getPackagedRendererPath(mainProcessDistPath),
    path.join("/workspace", "desktop", "renderer", "index.html"),
  );
});

test("getPackagedRendererDistPath resolves the packaged renderer directory", () => {
  const mainProcessDistPath = path.join("/workspace", "desktop", "dist");

  assert.equal(
    getPackagedRendererDistPath(mainProcessDistPath),
    path.join("/workspace", "desktop", "renderer"),
  );
});
