import { execFileSync } from "node:child_process";
import fs from "node:fs";
import process from "node:process";

const developerIdPrefix = "Developer ID Application";

function fail(message) {
  console.error(`Release check failed: ${message}`);
  process.exit(1);
}

function getEnv(name) {
  return process.env[name]?.trim() ?? "";
}

function hasEvery(...names) {
  return names.every((name) => getEnv(name));
}

function hasAny(...names) {
  return names.some((name) => getEnv(name));
}

function readSigningIdentities() {
  try {
    return execFileSync("security", ["find-identity", "-v", "-p", "codesigning"], {
      encoding: "utf8"
    });
  } catch (error) {
    fail(error.stderr?.toString().trim() || error.message);
  }
}

function getDeveloperIdIdentities(output) {
  return output
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.includes(`"${developerIdPrefix}:`));
}

function verifySigningIdentity() {
  if (getEnv("CSC_LINK")) {
    if (!getEnv("CSC_KEY_PASSWORD")) {
      fail("CSC_LINK is set, but CSC_KEY_PASSWORD is missing.");
    }

    console.log("Release signing credentials are present via CSC_LINK.");
    return;
  }

  const identities = getDeveloperIdIdentities(readSigningIdentities());

  if (identities.length === 0) {
    fail(
      `No "${developerIdPrefix}" certificate was found in this keychain. Install one from your Apple Developer account before running a distribution build.`
    );
  }

  const requestedName = getEnv("CSC_NAME");

  if (!requestedName) {
    console.log(`Found ${identities.length} Developer ID Application signing identity.`);
    return;
  }

  const matchingIdentities = identities.filter((line) => line.includes(requestedName));

  if (matchingIdentities.length === 0) {
    fail(`CSC_NAME="${requestedName}" did not match any Developer ID Application certificate.`);
  }

  if (matchingIdentities.length > 1) {
    fail(
      `CSC_NAME="${requestedName}" matched multiple Developer ID Application certificates. Use a more specific identity or clean up duplicate certificates.`
    );
  }

  console.log(`Using Developer ID Application identity matching CSC_NAME="${requestedName}".`);
}

function verifyNotarizationCredentials() {
  const hasAppSpecificPassword = hasAny("APPLE_ID", "APPLE_APP_SPECIFIC_PASSWORD", "APPLE_TEAM_ID");
  const hasApiKey = hasAny("APPLE_API_KEY", "APPLE_API_KEY_ID", "APPLE_API_ISSUER");
  const hasKeychainProfile = hasAny("APPLE_KEYCHAIN_PROFILE");

  if (hasAppSpecificPassword && !hasEvery("APPLE_ID", "APPLE_APP_SPECIFIC_PASSWORD", "APPLE_TEAM_ID")) {
    fail("Set APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, and APPLE_TEAM_ID together.");
  }

  if (hasApiKey && !hasEvery("APPLE_API_KEY", "APPLE_API_KEY_ID", "APPLE_API_ISSUER")) {
    fail("Set APPLE_API_KEY, APPLE_API_KEY_ID, and APPLE_API_ISSUER together.");
  }

  const credentialModes = [hasAppSpecificPassword, hasApiKey, hasKeychainProfile].filter(Boolean).length;

  if (credentialModes === 0) {
    fail(
      "No notarization credentials were found. Set Apple notarization environment variables before running npm run dist:mac."
    );
  }

  if (credentialModes > 1) {
    fail("Set exactly one notarization credential mode: app-specific password, API key, or keychain profile.");
  }

  console.log("Notarization credentials are present.");
}

function verifyBuildAssets() {
  if (!fs.existsSync("build/icon.icns")) {
    fail("Missing build/icon.icns.");
  }

  if (!fs.existsSync("build/entitlements.mac.plist")) {
    fail("Missing build/entitlements.mac.plist.");
  }

  console.log("Release assets are present.");
}

if (process.platform !== "darwin") {
  fail("macOS distribution builds must run on macOS.");
}

verifyBuildAssets();
verifySigningIdentity();
verifyNotarizationCredentials();
