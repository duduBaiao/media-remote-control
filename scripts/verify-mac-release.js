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

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    fail(`Could not read ${filePath}: ${error.message}`);
  }
}

function getReleaseInfo() {
  const packageJson = readJson("package.json");
  const version = String(packageJson.version || "").trim();
  const productName = String(packageJson.build?.productName || packageJson.productName || packageJson.name || "").trim();

  if (!version) {
    fail("package.json does not contain a valid version.");
  }

  if (!productName) {
    fail("package.json does not contain a valid product name.");
  }

  return {
    version,
    productName,
    artifactPrefix: `${productName}-${version}-`
  };
}

function findArtifacts(artifactPrefix) {
  if (!fs.existsSync("dist")) {
    return [];
  }

  return fs
    .readdirSync("dist")
    .filter((file) => file.startsWith(artifactPrefix) && (file.endsWith(".dmg") || file.endsWith(".zip")))
    .map((file) => path.join("dist", file));
}

function findBuiltApps(productName) {
  if (!fs.existsSync("dist")) {
    return [];
  }

  const preferredDirectories = ["mac-universal", "mac"];
  const preferredApps = preferredDirectories
    .map((directory) => path.join("dist", directory, `${productName}.app`))
    .filter((appPath) => fs.existsSync(appPath));

  if (preferredApps.length > 0) {
    return preferredApps;
  }

  return fs
    .readdirSync("dist", { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith("mac"))
    .map((entry) => path.join("dist", entry.name, `${productName}.app`))
    .filter((appPath) => fs.existsSync(appPath));
}

function verifyApp(appPath) {
  console.log(`Verifying ${appPath}`);
  run("xcrun", ["stapler", "validate", appPath]);
  run("spctl", ["--assess", "--type", "execute", "--verbose=4", appPath]);
}

function verifyArtifact(artifact) {
  console.log(`Verifying ${artifact}`);

  if (artifact.endsWith(".dmg")) {
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

const releaseInfo = getReleaseInfo();
const appBundles = findBuiltApps(releaseInfo.productName);
const artifacts = findArtifacts(releaseInfo.artifactPrefix);

if (appBundles.length === 0) {
  fail(`No built ${releaseInfo.productName}.app bundle was found in dist/mac*/.`);
}

if (artifacts.length === 0) {
  fail(`No DMG or ZIP artifacts for ${releaseInfo.productName} ${releaseInfo.version} were found in dist/.`);
}

for (const appBundle of appBundles) {
  verifyApp(appBundle);
}

for (const artifact of artifacts) {
  verifyArtifact(artifact);
}

console.log("Release artifacts passed stapler and Gatekeeper checks.");
