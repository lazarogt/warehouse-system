import fs from "node:fs";
import path from "node:path";

const packageJsonPath = path.resolve(import.meta.dirname, "../package.json");
const desktopPackage = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
const version = desktopPackage.version;
const tagName = process.argv[2];
const semverPattern = /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

if (typeof version !== "string" || !semverPattern.test(version)) {
  throw new Error(`desktop/package.json version must be valid semver. Received: ${String(version)}`);
}

if (typeof tagName === "string") {
  if (!semverPattern.test(tagName)) {
    throw new Error(`Release tag "${tagName}" must use semver, for example v${version}.`);
  }

  if (tagName !== `v${version}`) {
    throw new Error(
      `Release tag ${tagName} does not match desktop/package.json version v${version}.`,
    );
  }
}

console.info(`[desktop:release] version ${version} verified${tagName ? ` against ${tagName}` : ""}.`);
