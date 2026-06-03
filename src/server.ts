import { readdir, stat } from "fs/promises";
import { extname, join, basename, relative } from "path";

const MUSIC_DIR = "./music";
const SKINS_DIR = "./skins";
const PUBLIC_DIR = "./src/public";
const PORT = 9002;

const AUDIO_EXTS = new Set([".mp3", ".ogg", ".flac", ".wav", ".aac", ".m4a"]);
const SKIN_EXTS = new Set([".wsz", ".wal"]);

/* ── Recursively scan a directory for files matching extensions ──────────── */
async function scanDir(
  dir: string,
  validExts: Set<string>,
  baseDir: string = dir
): Promise<string[]> {
  const results: string[] = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return results;
  }

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      const subResults = await scanDir(fullPath, validExts, baseDir);
      results.push(...subResults);
    } else if (entry.isFile() && validExts.has(extname(entry.name).toLowerCase())) {
      // Store the relative path from baseDir so nested folders work in URLs
      results.push(relative(baseDir, fullPath));
    }
  }

  return results;
}

async function serveFile(filePath: string): Promise<Response> {
  try {
    const file = Bun.file(filePath);
    const exists = await file.exists();
    if (!exists) return new Response("Not found", { status: 404 });
    return new Response(file, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "no-cache",
      },
    });
  } catch {
    return new Response("Error", { status: 500 });
  }
}

async function servePublicFile(path: string): Promise<Response> {
  const safePath = path.replace(/^\/+/, "").replace(/\.{2,}/g, "");
  const filePath = join(PUBLIC_DIR, safePath);
  // Prevent directory traversal
  const resolvedPublic = await stat(PUBLIC_DIR).then(() => join(PUBLIC_DIR));
  if (!filePath.startsWith(resolvedPublic)) {
    return new Response("Not found", { status: 404 });
  }
  return serveFile(filePath);
}

/* ── Apply performance patches to node_modules ───────────────────────────── */
console.log("Applying node_modules patches...");
const patchProc = Bun.spawn(["bun", "run", "src/scripts/apply-patches.ts"], {
  stdout: "inherit",
  stderr: "inherit",
});
await patchProc.exited;
if (patchProc.exitCode !== 0) {
  console.warn("Patch script had errors (continuing anyway)");
}

/* ── Build the client bundle on startup ───────────────────────────────────── */
console.log("Building client bundle...");
const [vendorBuild, clientBuild] = await Promise.all([
  Bun.build({
    entrypoints: ["./src/butterchurn-vendor.ts"],
    outfile: "./src/public/butterchurn-vendor.js",
    target: "browser",
    format: "iife",
  }),
  Bun.build({
    entrypoints: ["./src/client.ts"],
    outdir: "./src/public",
    target: "browser",
    format: "esm",
    external: ["butterchurn"],
    naming: "client.[ext]",
  }),
]);

if (!vendorBuild.success || !clientBuild.success) {
  console.error("Build failed:");
  for (const log of [...vendorBuild.logs, ...clientBuild.logs]) {
    console.error(log);
  }
  process.exit(1);
}

console.log(
  `Bundles built → ${vendorBuild.outputs[0].path}, ${clientBuild.outputs[0].path}`
);

/* ── Log resolved directories for debugging ───────────────────────────────── */
console.log(`Music dir:  ${join(process.cwd(), MUSIC_DIR)}`);
console.log(`Skins dir:  ${join(process.cwd(), SKINS_DIR)}`);
console.log(`Public dir: ${join(process.cwd(), PUBLIC_DIR)}`);

/* ── Start server ───────────────────────────────────────────────────────── */
const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    const path = url.pathname;

    // CORS preflight
    if (req.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET",
        },
      });
    }

    // API: list tracks
    if (path === "/api/tracks") {
      const files = await scanDir(MUSIC_DIR, AUDIO_EXTS);
      const tracks = files.map((f) => ({
        url: `/music/${encodeURIComponent(f)}`,
        metaData: {
          title: basename(f, extname(f)),
          artist: "",
        },
      }));
      return Response.json(tracks, {
        headers: { "Access-Control-Allow-Origin": "*" },
      });
    }

    // API: list skins
    if (path === "/api/skins") {
      const files = await scanDir(SKINS_DIR, SKIN_EXTS);
      const skins = files.map((f) => ({
        url: `/skins/${encodeURIComponent(f)}`,
        name: basename(f, extname(f)),
      }));
      return Response.json(skins, {
        headers: { "Access-Control-Allow-Origin": "*" },
      });
    }

    // Serve music files
    if (path.startsWith("/music/")) {
      const filename = decodeURIComponent(path.replace("/music/", ""));
      return serveFile(join(MUSIC_DIR, filename));
    }

    // Serve skin files
    if (path.startsWith("/skins/")) {
      const filename = decodeURIComponent(path.replace("/skins/", ""));
      return serveFile(join(SKINS_DIR, filename));
    }

    // Serve static public files at root (e.g. /client.js, /index.html)
    if (path === "/" || path === "/index.html") {
      return serveFile(join(PUBLIC_DIR, "index.html"));
    }

    // Try to serve any other root path from public/
    const publicResponse = await servePublicFile(path);
    if (publicResponse.status !== 404) {
      return publicResponse;
    }

    return new Response("Not found", { status: 404 });
  },
});

console.log(`
  ╔══════════════════════════════════════╗
  ║        webamp-obs is running         ║
  ╠══════════════════════════════════════╣
  ║  Player:  http://localhost:${PORT}      ║
  ║  Music:   ./music/  (drop MP3s here) ║
  ║  Skins:   ./skins/  (drop .wsz here) ║
  ╚══════════════════════════════════════╝

  OBS Browser Source → http://localhost:${PORT}
  Width: 275  Height: 116  (nur Main Window)
`);
