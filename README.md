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

```sh
npm run package:mac
```

The packaged app is written to `dist/`. Open the generated **Mac Remote.app** from there. Local builds use ad-hoc signing, so they do not need an Apple Developer certificate.

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
