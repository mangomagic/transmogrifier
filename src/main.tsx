import React from "react";
import ReactDOM from "react-dom/client";
import { error as logError } from "@tauri-apps/plugin-log";
import App from "./App";

// Crash-safe logging: uncaught frontend errors land in the app log file
// alongside the Rust-side job logs.
window.addEventListener("error", (e) => {
  logError(`uncaught error: ${e.message} (${e.filename}:${e.lineno})`).catch(() => {});
});
window.addEventListener("unhandledrejection", (e) => {
  logError(`unhandled rejection: ${String(e.reason)}`).catch(() => {});
});

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
