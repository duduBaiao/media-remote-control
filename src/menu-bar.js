import QRCode from "qrcode";
import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  Menu,
  nativeImage,
  shell,
  Tray
} from "electron";
import { createRemoteToken, startRemoteServer } from "./server.js";

const appName = "Mac Remote";
const defaultPort = Number.parseInt(process.env.PORT ?? "3000", 10);
const fallbackPort = 0;
const trayIconPng1x =
  "iVBORw0KGgoAAAANSUhEUgAAABIAAAASCAYAAABWzo5XAAAAPklEQVR4nGNgGAW0Av+JUUBQETHq/hNQhCyH17D/WDA2NWQZhK74Pw42/Qyi2Gv45Ik2iBAgVh1RBo0CEgEA6gg3ya0iT68AAAAASUVORK5CYII=";
const trayIconPng2x =
  "iVBORw0KGgoAAAANSUhEUgAAACQAAAAkCAYAAADhAJiYAAAAe0lEQVR4nO2RQQrAIAwE/f+n7akgJSGJ2WigO9CLdIcRxyCEkH8xbweszOVLS9BB207IrZC+760iIm2TipKCvKKjQV4hPMoKsoRXgiyx9M+RIE3OoHZP5t17ztNBkX1pUHQLidGCdrYlQQjSvqoYlDNFq5iXVjGEECLxACkAzTM6yBpJAAAAAElFTkSuQmCC";

let tray = null;
let pairingWindow = null;
let serverDetails = null;
let remoteToken = process.env.REMOTE_TOKEN || createRemoteToken();

app.setName(appName);

const hasSingleInstanceLock = app.requestSingleInstanceLock();

if (!hasSingleInstanceLock) {
  app.quit();
}

app.on("second-instance", () => {
  showPairingWindow();
});

app.whenReady().then(async () => {
  app.dock?.hide();
  tray = new Tray(createTrayIcon());
  tray.setToolTip(appName);

  await startServerForMenuBar();
  rebuildMenu();
  showPairingWindow();
});

app.on("window-all-closed", () => {});

app.on("before-quit", () => {
  if (serverDetails) {
    serverDetails.server.close();
  }
});

async function startServerForMenuBar() {
  try {
    serverDetails = await startRemoteServer({
      port: defaultPort,
      token: remoteToken
    });
  } catch (error) {
    if (error.code === "EADDRINUSE" && !process.env.PORT) {
      serverDetails = await startRemoteServer({
        port: fallbackPort,
        token: remoteToken
      });
      return;
    }

    showStartupError(error);
  }
}

async function restartServer() {
  if (serverDetails) {
    await serverDetails.close();
  }

  remoteToken = process.env.REMOTE_TOKEN || createRemoteToken();
  await startServerForMenuBar();
  rebuildMenu();

  if (pairingWindow) {
    await renderPairingWindow();
  }
}

function rebuildMenu() {
  const pairingUrl = getPairingUrl();
  const remoteIsReady = Boolean(serverDetails);

  const menu = Menu.buildFromTemplate([
    {
      label: remoteIsReady ? "Show Pairing QR" : "Remote Not Running",
      enabled: remoteIsReady,
      click: () => showPairingWindow()
    },
    {
      label: "Copy Pairing URL",
      enabled: remoteIsReady,
      click: () => clipboard.writeText(pairingUrl)
    },
    {
      label: "Open Remote on This Mac",
      enabled: remoteIsReady,
      click: () => shell.openExternal(getLocalBrowserUrl())
    },
    { type: "separator" },
    {
      label: `Server: ${remoteIsReady ? `:${serverDetails.port}` : "Stopped"}`,
      enabled: false
    },
    {
      label: "Restart Server",
      enabled: remoteIsReady,
      click: () => {
        restartServer().catch(showStartupError);
      }
    },
    {
      label: "Accessibility Settings",
      click: () =>
        shell.openExternal("x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility")
    },
    { type: "separator" },
    {
      label: "Quit",
      accelerator: "Command+Q",
      click: () => app.quit()
    }
  ]);

  tray.setContextMenu(menu);
}

async function showPairingWindow() {
  if (!serverDetails) {
    return;
  }

  if (!pairingWindow) {
    pairingWindow = new BrowserWindow({
      width: 430,
      height: 680,
      minWidth: 380,
      minHeight: 560,
      resizable: true,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      title: "Pair Mac Remote",
      skipTaskbar: true,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true
      }
    });

    pairingWindow.on("closed", () => {
      pairingWindow = null;
    });
  }

  await renderPairingWindow();
  pairingWindow.show();
  pairingWindow.focus();
}

async function renderPairingWindow() {
  if (!pairingWindow || !serverDetails) {
    return;
  }

  const pairingUrl = getPairingUrl();
  const qrSvg = await QRCode.toString(pairingUrl, {
    type: "svg",
    margin: 1,
    width: 248,
    color: {
      dark: "#111111",
      light: "#ffffff"
    }
  });
  const html = buildPairingHtml(pairingUrl, qrSvg, serverDetails.urls);

  await pairingWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
}

function buildPairingHtml(pairingUrl, qrSvg, urls) {
  const alternateUrls = urls
    .filter((url) => url !== pairingUrl)
    .map((url) => `<li>${escapeHtml(url)}</li>`)
    .join("");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Pair Mac Remote</title>
    <style>
      :root {
        color-scheme: light;
        --bg: #f4f5f7;
        --ink: #151515;
        --muted: #666970;
        --line: #d9dce1;
        --green: #17b890;
      }

      * {
        box-sizing: border-box;
      }

      body {
        min-height: 100vh;
        margin: 0;
        background: var(--bg);
        color: var(--ink);
        font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        letter-spacing: 0;
        overflow-y: auto;
      }

      main {
        display: flex;
        justify-content: center;
        min-height: 100vh;
        padding: 28px;
      }

      section {
        width: 100%;
        max-width: 360px;
      }

      h1 {
        margin: 0 0 8px;
        font-size: 1.7rem;
        line-height: 1.1;
      }

      p {
        margin: 0;
        color: var(--muted);
        line-height: 1.45;
      }

      .qr {
        display: grid;
        width: 280px;
        height: 280px;
        margin: 22px auto;
        place-items: center;
        border: 1px solid var(--line);
        border-radius: 8px;
        background: #ffffff;
      }

      .url {
        display: block;
        overflow-wrap: anywhere;
        padding: 12px;
        border: 1px solid var(--line);
        border-radius: 8px;
        background: #ffffff;
        color: var(--ink);
        font: 0.82rem ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
        line-height: 1.4;
      }

      details {
        margin-top: 14px;
        padding-bottom: 4px;
        color: var(--muted);
        font-size: 0.85rem;
      }

      summary {
        cursor: default;
      }

      ul {
        margin: 8px 0 0;
        padding-left: 18px;
      }

      li {
        overflow-wrap: anywhere;
        margin: 5px 0;
        font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      }

      .ready {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        margin-top: 12px;
        color: var(--muted);
        font-size: 0.9rem;
      }

      .ready::before {
        width: 9px;
        height: 9px;
        border-radius: 999px;
        background: var(--green);
        content: "";
      }
    </style>
  </head>
  <body>
    <main>
      <section>
        <h1>Scan to pair</h1>
        <p>Open the camera on your phone while it is on the same network as this Mac.</p>
        <div class="qr" aria-label="Pairing QR code">${qrSvg}</div>
        <code class="url">${escapeHtml(pairingUrl)}</code>
        <div class="ready">Remote server is running</div>
        ${
          alternateUrls
            ? `<details><summary>Other local URLs</summary><ul>${alternateUrls}</ul></details>`
            : ""
        }
      </section>
    </main>
  </body>
</html>`;
}

function getPairingUrl() {
  return choosePairingUrl(serverDetails?.urls ?? []);
}

function getLocalBrowserUrl() {
  return serverDetails?.urls.find((url) => url.includes("localhost")) ?? getPairingUrl();
}

function choosePairingUrl(urls) {
  return (
    urls.find((url) => isPreferredPrivateLanUrl(url) && !isTailscaleUrl(url)) ??
    urls.find((url) => url.includes(".local:")) ??
    urls.find((url) => !url.includes("localhost")) ??
    urls[0] ??
    ""
  );
}

function isPreferredPrivateLanUrl(url) {
  const parts = getIpv4Parts(url);

  if (!parts) {
    return false;
  }

  const [first, second] = parts;
  return first === 10 || (first === 172 && second >= 16 && second <= 31) || (first === 192 && second === 168);
}

function isTailscaleUrl(url) {
  const parts = getIpv4Parts(url);

  if (!parts) {
    return false;
  }

  const [first, second] = parts;
  return first === 100 && second >= 64 && second <= 127;
}

function getIpv4Parts(url) {
  try {
    const hostname = new URL(url).hostname;
    const parts = hostname.split(".").map((part) => Number.parseInt(part, 10));

    if (parts.length !== 4 || parts.some((part) => Number.isNaN(part) || part < 0 || part > 255)) {
      return null;
    }

    return parts;
  } catch {
    return null;
  }
}

function createTrayIcon() {
  const trayIcon = nativeImage.createEmpty();
  trayIcon.addRepresentation({
    dataURL: `data:image/png;base64,${trayIconPng1x}`,
    scaleFactor: 1
  });
  trayIcon.addRepresentation({
    dataURL: `data:image/png;base64,${trayIconPng2x}`,
    scaleFactor: 2
  });
  trayIcon.setTemplateImage(true);
  return trayIcon;
}

function showStartupError(error) {
  dialog.showErrorBox(
    `${appName} could not start`,
    `${error.message}\n\nTry quitting any process already using port ${defaultPort}, or start the app with a different PORT value.`
  );
  app.quit();
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
