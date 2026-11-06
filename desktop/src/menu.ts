import { app, BrowserWindow, Menu, type MenuItemConstructorOptions } from "electron";

interface MenuActions {
  go: (pathname: string) => void;
  changeServer: () => void;
  openDocs: () => void;
  reload: () => void;
}

const isMac = process.platform === "darwin";

function history(direction: "back" | "forward") {
  const nav = BrowserWindow.getFocusedWindow()?.webContents.navigationHistory;
  if (!nav) return;
  if (direction === "back" && nav.canGoBack()) nav.goBack();
  if (direction === "forward" && nav.canGoForward()) nav.goForward();
}

export function buildMenu({ go, changeServer, openDocs, reload }: MenuActions) {
  const settings: MenuItemConstructorOptions = {
    label: "Settings…",
    accelerator: "CmdOrCtrl+,",
    click: () => go("/settings"),
  };
  const server: MenuItemConstructorOptions = { label: "Change Server…", click: changeServer };

  const template: MenuItemConstructorOptions[] = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: "about" },
              { type: "separator" },
              settings,
              server,
              { type: "separator" },
              { role: "services" },
              { type: "separator" },
              { role: "hide" },
              { role: "hideOthers" },
              { role: "unhide" },
              { type: "separator" },
              { role: "quit" },
            ],
          } satisfies MenuItemConstructorOptions,
        ]
      : []),
    {
      label: "File",
      submenu: [
        ...(isMac ? [] : [settings, server, { type: "separator" } as const]),
        isMac ? { role: "close" } : { role: "quit" },
      ],
    },
    { role: "editMenu" },
    {
      label: "View",
      submenu: [
        { label: "Back", accelerator: "CmdOrCtrl+[", click: () => history("back") },
        { label: "Forward", accelerator: "CmdOrCtrl+]", click: () => history("forward") },
        { label: "Reload", accelerator: "CmdOrCtrl+R", click: reload },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
        ...(app.isPackaged ? [] : [{ role: "toggleDevTools" } as const]),
      ],
    },
    {
      label: "Go",
      submenu: [
        { label: "Overview", accelerator: "CmdOrCtrl+1", click: () => go("/dashboard") },
        { label: "Sales", accelerator: "CmdOrCtrl+2", click: () => go("/sales") },
        { label: "Purchases", accelerator: "CmdOrCtrl+3", click: () => go("/purchases") },
        { label: "Contacts", accelerator: "CmdOrCtrl+4", click: () => go("/contacts") },
        { label: "Accounting", accelerator: "CmdOrCtrl+5", click: () => go("/accounting") },
        { label: "Reports", accelerator: "CmdOrCtrl+6", click: () => go("/reports") },
        { type: "separator" },
        { label: "Tilly", accelerator: "CmdOrCtrl+J", click: () => go("/assistant") },
        { label: "Notifications", click: () => go("/notifications") },
        { label: "Documents", click: () => go("/documents") },
      ],
    },
    { role: "windowMenu" },
    {
      role: "help",
      submenu: [{ label: "dubbl Documentation", click: openDocs }],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
