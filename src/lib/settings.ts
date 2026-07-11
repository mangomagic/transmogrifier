import { load, Store } from "@tauri-apps/plugin-store";
import type { OutputFormat, VideoPreset } from "./presets";
import { DEFAULT_FORMAT, DEFAULT_PRESET } from "./presets";

export interface AppSettings {
  format: OutputFormat;
  preset: VideoPreset;
  outputDir: string | null;
  concurrency: number;
}

export const DEFAULT_SETTINGS: AppSettings = {
  format: DEFAULT_FORMAT,
  preset: DEFAULT_PRESET,
  outputDir: null,
  concurrency: 2,
};

const STORE_FILE = "settings.json";

let storePromise: Promise<Store> | null = null;

function getStore(): Promise<Store> {
  storePromise ??= load(STORE_FILE, {
    autoSave: true,
    defaults: { settings: DEFAULT_SETTINGS },
  });
  return storePromise;
}

export async function loadSettings(): Promise<AppSettings> {
  try {
    const store = await getStore();
    const saved = await store.get<Partial<AppSettings>>("settings");
    return { ...DEFAULT_SETTINGS, ...saved };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  try {
    const store = await getStore();
    await store.set("settings", settings);
  } catch {
    // persistence is best-effort; never block the UI on it
  }
}
