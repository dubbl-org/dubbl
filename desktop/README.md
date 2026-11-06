# dubbl desktop

dubbl in its own window for macOS, Windows and Linux. It's a thin Electron shell
around the web app, so features ship with the server, not with app updates.

- **macOS:** inset traffic lights and `sidebar` vibrancy behind the rail and panel.
- **Windows 11:** Mica backdrop.
- **Linux:** a plain window in the shell colour.

The preload marks `<html data-desktop="mac|windows|linux">`. The web app's CSS
(`app/globals.css`, "Desktop app") uses that to clear the shell background, make
room for the traffic lights and set the drag regions. `components/shared/desktop-bridge.tsx`
keeps the native material's light or dark mode in step with the page theme.

## Develop

```bash
cd desktop
pnpm install
pnpm dev              # loads http://localhost:3000 (run `pnpm dev` at the repo root first)
DUBBL_URL=https://dubbl.dev pnpm dev
```

Without `DUBBL_URL`, the first launch asks for dubbl Cloud or a self-hosted
address and saves the choice in the app's user data folder.

## Package

```bash
pnpm dist:mac     # dmg + zip, arm64 and x64
pnpm dist:win     # nsis installer
pnpm dist:linux   # AppImage + deb
```

To sign and notarize on macOS, set `CSC_LINK`, `CSC_KEY_PASSWORD`, `APPLE_ID`,
`APPLE_APP_SPECIFIC_PASSWORD` and `APPLE_TEAM_ID`. Packaged builds check GitHub
releases of `dubbl-org/dubbl` for updates (`electron-updater`).

## Layout

- `src/main.ts`: the window, navigation rules, offline handling, IPC
- `src/preload.ts`: the `data-desktop` marker and the `window.dubblDesktop` bridge
- `src/menu.ts`: the app menu and shortcuts
- `src/settings.ts`: the saved server and window bounds
- `static/`: the connect and offline screens
