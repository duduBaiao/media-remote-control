import crypto from "node:crypto";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, "..", "public");

export function createRemoteToken() {
  return crypto.randomBytes(9).toString("base64url");
}

const commands = {
  "play-pause": {
    label: "Play / pause",
    keyCodes: [49]
  },
  back: {
    label: "Back",
    keyCodes: [123]
  },
  forward: {
    label: "Forward",
    keyCodes: [124]
  },
  "open-netflix": {
    label: "Open Netflix",
    run: openNetflixInChrome
  }
};

const mimeTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".webmanifest", "application/manifest+json; charset=utf-8"]
]);

function getDefaultPort() {
  return Number.parseInt(process.env.PORT ?? "3000", 10);
}

function getDefaultHost() {
  return process.env.HOST ?? "0.0.0.0";
}

function getClientToken(requestUrl, headers) {
  const url = new URL(requestUrl, "http://localhost");
  return headers["x-remote-token"] || url.searchParams.get("token") || "";
}

function isAuthorized(request, token) {
  return getClientToken(request.url, request.headers) === token;
}

function sendJson(response, status, payload) {
  const body = JSON.stringify(payload);
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Content-Length": Buffer.byteLength(body)
  });
  response.end(body);
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";

    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;

      if (body.length > 1024) {
        reject(new Error("Request body is too large."));
        request.destroy();
      }
    });
    request.on("end", () => {
      if (!body) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error("Request body must be valid JSON."));
      }
    });
    request.on("error", reject);
  });
}

function runAppleScript(lines) {
  return new Promise((resolve, reject) => {
    const args = lines.flatMap((line) => ["-e", line]);
    const child = spawn("osascript", args, {
      stdio: ["ignore", "pipe", "pipe"]
    });

    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve(stdout.trim());
        return;
      }

      reject(new Error(stderr.trim() || `osascript exited with code ${code}`));
    });
  });
}

function runProcess(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ["ignore", "ignore", "pipe"]
    });

    let stderr = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(stderr.trim() || `${command} exited with code ${code}`));
    });
  });
}

function createFindNetflixInChromeScript() {
  return [
    'tell application "System Events" to set chromeIsRunning to exists (process "Google Chrome")',
    "if not chromeIsRunning then",
    'return "missing"',
    "end if",
    "if chromeIsRunning then",
    'tell application "Google Chrome"',
    "repeat with browserWindow in windows",
    "set tabCount to count of tabs of browserWindow",
    "repeat with tabIndex from 1 to tabCount",
    "set tabUrl to URL of item tabIndex of tabs of browserWindow",
    'if tabUrl contains "netflix.com" then',
    "set \u00abclass acTI\u00bb of browserWindow to tabIndex",
    "try",
    "set minimized of browserWindow to false",
    "end try",
    "set index of browserWindow to 1",
    "activate",
    'return "focused"',
    "end if",
    "end repeat",
    "end repeat",
    "end tell",
    "end if",
    'return "missing"'
  ];
}

async function openNetflixInChrome() {
  const result = await runAppleScript(createFindNetflixInChromeScript());

  if (result === "focused") {
    return;
  }

  await runProcess("open", ["-a", "Google Chrome", "https://www.netflix.com/browse"]);
}

async function executeCommand(commandName, isDryRun) {
  const command = commands[commandName];

  if (!command) {
    const error = new Error(`Unknown command: ${commandName}`);
    error.status = 400;
    throw error;
  }

  if (process.platform !== "darwin" && !isDryRun) {
    const error = new Error("This remote currently supports macOS only.");
    error.status = 501;
    throw error;
  }

  if (isDryRun) {
    console.log(`[dry-run] ${commandName}`);
    return;
  }

  if (command.run) {
    await command.run();
    return;
  }

  const script = ['tell application "System Events"', ...command.keyCodes.map((keyCode) => `key code ${keyCode}`), "end tell"];

  await runAppleScript(script);
}

async function handleCommand(request, response, token, isDryRun) {
  if (!isAuthorized(request, token)) {
    sendJson(response, 401, { ok: false, error: "Invalid or missing remote token." });
    return;
  }

  let payload;

  try {
    payload = await readJsonBody(request);
  } catch (error) {
    sendJson(response, 400, { ok: false, error: error.message });
    return;
  }

  try {
    await executeCommand(payload.command, isDryRun);
    sendJson(response, 200, { ok: true, command: payload.command });
  } catch (error) {
    sendJson(response, error.status || 500, { ok: false, error: error.message });
  }
}

async function serveStatic(request, response) {
  const url = new URL(request.url, "http://localhost");
  const urlPath = decodeURIComponent(url.pathname);
  const requestedPath = urlPath === "/" ? "/index.html" : urlPath;
  const filePath = path.normalize(path.join(publicDir, requestedPath));

  if (!filePath.startsWith(publicDir + path.sep)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  try {
    const body = await fs.readFile(filePath);
    response.writeHead(200, {
      "Content-Type": mimeTypes.get(path.extname(filePath)) || "application/octet-stream",
      "Cache-Control": "no-cache",
      "Content-Length": body.length
    });
    response.end(body);
  } catch (error) {
    if (error.code === "ENOENT") {
      response.writeHead(404);
      response.end("Not found");
      return;
    }

    console.error(error);
    response.writeHead(500);
    response.end("Server error");
  }
}

export function getLocalUrls(port, token) {
  const urls = [`http://localhost:${port}/?token=${token}`];
  const interfaces = os.networkInterfaces();

  for (const entries of Object.values(interfaces)) {
    for (const entry of entries ?? []) {
      if (entry.family === "IPv4" && !entry.internal) {
        urls.push(`http://${entry.address}:${port}/?token=${token}`);
      }
    }
  }

  const hostname = os.hostname().replace(/\.local$/, "");
  urls.push(`http://${hostname}.local:${port}/?token=${token}`);

  return [...new Set(urls)];
}

export function createRemoteServer(options = {}) {
  const token = options.token ?? process.env.REMOTE_TOKEN ?? createRemoteToken();
  const isDryRun = options.isDryRun ?? process.env.REMOTE_DRY_RUN === "1";
  const server = http.createServer((request, response) => {
    if (request.method === "POST" && request.url?.startsWith("/api/command")) {
      void handleCommand(request, response, token, isDryRun);
      return;
    }

    if (request.method === "GET" || request.method === "HEAD") {
      void serveStatic(request, response);
      return;
    }

    response.writeHead(405, { Allow: "GET, HEAD, POST" });
    response.end("Method not allowed");
  });

  return {
    server,
    token,
    isDryRun
  };
}

export function startRemoteServer(options = {}) {
  const host = options.host ?? getDefaultHost();
  const port = options.port ?? getDefaultPort();
  const remote = createRemoteServer(options);

  return new Promise((resolve, reject) => {
    const onError = (error) => {
      remote.server.off("listening", onListening);
      reject(error);
    };

    const onListening = () => {
      remote.server.off("error", onError);
      const address = remote.server.address();
      const resolvedPort = typeof address === "object" && address ? address.port : port;
      const urls = getLocalUrls(resolvedPort, remote.token);

      resolve({
        ...remote,
        host,
        port: resolvedPort,
        urls,
        close: () =>
          new Promise((closeResolve, closeReject) => {
            remote.server.close((error) => {
              if (error) {
                closeReject(error);
                return;
              }

              closeResolve();
            });
          })
      });
    };

    remote.server.once("error", onError);
    remote.server.once("listening", onListening);
    remote.server.listen(port, host);
  });
}

function logStartup(details) {
  console.log(`Remote Control is running on ${details.host}:${details.port}`);
  console.log("");
  console.log("Open one of these URLs on your phone:");
  for (const url of details.urls) {
    console.log(`  ${url}`);
  }
  console.log("");
  console.log("If macOS blocks control, grant Accessibility permission to your terminal app.");
  if (details.isDryRun) {
    console.log("Dry-run mode is enabled; commands will be logged instead of executed.");
  }
}

async function runCli() {
  try {
    const details = await startRemoteServer();
    logStartup(details);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  void runCli();
}
