# MyAnime1996

A Tauri v2 + React + TypeScript desktop anime metadata browser styled with a retro VHS/CRT interface.

## Scripts

- `npm run dev` starts the Vite frontend.
- `npm run build` type-checks and builds the frontend.
- `npm run tauri:dev` starts the desktop app.
- `npm run tauri:build` creates a desktop bundle.

Jikan provides anime metadata only. This app includes local player-style controls and watch progress, with optional import-based source plugins for non-trailer playback.

## Plugin Host Policy

- Base desktop policy is intentionally broad for plugin development: CSP allows HTTPS origins and HTTP capability allows wildcard HTTP/HTTPS URLs.
- Plugin artifacts should still declare `plugin.hostRequirements` for observability and maintenance.
- Missing or incomplete host requirements are warn-only today: plugin execution is not blocked, but the app logs undeclared host usage.
- Runtime ACL/CSP mutation from plugin artifacts is not supported; Tauri capabilities and CSP are loaded at startup.

Minimum plugin metadata example:

```json
{
	"schemaVersion": 2,
	"compatibilityApiVersion": "1.0",
	"plugin": {
		"id": "example-source",
		"name": "Example Source",
		"version": "1.0.0",
		"compatibilityApiVersion": "1.0",
		"hostRequirements": {
			"connectSrcOrigins": ["https://example.com"],
			"frameSrcOrigins": ["https://example.com"],
			"httpAllowlist": ["https://example.com/*"]
		},
		"resolver": {
			"kind": "inline-js",
			"code": "async function resolvePluginSource(request, api) { return null; }",
			"timeoutMs": 7000
		}
	}
}
```

## Importing External Source Plugins (Video Resolve)

This repository does not ship any video source plugin artifacts.

To resolve and play non-trailer video sources, you must import plugin artifact files (`.json`) built and distributed outside this repo.

1. Open the app.
2. Go to the Plugins panel (`Plugin Sources`).
3. Click `Import Plugin`.
4. Select a source plugin artifact JSON file from your local machine.
5. Confirm the plugin appears in the list (`id`, version, icon).

After import:

- Enable/disable a plugin with the toggle button.
- Reorder plugin priority with `Move Up`/`Move Down`.
- Optionally click `Prefer` to force that plugin first.
- During playback, the app uses enabled plugins by priority (or preferred plugin) to resolve episode sources.

Notes:

- Importing the same plugin `id` again replaces the previously imported version.
- If no plugins are imported, only trailer/metadata features are available.
- Plugin artifacts are expected to declare host requirements for best observability.
