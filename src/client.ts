import Webamp from "webamp";
import butterchurnPresets from "butterchurn-presets/all";

const STORAGE_KEY = "webamp-obs-state-v4";
const RELOAD_GUARD_KEY = "webamp-obs-reload-guard";

declare global {
  interface Window {
    butterchurn?: {
      createVisualizer: (
        context: AudioContext,
        canvas: HTMLCanvasElement,
        opts: Record<string, unknown>
      ) => unknown;
    };
  }
}

/* ── Cap devicePixelRatio at 2 to avoid massive mobile framebuffers ──────────── */
const originalDPR = window.devicePixelRatio;
Object.defineProperty(window, "devicePixelRatio", {
  get() {
    return Math.min(originalDPR, 2);
  },
  configurable: true,
});

/* ── Default window layout (first-time visitors) ──────────────────────────── */
const DEFAULT_POS = { x: 20, y: 20 };
const DEFAULT_LAYOUT: Record<string, { position: { x: number; y: number } }> = {
  main: {
    position: DEFAULT_POS,
  },
  equalizer: {
    position: { x: DEFAULT_POS.x, y: DEFAULT_POS.y + 116 },
  },
  playlist: {
    position: { x: DEFAULT_POS.x, y: DEFAULT_POS.y + 116 },
  },
  milkdrop: {
    position: { x: DEFAULT_POS.x + 275, y: DEFAULT_POS.y },
  },
};

/* ── Milkdrop presets (butterchurn 3 / presets 3.x — init_eqs_eel format) ── */
function getPresets(): { name: string; butterchurnPresetObject: unknown }[] {
  return Object.entries(butterchurnPresets as Record<string, unknown>).map(
    ([name, preset]) => ({
      name,
      butterchurnPresetObject: preset,
    })
  );
}

function resolveButterchurnGlobal(): Window["butterchurn"] | null {
  const bc = window.butterchurn;
  if (!bc) return null;
  if (typeof bc.createVisualizer === "function") return bc;
  const nested = (bc as { default?: Window["butterchurn"] }).default;
  if (nested && typeof nested.createVisualizer === "function") return nested;
  return null;
}

function isButterchurnReady(): boolean {
  return resolveButterchurnGlobal() != null;
}

function importButterchurn() {
  const api = resolveButterchurnGlobal();
  if (!api) {
    return Promise.reject(
      new Error(
        "window.butterchurn is missing. Ensure /butterchurn-vendor.js loads before client.js."
      )
    );
  }
  return Promise.resolve({ default: api });
}

function shouldRecoverFromError(message: string): boolean {
  return (
    message.includes("createVisualizer") ||
    message.includes("reading 'size'") ||
    message.includes("Unexpected token") ||
    message.includes("init_eqs")
  );
}

function clearSavedLayout() {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem("webamp-obs-state-v3");
  localStorage.removeItem("webamp-obs-windows-v2");
}

function installRuntimeRecovery() {
  const recover = (message: string) => {
    if (!shouldRecoverFromError(message)) return;
    if (sessionStorage.getItem(RELOAD_GUARD_KEY)) {
      console.error("webamp-obs: recovery already attempted", message);
      return;
    }
    sessionStorage.setItem(RELOAD_GUARD_KEY, "1");
    clearSavedLayout();
    location.reload();
  };

  window.addEventListener("error", (e) => recover(e.message ?? ""));
  window.addEventListener("unhandledrejection", (e) => {
    const msg = e.reason instanceof Error ? e.reason.message : String(e.reason);
    recover(msg);
  });
}

installRuntimeRecovery();

/* ── State helpers ─────────────────────────────────────────────────────────── */
interface SavedWindowsState {
  genWindows: Record<string, { open?: boolean; [key: string]: unknown }>;
  focused?: string;
  positionsAreRelative?: boolean;
}

interface PersistedState {
  version: number;
  windows: SavedWindowsState;
}

function normalizeWindowsState(windows: SavedWindowsState): SavedWindowsState {
  const genWindows = { ...windows.genWindows };
  if (genWindows.main && genWindows.main.open === false) {
    genWindows.main = { ...genWindows.main, open: true };
  }
  const anyOpen = Object.values(genWindows).some((w) => w?.open !== false);
  if (!anyOpen && genWindows.main) {
    genWindows.main = { ...genWindows.main, open: true };
  }
  return { ...windows, genWindows };
}

function loadSavedState(): PersistedState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const windows: SavedWindowsState | null =
      parsed?.windows?.genWindows != null
        ? parsed.windows
        : parsed?.genWindows != null
          ? parsed
          : null;
    if (!windows?.genWindows?.main) return null;
    return {
      version: parsed.version ?? 1,
      windows: normalizeWindowsState(windows),
    };
  } catch {
    return null;
  }
}

function resetMountPoint() {
  const app = document.getElementById("webamp-app");
  if (app) app.replaceChildren();
  document.getElementById("webamp")?.remove();
}

function showFallbackMessage() {
  resetMountPoint();
  const el = document.getElementById("webamp-app");
  if (el) {
    el.textContent =
      "Layout reset — reloading player. Refresh again if windows are missing.";
  }
}

/* ── Main init ─────────────────────────────────────────────────────────────── */
async function init(options: { ignoreSaved?: boolean } = {}) {
  if (!isButterchurnReady()) {
    throw new Error("Butterchurn vendor script not loaded");
  }

  const [tracksRes, skinsRes] = await Promise.all([
    fetch("/api/tracks"),
    fetch("/api/skins"),
  ]);

  const tracks = (await tracksRes.json()) as any[];
  const skins = (await skinsRes.json()) as any[];

  if (tracks.length === 0) {
    console.warn("Keine Tracks in ./music/ gefunden!");
  }

  const saved = options.ignoreSaved ? null : loadSavedState();
  const butterchurnOk = isButterchurnReady();

  const webampOptions: any = {
    initialTracks: tracks,
    ...(skins.length > 0 && { initialSkin: { url: skins[0].url } }),
    availableSkins: skins,
    enableHotkeys: true,
    enableMediaSession: true,
    zIndex: 1,
    __initialWindowLayout: saved ? {} : DEFAULT_LAYOUT,
  };

  let milkdropOpen = saved
    ? saved.windows.genWindows["milkdrop"]?.open
    : true;
  if (!butterchurnOk) {
    milkdropOpen = false;
    console.warn("Milkdrop disabled: butterchurn not available");
  }

  webampOptions.__butterchurnOptions = {
    importButterchurn,
    getPresets,
    butterchurnOpen: milkdropOpen == null ? true : milkdropOpen,
  };

  resetMountPoint();
  const webamp = new Webamp(webampOptions);

  // Restore via Webamp API — avoids redux merge() crash from __initialState
  if (saved) {
    (webamp as any).__loadSerializedState({
      version: 1,
      windows: saved.windows,
    });
  }

  await webamp.renderWhenReady(document.getElementById("webamp-app")!);

  sessionStorage.removeItem(RELOAD_GUARD_KEY);

  try {
    const store = (webamp as any).store;
    const state = store.getState();
    if (state.milkdrop.randomize) {
      store.dispatch({ type: "TOGGLE_RANDOMIZE_PRESETS" });
    }
    if (state.milkdrop.cycling) {
      store.dispatch({ type: "TOGGLE_PRESET_CYCLING" });
    }
  } catch {
    // ignore
  }

  let lastSaved = "";
  const saveState = () => {
    try {
      const serialized = (webamp as any).__getSerializedState();
      const payload: PersistedState = {
        version: 1,
        windows: serialized.windows,
      };
      const json = JSON.stringify(payload);
      if (json !== lastSaved) {
        localStorage.setItem(STORAGE_KEY, json);
        lastSaved = json;
      }
    } catch {
      // ignore
    }
  };

  setInterval(saveState, 2000);
  window.addEventListener("beforeunload", saveState);
  window.addEventListener("pagehide", saveState);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") saveState();
  });

  document.body.addEventListener("dragover", (e) => e.preventDefault());
}

async function initWithFallback() {
  try {
    await init();
  } catch (err) {
    console.error("webamp-obs init failed, clearing saved layout:", err);
    clearSavedLayout();
    showFallbackMessage();
    await init({ ignoreSaved: true });
  }
}

initWithFallback().catch(console.error);
