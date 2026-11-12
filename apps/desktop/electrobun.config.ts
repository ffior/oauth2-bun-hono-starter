import type { ElectrobunConfig } from "electrobun";
import pkg from "./package.json";

export default {
	app: {
		name: "react-tailwind-vite",
		identifier: "reacttailwindvite.electrobun.dev",
		version: pkg.version,
	},
	release: {
		// Object storage base URL where app bundles and update manifests are published.
		// Expected files at this path (example for stable/macos-arm64):
		//   stable-macos-arm64-update.json  — update manifest
		//   stable-macos-arm64-app.tar.zst  — full bundle
		//   stable-macos-arm64-<hash>.patch — delta patches (optional)
		baseUrl: "http://127.0.0.1:9009",
		generatePatch: false,
	},
	build: {
		// Vite builds to dist/, we copy from there
		copy: {
			"dist/index.html": "views/mainview/index.html",
			"dist/assets": "views/mainview/assets",
		},
		// Ignore Vite output in watch mode — HMR handles view rebuilds separately
		watchIgnore: ["dist/**"],
		mac: {
			bundleCEF: false,
		},
		linux: {
			bundleCEF: false,
		},
		win: {
			bundleCEF: false,
		},
	},
} satisfies ElectrobunConfig;
