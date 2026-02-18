# OffTheGrid Desktop (Electron)

This wraps the existing Vite renderer in `client-web` with Electron.

## Dev

From `client-app`:

- `npm run dev`

This starts the Vite dev server from `client-web` and launches Electron.

## Build

- `npm run build`
- `npm run dist`

The build uses `client-web/dist` as the renderer.
