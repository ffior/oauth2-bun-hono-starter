/**
 * Post-build script: move artifacts into a versioned subdirectory.
 *
 * Before:
 *   artifacts/canary-macos-arm64-react-tailwind-vite-canary.dmg
 *   artifacts/canary-macos-arm64-update.json
 *
 * After:
 *   artifacts/v1.0.6/canary-macos-arm64-react-tailwind-vite-canary.dmg
 *   artifacts/v1.0.6/canary-macos-arm64-update.json
 *
 * Usage: bun run scripts/rename-artifacts.ts
 */

import { readdirSync, renameSync, mkdirSync, existsSync, statSync } from "fs";
import { join } from "path";

const pkg = await import("../package.json");
const VERSION: string = pkg.default.version;

const ARTIFACTS_DIR = join(import.meta.dir, "../artifacts");
const VERSION_DIR = join(ARTIFACTS_DIR, `v${VERSION}`);

if (!existsSync(ARTIFACTS_DIR)) {
	console.log(`[rename-artifacts] Directory not found: ${ARTIFACTS_DIR}`);
	process.exit(0);
}

// Create versioned subdirectory
mkdirSync(VERSION_DIR, { recursive: true });
console.log(`[rename-artifacts] Output directory: artifacts/v${VERSION}/`);

const entries = readdirSync(ARTIFACTS_DIR);
let moved = 0;

for (const file of entries) {
	const src = join(ARTIFACTS_DIR, file);

	// Skip the versioned subdirectory itself
	if (statSync(src).isDirectory()) continue;

	const dest = join(VERSION_DIR, file);
	renameSync(src, dest);
	console.log(`[rename-artifacts] ${file} → v${VERSION}/${file}`);
	moved++;
}

console.log(`[rename-artifacts] Done. ${moved} file(s) moved to artifacts/v${VERSION}/`);
