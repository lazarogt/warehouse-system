import assert from "node:assert/strict";
import test from "node:test";
import { AUTO_UPDATE_DISABLE_ENV_NAME, isAutoUpdateEnabled } from "./update-config";

test("isAutoUpdateEnabled disables updates outside packaged builds", () => {
  assert.equal(isAutoUpdateEnabled({ isPackaged: false }), false);
});

test("isAutoUpdateEnabled enables packaged builds by default", () => {
  assert.equal(isAutoUpdateEnabled({ env: {}, isPackaged: true }), true);
});

test("isAutoUpdateEnabled respects the runtime disable flag", () => {
  assert.equal(
    isAutoUpdateEnabled({
      env: {
        [AUTO_UPDATE_DISABLE_ENV_NAME]: "true",
      },
      isPackaged: true,
    }),
    false,
  );
});
