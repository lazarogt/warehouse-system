# Desktop Release Process

## Scope

This document covers production packaging and distribution for the Electron desktop app with `electron-builder`.

- Windows target: `nsis`
- macOS target: `dmg`
- Linux target: `AppImage`
- Release output: [`/dist-electron`](/media/rebeca-lazaro/1CB41B1EB41AF9CA6/Dev/Proyectos%20sistemas%20web/warehouse-system/dist-electron)

## Versioning Strategy

Desktop releases use semantic versioning from [`desktop/package.json`](/media/rebeca-lazaro/1CB41B1EB41AF9CA6/Dev/Proyectos%20sistemas%20web/warehouse-system/desktop/package.json).

- Release tags must match the desktop package version exactly.
- Example: if `desktop/package.json` is `0.2.3`, the Git tag must be `v0.2.3`.
- CI fails fast if the tag and package version diverge.

## Local Build Commands

From the repository root:

```bash
npm run dist:desktop
npm run dist:desktop:win
npm run dist:desktop:mac
npm run dist:desktop:linux
```

These commands:

1. Build the React renderer with Vite.
2. Compile the Electron main/preload processes.
3. Copy the production renderer into `desktop/renderer`.
4. Package installers into `dist-electron`.

## CI/CD Release Flow

GitHub Actions workflow: [`.github/workflows/desktop-release.yml`](/media/rebeca-lazaro/1CB41B1EB41AF9CA6/Dev/Proyectos%20sistemas%20web/warehouse-system/.github/workflows/desktop-release.yml)

Trigger:

- push of a semantic version tag like `v0.1.0`

Pipeline behavior:

1. Build Linux, Windows, and macOS artifacts on their native runners.
2. Collect installer artifacts plus update metadata files.
3. Create or update the GitHub Release for the tag.
4. Attach all build outputs to that release.

## Auto-Update Configuration

Updater runtime is wired with [`electron-updater`](https://www.electron.build/auto-update.html) and GitHub Releases as the publish provider.

- Update checks run only for packaged builds.
- Checks are skipped when `WAREHOUSE_DISABLE_AUTO_UPDATE=true`.
- The app checks for updates shortly after startup and periodically while running.
- Downloaded updates prompt the user to restart and install.

Operational notes:

- GitHub Releases must stay enabled as the first publish target because update metadata is generated for that provider.
- macOS auto-update requires code signing to work end to end in production. The CI workflow currently builds unsigned DMGs unless signing credentials are added at runtime.

## Persistence Guarantees Across Updates

Local state is intentionally stored outside the application bundle.

- SQLite database: `app.getPath("userData")/warehouse.db`
- Sync queue state: `app.getPath("userData")/warehouse-sync-state.json`

These files are not stored inside `app.asar`, installer directories, or `dist-electron`, so they persist across reinstallations and auto-updates.

Relevant implementation:

- [`desktop/src/main/db/init.ts`](/media/rebeca-lazaro/1CB41B1EB41AF9CA6/Dev/Proyectos%20sistemas%20web/warehouse-system/desktop/src/main/db/init.ts)
- [`desktop/src/main/sync/sync-service.ts`](/media/rebeca-lazaro/1CB41B1EB41AF9CA6/Dev/Proyectos%20sistemas%20web/warehouse-system/desktop/src/main/sync/sync-service.ts)

## Security Constraints

- No `.env` files or secrets are packaged into the desktop bundle.
- Packaging includes only compiled Electron files, the compiled renderer, production dependencies, and package metadata.
- Runtime configuration must come from environment variables provided at launch time or CI secrets provided only during release execution.
- GitHub publishing uses the workflow `GITHUB_TOKEN`; it is never written into the application bundle.

## Release Checklist

1. Update `desktop/package.json` to the next semantic version.
2. Run `npm run test:desktop`.
3. Run `npm run dist:desktop` locally if you need a preflight package check.
4. Create and push the matching tag: `v<desktop-package-version>`.
5. Verify the GitHub Release contains installers and `latest*.yml` metadata files.
