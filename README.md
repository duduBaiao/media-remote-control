# Mac Remote Control

A tiny local remote for controlling media playback on your Mac from your phone.

The Mac runs a Node server. Your phone opens the page served by that Mac and sends token-protected commands back over the local network.

## Start

```sh
npm start
```

Open one of the printed URLs on your phone. The URL includes a short token, for example:

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

The first time a command runs, macOS may block the key press. Grant Accessibility permission to the terminal app that started the server:

1. Open **System Settings**.
2. Go to **Privacy & Security**.
3. Open **Accessibility**.
4. Enable your terminal app, such as Terminal, iTerm, or Ghostty.
5. Restart the server.

## Configuration

```sh
PORT=8080 npm start
```

```sh
REMOTE_TOKEN=my-secret-token npm start
```

```sh
REMOTE_DRY_RUN=1 npm start
```

Dry-run mode logs commands without sending key presses. It is useful for testing the web app.

## Current Shape

This is the simple MVP path:

```text
Phone browser
  -> local HTTP request
  -> Mac Node server
  -> osascript / System Events
  -> focused Mac app
```

Next good upgrades:

- Package the Mac side as a menu bar app.
- Show a QR code for pairing.
- Add app-specific control for YouTube, VLC, Spotify, or Music.
- Add visible playback state when an app integration supports it.
