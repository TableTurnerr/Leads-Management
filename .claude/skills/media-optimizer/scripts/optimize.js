#!/usr/bin/env node
/**
 * media-optimizer — repo-agnostic media optimization script
 *
 * Usage:
 *   node optimize.js [options]
 *
 * Options: see SKILL.md for full flag reference.
 */

const fs = require("fs");
const path = require("path");
const { execSync, spawnSync } = require("child_process");

// ─── Arg parsing ────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const has = (flag) => args.includes(flag);
const get = (flag, def) => {
  const i = args.indexOf(flag);
  return i !== -1 && args[i + 1] ? args[i + 1] : def;
};

const MODE = {
  check: has("--check"),
  dryRun: has("--dry-run"),
  replace: has("--replace"),
  keepOriginals: !has("--replace"),
  imagesOnly: has("--images-only"),
  svgOnly: has("--svg-only"),
  noSvg: has("--no-svg"),
  noConvert: has("--no-convert"),
  quality: parseInt(get("--quality", "82"), 10),
  dir: get("--dir", process.cwd()),
  minSavings: parseInt(get("--min-savings", "10"), 10) * 1024, // bytes
};

// ─── Constants ───────────────────────────────────────────────────────────────

const EXCLUDED_DIRS = new Set([
  "node_modules",
  ".git",
  ".next",
  "dist",
  "out",
  "build",
  "coverage",
  ".cache",
  ".turbo",
  ".vercel",
]);

const FAVICON_NAMES = new Set([
  "favicon.ico",
  "favicon.png",
  "apple-touch-icon.png",
  "apple-icon.png",
  "icon.png",
  "icon.svg",
  "safari-pinned-tab.svg",
  "mstile-150x150.png",
]);

const IMAGE_EXTS = new Set([".jpg", ".jpeg", ".png", ".gif", ".avif", ".webp"]);
const SVG_EXTS = new Set([".svg"]);
const VIDEO_EXTS = new Set([".mp4", ".mov", ".avi", ".mkv", ".webm"]);
const AUDIO_EXTS = new Set([".mp3", ".wav", ".ogg", ".flac", ".aac", ".m4a"]);
const CODE_EXTS = new Set([
  ".tsx", ".ts", ".jsx", ".js", ".html", ".css", ".scss",
  ".md", ".mdx", ".json", ".xml", ".yaml", ".yml",
]);

// ─── Colour helpers ───────────────────────────────────────────────────────────

const c = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  cyan: "\x1b[36m",
  grey: "\x1b[90m",
  blue: "\x1b[34m",
};
const col = (color, str) => `${c[color]}${str}${c.reset}`;
const bold = (str) => col("bold", str);
const green = (str) => col("green", str);
const yellow = (str) => col("yellow", str);
const red = (str) => col("red", str);
const cyan = (str) => col("cyan", str);
const grey = (str) => col("grey", str);

// ─── Utilities ────────────────────────────────────────────────────────────────

function fmtBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function fmtDelta(before, after) {
  const saved = before - after;
  const pct = before > 0 ? ((saved / before) * 100).toFixed(1) : "0.0";
  const sign = saved >= 0 ? "-" : "+";
  return `${sign}${fmtBytes(Math.abs(saved))} (${sign}${Math.abs(pct)}%)`;
}

function fileSize(p) {
  try {
    return fs.statSync(p).size;
  } catch {
    return 0;
  }
}

// ─── Dependency detection ────────────────────────────────────────────────────

function detectTools() {
  const tools = {};

  // sharp
  try {
    require("sharp");
    tools.sharp = true;
  } catch {
    tools.sharp = false;
  }

  // svgo
  try {
    require("svgo");
    tools.svgo = true;
  } catch {
    // try CLI
    const r = spawnSync("svgo", ["--version"], { encoding: "utf8" });
    tools.svgo = r.status === 0;
    tools.svgoCli = tools.svgo;
  }

  // ffmpeg
  const ff = spawnSync("ffmpeg", ["-version"], { encoding: "utf8" });
  tools.ffmpeg = ff.status === 0;

  return tools;
}

// ─── File discovery ───────────────────────────────────────────────────────────

function walkDir(dir, results = []) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return results;
  }

  for (const entry of entries) {
    if (EXCLUDED_DIRS.has(entry.name) || entry.name.startsWith(".cache")) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkDir(fullPath, results);
    } else if (entry.isFile()) {
      results.push(fullPath);
    }
  }
  return results;
}

function classifyFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const base = path.basename(filePath);

  if (FAVICON_NAMES.has(base)) return "favicon";
  if (base.endsWith(".original")) return "backup";
  if (IMAGE_EXTS.has(ext)) return "image";
  if (SVG_EXTS.has(ext)) return "svg";
  if (VIDEO_EXTS.has(ext)) return "video";
  if (AUDIO_EXTS.has(ext)) return "audio";
  return null;
}

function discoverMedia(rootDir) {
  const all = walkDir(rootDir);
  const media = [];

  for (const f of all) {
    const type = classifyFile(f);
    if (!type || type === "favicon" || type === "backup") continue;

    if (MODE.svgOnly && type !== "svg") continue;
    if (MODE.imagesOnly && type !== "image" && type !== "svg") continue;
    if (MODE.noSvg && type === "svg") continue;

    media.push({ path: f, type, size: fileSize(f) });
  }

  return media;
}

// ─── Already-processed detection ─────────────────────────────────────────────

function alreadyProcessed(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  // If original backup exists, this was already converted
  if (fs.existsSync(filePath + ".original")) return true;
  // If it's a WebP and its size is <= 200KB, likely already optimal
  if (ext === ".webp" && fileSize(filePath) <= 200 * 1024) return true;
  return false;
}

// ─── SVG optimization ─────────────────────────────────────────────────────────

async function optimizeSvg(filePath, tools, dryRun) {
  const before = fileSize(filePath);

  if (dryRun) {
    return { action: "minify SVG", before, after: Math.round(before * 0.7), skipped: false };
  }

  if (tools.svgo && !tools.svgoCli) {
    // Use require('svgo')
    const { optimize } = require("svgo");
    const input = fs.readFileSync(filePath, "utf8");
    const result = optimize(input, { path: filePath });
    if (result.data && result.data.length < input.length) {
      fs.writeFileSync(filePath, result.data, "utf8");
    }
  } else if (tools.svgoCli) {
    spawnSync("svgo", [filePath, "-o", filePath], { encoding: "utf8" });
  } else {
    return { action: "skip (svgo missing)", before, after: before, skipped: true };
  }

  const after = fileSize(filePath);
  return { action: "minified SVG", before, after, skipped: false };
}

// ─── Image optimization ───────────────────────────────────────────────────────

async function optimizeImage(filePath, tools, dryRun) {
  if (!tools.sharp) {
    return { action: "skip (sharp missing)", before: fileSize(filePath), after: fileSize(filePath), skipped: true };
  }

  const ext = path.extname(filePath).toLowerCase();
  const dir = path.dirname(filePath);
  const base = path.basename(filePath, ext);
  const before = fileSize(filePath);

  // Already a WebP — only re-compress if large
  if (ext === ".webp") {
    if (before <= 200 * 1024) {
      return { action: "skip (already small WebP)", before, after: before, skipped: true };
    }
    if (dryRun) {
      return { action: "re-compress WebP", before, after: Math.round(before * 0.85), skipped: false };
    }
    const sharp = require("sharp");
    const tmp = filePath + ".tmp";
    await sharp(filePath).webp({ quality: MODE.quality }).toFile(tmp);
    const tmpSize = fileSize(tmp);
    if (tmpSize < before) {
      fs.renameSync(tmp, filePath);
      return { action: "re-compressed WebP", before, after: tmpSize, skipped: false };
    }
    fs.unlinkSync(tmp);
    return { action: "skip (already optimal WebP)", before, after: before, skipped: true };
  }

  // Skip conversion if --no-convert
  if (MODE.noConvert) {
    if (dryRun) {
      return { action: "re-compress in-place", before, after: Math.round(before * 0.9), skipped: false };
    }
    const sharp = require("sharp");
    const tmp = filePath + ".tmp";
    const img = sharp(filePath);
    if (ext === ".jpg" || ext === ".jpeg") {
      await img.jpeg({ quality: MODE.quality, mozjpeg: true }).toFile(tmp);
    } else if (ext === ".png") {
      await img.png({ compressionLevel: 9, quality: MODE.quality }).toFile(tmp);
    } else {
      fs.unlinkSync(tmp).catch?.(() => {});
      return { action: "skip (no-convert mode)", before, after: before, skipped: true };
    }
    const tmpSize = fileSize(tmp);
    if (tmpSize < before - MODE.minSavings) {
      if (MODE.keepOriginals) fs.renameSync(filePath, filePath + ".original");
      fs.renameSync(tmp, filePath);
      return { action: "re-compressed in-place", before, after: tmpSize, skipped: false };
    }
    try { fs.unlinkSync(tmp); } catch {}
    return { action: "skip (savings below threshold)", before, after: before, skipped: true };
  }

  // Convert to WebP
  const webpPath = path.join(dir, base + ".webp");

  // Skip if WebP already exists and was already produced from this source
  if (fs.existsSync(webpPath) && fs.existsSync(filePath + ".original")) {
    return { action: "skip (already converted)", before, after: fileSize(webpPath), skipped: true };
  }

  if (dryRun) {
    const estimated = Math.round(before * (ext === ".png" ? 0.5 : 0.65));
    return { action: `convert → ${base}.webp`, before, after: estimated, skipped: false, newPath: webpPath };
  }

  const sharp = require("sharp");
  const img = sharp(filePath);
  const meta = await img.metadata();

  // Use lossless for PNGs with alpha (logos, icons)
  const useLossless = ext === ".png" && meta.hasAlpha;

  await img.webp({ quality: MODE.quality, lossless: useLossless }).toFile(webpPath);
  const after = fileSize(webpPath);

  if (after >= before - MODE.minSavings) {
    // Not worth it — remove the webp and skip
    try { fs.unlinkSync(webpPath); } catch {}
    return { action: "skip (savings below threshold)", before, after: before, skipped: true };
  }

  if (MODE.keepOriginals) {
    fs.renameSync(filePath, filePath + ".original");
  } else {
    fs.unlinkSync(filePath);
  }

  return {
    action: `converted → .webp${useLossless ? " (lossless)" : ""}`,
    before,
    after,
    skipped: false,
    oldPath: filePath,
    newPath: webpPath,
  };
}

// ─── Video optimization ───────────────────────────────────────────────────────

function optimizeVideo(filePath, dryRun) {
  const before = fileSize(filePath);
  if (dryRun) {
    return { action: "re-encode video (H.264 CRF23)", before, after: Math.round(before * 0.6), skipped: false };
  }

  const tmp = filePath + ".tmp.mp4";
  const r = spawnSync(
    "ffmpeg",
    ["-i", filePath, "-vcodec", "libx264", "-crf", "23", "-preset", "slow",
      "-acodec", "aac", "-b:a", "128k", "-y", tmp],
    { encoding: "utf8" }
  );

  if (r.status !== 0) {
    try { fs.unlinkSync(tmp); } catch {}
    return { action: "skip (ffmpeg error)", before, after: before, skipped: true };
  }

  const after = fileSize(tmp);
  if (after < before - MODE.minSavings) {
    if (MODE.keepOriginals) fs.renameSync(filePath, filePath + ".original");
    else fs.unlinkSync(filePath);
    // Normalize to .mp4
    const ext = path.extname(filePath).toLowerCase();
    const outPath = ext === ".mp4" ? filePath : filePath.replace(ext, ".mp4");
    fs.renameSync(tmp, outPath);
    return { action: "re-encoded video", before, after, skipped: false, newPath: outPath !== filePath ? outPath : undefined };
  }

  try { fs.unlinkSync(tmp); } catch {}
  return { action: "skip (savings below threshold)", before, after: before, skipped: true };
}

// ─── Audio optimization ───────────────────────────────────────────────────────

function optimizeAudio(filePath, dryRun) {
  const before = fileSize(filePath);
  const ext = path.extname(filePath).toLowerCase();

  if (dryRun) {
    return { action: "re-encode audio (AAC 128k)", before, after: Math.round(before * 0.5), skipped: false };
  }

  const tmp = filePath + ".tmp.m4a";
  const r = spawnSync(
    "ffmpeg",
    ["-i", filePath, "-vn", "-acodec", "aac", "-b:a", "128k", "-y", tmp],
    { encoding: "utf8" }
  );

  if (r.status !== 0) {
    try { fs.unlinkSync(tmp); } catch {}
    return { action: "skip (ffmpeg error)", before, after: before, skipped: true };
  }

  const after = fileSize(tmp);
  if (after < before - MODE.minSavings) {
    if (MODE.keepOriginals) fs.renameSync(filePath, filePath + ".original");
    else fs.unlinkSync(filePath);
    const outPath = filePath.replace(ext, ".m4a");
    fs.renameSync(tmp, outPath);
    return { action: "re-encoded audio (AAC)", before, after, skipped: false, newPath: outPath !== filePath ? outPath : undefined };
  }

  try { fs.unlinkSync(tmp); } catch {}
  return { action: "skip (savings below threshold)", before, after: before, skipped: true };
}

// ─── Reference updater ────────────────────────────────────────────────────────

function updateReferences(conversions, rootDir) {
  if (conversions.length === 0) return [];

  const codeFiles = walkDir(rootDir).filter((f) => {
    const ext = path.extname(f).toLowerCase();
    return CODE_EXTS.has(ext);
  });

  const updated = [];

  for (const { oldPath, newPath } of conversions) {
    if (!oldPath || !newPath) continue;

    const oldName = path.basename(oldPath);
    const newName = path.basename(newPath);

    if (oldName === newName) continue;

    for (const cf of codeFiles) {
      try {
        const content = fs.readFileSync(cf, "utf8");
        if (!content.includes(oldName)) continue;
        const newContent = content.split(oldName).join(newName);
        fs.writeFileSync(cf, newContent, "utf8");
        updated.push({ file: path.relative(rootDir, cf), from: oldName, to: newName });
      } catch {}
    }
  }

  return updated;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const rootDir = path.resolve(MODE.dir);

  // ── Check mode ──
  if (MODE.check) {
    console.log(bold("\n  Media Optimizer — Tool Check\n"));
    const tools = detectTools();
    console.log(`  sharp   ${tools.sharp ? green("✓ available") : red("✗ missing")}  (image conversion)`);
    console.log(`  svgo    ${tools.svgo ? green("✓ available") : red("✗ missing")}  (SVG minification)`);
    console.log(`  ffmpeg  ${tools.ffmpeg ? green("✓ available") : yellow("○ not found")}  (video/audio — optional)\n`);
    if (!tools.sharp) {
      console.log(yellow("  Install sharp:  pnpm add -D sharp"));
    }
    if (!tools.svgo) {
      console.log(yellow("  Install svgo:   pnpm add -D svgo"));
    }
    if (!tools.ffmpeg) {
      console.log(grey("  ffmpeg not in PATH — video/audio files will be skipped."));
    }
    console.log();
    process.exit(tools.sharp ? 0 : 1);
  }

  const tools = detectTools();

  console.log(bold(`\n  Media Optimizer${MODE.dryRun ? yellow(" [DRY RUN — no files will change]") : ""}`));
  console.log(grey(`  Root: ${rootDir}\n`));

  // ── Discover ──
  const files = discoverMedia(rootDir);

  if (files.length === 0) {
    console.log(grey("  No media files found.\n"));
    process.exit(0);
  }

  const totalBefore = files.reduce((s, f) => s + f.size, 0);
  console.log(`  Found ${cyan(files.length + " files")} — ${fmtBytes(totalBefore)} total\n`);

  // Print discovery table
  const typeGroups = {};
  for (const f of files) {
    typeGroups[f.type] = (typeGroups[f.type] || 0) + 1;
  }
  for (const [type, count] of Object.entries(typeGroups)) {
    console.log(`  ${grey(type.padEnd(8))}  ${count} file${count !== 1 ? "s" : ""}`);
  }
  console.log();

  if (!tools.sharp) {
    console.log(red("  ERROR: sharp is not installed. Run with --check to see install instructions.\n"));
    process.exit(1);
  }

  // ── Process ──
  const results = [];
  const conversions = []; // { oldPath, newPath } pairs for reference updates
  const BATCH = 10;

  for (let i = 0; i < files.length; i += BATCH) {
    const batch = files.slice(i, i + BATCH);

    await Promise.all(
      batch.map(async (f) => {
        // Skip already-processed
        if (!MODE.dryRun && alreadyProcessed(f.path)) {
          const rel = path.relative(rootDir, f.path);
          console.log(`  ${grey("skip")}  ${grey(rel)}  ${grey("(already processed)")}`);
          results.push({ file: rel, type: f.type, ...{ action: "skip (already processed)", before: f.size, after: f.size, skipped: true } });
          return;
        }

        let result;
        try {
          if (f.type === "svg") {
            result = await optimizeSvg(f.path, tools, MODE.dryRun);
          } else if (f.type === "image") {
            result = await optimizeImage(f.path, tools, MODE.dryRun);
          } else if (f.type === "video") {
            if (!tools.ffmpeg) {
              result = { action: "skip (ffmpeg not found)", before: f.size, after: f.size, skipped: true };
            } else {
              result = optimizeVideo(f.path, MODE.dryRun);
            }
          } else if (f.type === "audio") {
            if (!tools.ffmpeg) {
              result = { action: "skip (ffmpeg not found)", before: f.size, after: f.size, skipped: true };
            } else {
              result = optimizeAudio(f.path, MODE.dryRun);
            }
          }
        } catch (err) {
          result = { action: `error: ${err.message}`, before: f.size, after: f.size, skipped: true };
        }

        const rel = path.relative(rootDir, f.path);
        const saved = result.before - result.after;
        const indicator = result.skipped
          ? grey("skip")
          : saved > 0
          ? green("done")
          : grey("~   ");

        console.log(
          `  ${indicator}  ${rel.padEnd(55)}  ` +
          `${fmtBytes(result.before).padStart(9)}  →  ${fmtBytes(result.after).padStart(9)}` +
          (result.skipped ? "" : `  ${green(fmtDelta(result.before, result.after))}`)
        );

        if (result.oldPath && result.newPath) {
          conversions.push({ oldPath: result.oldPath, newPath: result.newPath });
        }

        results.push({ file: rel, type: f.type, ...result });
      })
    );
  }

  // ── Update references ──
  let refUpdates = [];
  if (!MODE.dryRun && conversions.length > 0) {
    console.log(bold("\n  Updating references in source files…"));
    refUpdates = updateReferences(conversions, rootDir);
    for (const u of refUpdates) {
      console.log(`  ${cyan("ref")}  ${u.file}  ${grey(u.from + " → " + u.to)}`);
    }
    if (refUpdates.length === 0) console.log(grey("  No references needed updating."));
  }

  // ── Summary ──
  const processed = results.filter((r) => !r.skipped);
  const totalAfter = results.reduce((s, r) => s + r.after, 0);
  const totalSaved = totalBefore - totalAfter;
  const pctSaved = totalBefore > 0 ? ((totalSaved / totalBefore) * 100).toFixed(1) : "0.0";

  const byType = {};
  for (const r of processed) {
    if (!byType[r.type]) byType[r.type] = { count: 0, saved: 0 };
    byType[r.type].count++;
    byType[r.type].saved += r.before - r.after;
  }

  console.log(bold("\n  ─────────────────────────────────────────────────────"));
  console.log(bold("  Summary"));
  console.log(`  Files scanned:   ${files.length}`);
  console.log(`  Files optimized: ${processed.length}`);
  console.log(`  Total before:    ${fmtBytes(totalBefore)}`);
  console.log(`  Total after:     ${fmtBytes(totalAfter)}`);
  console.log(`  Saved:           ${green(fmtBytes(totalSaved) + " (" + pctSaved + "%)")}`);

  if (Object.keys(byType).length > 0) {
    console.log(bold("\n  By type:"));
    for (const [type, stats] of Object.entries(byType)) {
      console.log(`    ${type.padEnd(8)}  ${stats.count} file${stats.count !== 1 ? "s" : ""}  saved ${green(fmtBytes(stats.saved))}`);
    }
  }

  if (refUpdates.length > 0) {
    console.log(`\n  Reference updates: ${cyan(refUpdates.length + " file(s) updated")}`);
  }

  const skippedFfmpeg = results.filter(
    (r) => r.action && r.action.includes("ffmpeg not found")
  );
  if (skippedFfmpeg.length > 0) {
    console.log(yellow(`\n  ${skippedFfmpeg.length} video/audio file(s) skipped — install ffmpeg and re-run to optimize them.`));
  }

  if (MODE.dryRun) {
    console.log(yellow("\n  DRY RUN — no files were changed. Remove --dry-run to apply.\n"));
  } else if (MODE.keepOriginals) {
    console.log(grey("\n  Original files backed up as *.original alongside converted assets."));
    console.log(grey("  Run with --replace to skip backups and delete originals instead.\n"));
  }

  console.log();
}

main().catch((err) => {
  console.error(red(`\n  Fatal error: ${err.message}\n`));
  process.exit(1);
});
