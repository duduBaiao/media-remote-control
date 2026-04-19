# Mac Remote Control

A tiny local remote for controlling media playback on your Mac from your phone.

The Mac runs a local remote server. Your phone opens the page served by that Mac and sends token-protected commands back over the local network.

## Install

```sh
npm install
```

## Start the Menu Bar App

```sh
npm run app
```

This starts **Mac Remote** as a menu bar app, launches the local remote server, and opens a pairing window with a QR code.

Scan the QR code with your phone camera. The phone and Mac need to be on the same network.

The menu bar icon also has:

- **Show Pairing QR**
- **Copy Pairing URL**
- **Open Remote on This Mac**
- **Restart Server**
- **Accessibility Settings**

## Package the Mac App

For local testing:

```sh
npm run package:mac
```

The local app is written to `dist/`. Open the generated **Mac Remote.app** from there. This build uses ad-hoc signing, so it is for your Mac only.

## Build for Distribution

You can distribute **Mac Remote** outside the Apple App Store by using Developer ID signing and Apple notarization.

You need:

- Apple Developer Program membership
- A **Developer ID Application** certificate installed in Keychain Access
- Apple notarization credentials
- A macOS machine to run the build

Create a local `.env` file for release credentials:

```sh
cp .env.template .env
```

Edit `.env` with the signing and notarization values you want to use. The `.env` file is ignored by Git, while `.env.template` stays in the repository as the example.

The release command builds a universal DMG and ZIP for Apple Silicon and Intel Macs:

```sh
npm run dist:mac
```

The release command loads `.env`, fails before building if it cannot find release signing or notarization credentials, and checks the finished artifacts with `stapler` and Gatekeeper. Environment variables already set in your shell take priority over values in `.env`.

### Notarization Credentials

Use one of these credential modes.

App-specific password:

```text
APPLE_ID="you@example.com"
APPLE_APP_SPECIFIC_PASSWORD="xxxx-xxxx-xxxx-xxxx"
APPLE_TEAM_ID="YOURTEAMID"
```

App Store Connect API key:

```text
APPLE_API_KEY="/absolute/path/AuthKey_XXXXXXXXXX.p8"
APPLE_API_KEY_ID="XXXXXXXXXX"
APPLE_API_ISSUER="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

Keychain profile:

```sh
xcrun notarytool store-credentials "mac-remote-notary"
```

```text
APPLE_KEYCHAIN_PROFILE="mac-remote-notary"
```

If you have multiple Developer ID certificates, pick one explicitly:

```text
CSC_NAME="Your Name or Company (TEAMID)"
```

Use the certificate name without the `Developer ID Application: ` prefix. Electron Builder adds the certificate type itself.

For CI, you can provide the signing certificate with `CSC_LINK` and `CSC_KEY_PASSWORD` instead of using a local Keychain certificate.

Release artifacts are written to `dist/`, for example:

```text
dist/Mac Remote-0.1.0-universal.dmg
dist/Mac Remote-0.1.0-universal.zip
```

Share the DMG with users. They can install it by opening the DMG and dragging **Mac Remote** to Applications.

Before a broad release, test the DMG on a second Mac by downloading it the same way a user would, launching it from Applications, granting Accessibility permission, and scanning the pairing QR code from a phone on the same network.

## CLI Server

```sh
npm start
```

This runs the same remote server without the menu bar wrapper. Open one of the printed URLs on your phone. The URL includes a short token, for example:

```text
http://192.168.1.23:3000/?token=...
```

The Mac and phone need to be on the same network.

## Controls

- **Play / Pause** sends Space.
- **Back** sends Left Arrow.
- **Forward** sends Right Arrow.
- Hold **Back** or **Forward** to send repeated key presses.

The media app you want to control should be focused on the Mac.

## macOS Permission

The first time a command runs, macOS may block the key press.

If you use the menu bar app, grant Accessibility permission to **Mac Remote**.

If you use `npm start`, grant Accessibility permission to the terminal app that started the server.

1. Open **System Settings**.
2. Go to **Privacy & Security**.
3. Open **Accessibility**.
4. Enable **Mac Remote** or your terminal app, such as Terminal, iTerm, or Ghostty.
5. Restart the app or server.

## Configuration

```sh
PORT=8080 npm run app
```

```sh
REMOTE_TOKEN=my-secret-token npm run app
```

```sh
REMOTE_DRY_RUN=1 npm start
```

The same environment variables also work with `npm start`. Dry-run mode logs commands without sending key presses, which is useful for testing the web app.

## Current Shape

```text
Phone browser
  -> local HTTP request
  -> Mac menu bar app / Node server
  -> osascript / System Events
  -> focused Mac app
```

Next good upgrades:

- Add app-specific control for YouTube, VLC, Spotify, or Music.
- Add visible playback state when an app integration supports it.
