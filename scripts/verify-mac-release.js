import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";

function fail(message) {
  console.error(`Release verification failed: ${message}`);
  process.exit(1);
}

function run(command, args) {
  try {
    const output = execFileSync(command, args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"]
    });

    return output.trim();
  } catch (error) {
    const stderr = error.stderr?.toString().trim();
    const stdout = error.stdout?.toString().trim();
    fail([`${command} ${args.join(" ")}`, stderr, stdout].filter(Boolean).join("\n"));
  }
}

function findArtifacts() {
  if (!fs.existsSync("dist")) {
    return [];
  }

  return fs
    .readdirSync("dist")
    .filter((file) => file.endsWith(".dmg") || file.endsWith(".zip"))
    .map((file) => path.join("dist", file));
}

function verifyArtifact(artifact) {
  console.log(`Verifying ${artifact}`);

  if (artifact.endsWith(".dmg")) {
    run("xcrun", ["stapler", "validate", artifact]);
    run("spctl", ["--assess", "--type", "open", "--context", "context:primary-signature", "--verbose=4", artifact]);
    return;
  }

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "media-remote-control-release-"));

  try {
    run("ditto", ["-x", "-k", artifact, tempDir]);
    const appPath = findFirstApp(tempDir);

    if (!appPath) {
      fail(`No .app bundle was found inside ${artifact}.`);
    }

    run("xcrun", ["stapler", "validate", appPath]);
    run("spctl", ["--assess", "--type", "execute", "--verbose=4", appPath]);
  } finally {
    fs.rmSync(tempDir, { force: true, recursive: true });
  }
}

function findFirstApp(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);

    if (entry.isDirectory() && entry.name.endsWith(".app")) {
      return entryPath;
    }

    if (entry.isDirectory()) {
      const nestedApp = findFirstApp(entryPath);

      if (nestedApp) {
        return nestedApp;
      }
    }
  }

  return null;
}

if (process.platform !== "darwin") {
  fail("macOS release verification must run on macOS.");
}

const artifacts = findArtifacts();

if (artifacts.length === 0) {
  fail("No DMG or ZIP artifacts were found in dist/.");
}

for (const artifact of artifacts) {
  verifyArtifact(artifact);
}

console.log("Release artifacts passed stapler and Gatekeeper checks.");
