import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

function fail(message) {
    console.error(`GitHub release failed: ${message}`);
    process.exit(1);
}

function readJson(filePath) {
    try {
        return JSON.parse(fs.readFileSync(filePath, "utf8"));
    } catch (error) {
        fail(`Could not read ${filePath}: ${error.message}`);
    }
}

function commandExists(command) {
    const result = spawnSync(command, ["--version"], {
        stdio: "ignore",
        shell: process.platform === "win32"
    });

    return result.status === 0;
}

function run(command, args, options = {}) {
    const { captureOutput = false } = options;

    try {
        const output = execFileSync(command, args, {
            encoding: "utf8",
            stdio: captureOutput ? ["ignore", "pipe", "pipe"] : "inherit"
        });

        return typeof output === "string" ? output.trim() : "";
    } catch (error) {
        const stderr = error.stderr?.toString().trim();
        const stdout = error.stdout?.toString().trim();
        const detail = [stderr, stdout].filter(Boolean).join("\n");
        fail([`${command} ${args.join(" ")}`, detail].filter(Boolean).join("\n"));
    }
}

function ensureGitRepository() {
    run("git", ["rev-parse", "--show-toplevel"], { captureOutput: true });
}

function ensureCommand(command, installHint) {
    if (!commandExists(command)) {
        fail(`${command} is required. ${installHint}`);
    }
}

function ensureCleanWorktree() {
    const status = run("git", ["status", "--porcelain"], { captureOutput: true });

    if (status) {
        fail("Commit or stash your local changes before creating a release.");
    }
}

function ensureOriginRemote() {
    const remoteUrl = run("git", ["remote", "get-url", "origin"], { captureOutput: true });

    if (!remoteUrl) {
        fail("The git remote 'origin' is not configured.");
    }
}

function ensureGitHubAuth() {
    run("gh", ["auth", "status"]);
}

function ensureNoExistingTag(tagName) {
    const localTag = spawnSync("git", ["rev-parse", "-q", "--verify", `refs/tags/${tagName}`], {
        stdio: "ignore"
    });

    if (localTag.status === 0) {
        fail(`Tag ${tagName} already exists locally.`);
    }

    const remoteTag = run("git", ["ls-remote", "--tags", "origin", tagName], { captureOutput: true });

    if (remoteTag) {
        fail(`Tag ${tagName} already exists on origin.`);
    }
}

function ensureNoExistingRelease(tagName) {
    const result = spawnSync("gh", ["release", "view", tagName], {
        stdio: "ignore"
    });

    if (result.status === 0) {
        fail(`A GitHub release for ${tagName} already exists.`);
    }
}

function pushCurrentBranch() {
    const branchName = run("git", ["rev-parse", "--abbrev-ref", "HEAD"], { captureOutput: true });

    if (!branchName || branchName === "HEAD") {
        fail("Release automation requires a checked out branch, not a detached HEAD.");
    }

    run("git", ["push", "origin", branchName]);
}

function createTag(tagName) {
    run("git", ["tag", "-a", tagName, "-m", `Release ${tagName}`]);
}

function pushTag(tagName) {
    run("git", ["push", "origin", tagName]);
}

function buildRelease() {
    run("npm", ["run", "dist:mac"]);
}

function findArtifacts(version) {
    const distDir = path.join(process.cwd(), "dist");

    if (!fs.existsSync(distDir)) {
        fail("dist/ was not created by the build.");
    }

    const versionToken = `-${version}-`;

    return fs
        .readdirSync(distDir)
        .filter((file) => file.includes(versionToken) && (file.endsWith(".dmg") || file.endsWith(".zip")))
        .sort()
        .map((file) => path.join("dist", file));
}

function ensureArtifacts(artifacts, version) {
    if (artifacts.length === 0) {
        fail(`No DMG or ZIP artifacts for version ${version} were found in dist/.`);
    }
}

function createGitHubRelease(tagName, artifacts) {
    run("gh", [
        "release",
        "create",
        tagName,
        ...artifacts,
        "--title",
        tagName,
        "--verify-tag",
        "--generate-notes"
    ]);
}

function main() {
    ensureGitRepository();
    ensureCommand("npm", "Install Node.js and npm before running this script.");
    ensureCommand("gh", "Install GitHub CLI and run 'gh auth login'.");
    ensureOriginRemote();
    ensureCleanWorktree();
    ensureGitHubAuth();

    const packageJson = readJson(path.join(process.cwd(), "package.json"));
    const version = String(packageJson.version || "").trim();

    if (!version) {
        fail("package.json does not contain a valid version.");
    }

    const tagName = `v${version}`;

    ensureNoExistingTag(tagName);
    ensureNoExistingRelease(tagName);

    console.log(`Building release for ${tagName}`);
    buildRelease();

    const artifacts = findArtifacts(version);
    ensureArtifacts(artifacts, version);

    console.log(`Pushing branch and tag ${tagName}`);
    pushCurrentBranch();
    createTag(tagName);
    pushTag(tagName);

    console.log(`Publishing GitHub release ${tagName}`);
    createGitHubRelease(tagName, artifacts);

    console.log("GitHub release published successfully.");
}

main();