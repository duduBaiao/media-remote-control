const status = document.querySelector(".status");
const statusText = document.querySelector("#status-text");
const buttons = [...document.querySelectorAll("[data-command]")];
const token = new URLSearchParams(window.location.search).get("token") || localStorage.getItem("remote-token") || "";

if (token) {
  localStorage.setItem("remote-token", token);
} else {
  setStatus("Open the URL printed by the Mac server.", "error");
}

function setStatus(message, mode = "ready") {
  status.classList.toggle("is-error", mode === "error");
  status.classList.toggle("is-busy", mode === "busy");
  statusText.textContent = message;
}

async function sendCommand(command) {
  if (!token) {
    setStatus("Missing remote token.", "error");
    return false;
  }

  setStatus("Sending...", "busy");

  try {
    const response = await fetch(`/api/command?token=${encodeURIComponent(token)}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Remote-Token": token
      },
      body: JSON.stringify({ command })
    });
    const result = await response.json();

    if (!response.ok || !result.ok) {
      throw new Error(result.error || "Command failed.");
    }

    setStatus(commandLabel(command), "ready");
    return true;
  } catch (error) {
    setStatus(error.message, "error");
    return false;
  }
}

function commandLabel(command) {
  if (command === "play-pause") {
    return "Play / pause sent";
  }

  if (command === "back") {
    return "Back sent";
  }

  if (command === "forward") {
    return "Forward sent";
  }

  if (command === "open-netflix") {
    return "Netflix ready";
  }

  return "Command sent";
}

function bindButton(button) {
  const command = button.dataset.command;
  const shouldRepeat = button.dataset.repeat === "true";
  let holdTimeout = null;
  let repeatInterval = null;
  let pointerIsDown = false;

  const clearTimers = () => {
    window.clearTimeout(holdTimeout);
    window.clearInterval(repeatInterval);
    holdTimeout = null;
    repeatInterval = null;
  };

  const release = () => {
    pointerIsDown = false;
    clearTimers();
    button.classList.remove("is-pressed");
  };

  button.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    window.getSelection()?.removeAllRanges();
    pointerIsDown = true;
    button.setPointerCapture(event.pointerId);
    button.classList.add("is-pressed");
    void sendCommand(command);

    if (shouldRepeat) {
      holdTimeout = window.setTimeout(() => {
        if (!pointerIsDown) {
          return;
        }

        repeatInterval = window.setInterval(() => {
          if (pointerIsDown) {
            void sendCommand(command);
          }
        }, 260);
      }, 420);
    }
  });

  button.addEventListener("pointerup", release);
  button.addEventListener("pointercancel", release);
  button.addEventListener("lostpointercapture", release);
}

for (const button of buttons) {
  bindButton(button);
}
