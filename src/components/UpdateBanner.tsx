import { useEffect, useState } from "react";
import { check } from "@tauri-apps/plugin-updater";
import type { Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { S } from "../lib/strings";

/// Checks for an update once on startup. Silent unless one is available;
/// install is user-initiated. Errors (offline, no endpoint yet) are ignored.
export function UpdateBanner() {
  const [update, setUpdate] = useState<Update | null>(null);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    check()
      .then((u) => {
        if (u) setUpdate(u);
      })
      .catch(() => {
        // no release endpoint yet, offline, or check failed — stay silent
      });
  }, []);

  if (!update) return null;

  const install = async () => {
    setInstalling(true);
    try {
      await update.downloadAndInstall();
      await relaunch();
    } catch {
      setInstalling(false);
    }
  };

  return (
    <div className="flex items-center gap-3 px-4 py-1.5 bg-blue-600 text-white text-sm">
      <span>{S.updateAvailable(update.version)}</span>
      <button
        onClick={install}
        disabled={installing}
        className="ml-auto px-3 py-0.5 bg-white/20 hover:bg-white/30 rounded disabled:opacity-60"
      >
        {installing ? S.updateInstalling : S.updateInstall}
      </button>
    </div>
  );
}