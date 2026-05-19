---
name: media-optimizer
description: Scans the repo for images, videos, and audio files, then optimizes them in-place (WebP conversion, compression, SVG minification, video/audio re-encode). Works in any repo. Reports bytes saved.
---

# Media Optimizer Skill

Autonomously find, convert, and compress every media asset in the current repository. Designed to be repo-agnostic — works in any Next.js, Vite, plain HTML, or any other project layout.

## Triggers

- `/media-optimizer`
- "optimize media"
- "compress images"
- "convert images to webp"
- "optimize assets"
- "shrink media files"

---

## Workflow

### Phase 1 — Dependency Check

Run the dependency check to verify required tools are available. Do this before anything else.

```bash
node .claude/skills/media-optimizer/scripts/optimize.js --check
```

The script prints which tools are available (`sharp`, `svgo`, `ffmpeg`) and which are missing. If `sharp` is not installed in the current project, install it as a dev dependency before proceeding:

```bash
pnpm add -D sharp svgo
# or: npm install -D sharp svgo
# or: yarn add -D sharp svgo
```

Detect the package manager by checking for `pnpm-lock.yaml`, `yarn.lock`, or `package-lock.json` in the project root (in that priority order). If no `package.json` exists at all, use `npm`.

`ffmpeg` is optional — it enables video and audio optimization. If it is not in PATH, skip video/audio files and note this in the final report.

---

### Phase 2 — Discovery & Dry Run

Run a dry-run scan to show the user what will be changed **before** touching any files:

```bash
node .claude/skills/media-optimizer/scripts/optimize.js --dry-run
```

Print the table of discovered files, their current sizes, and the estimated action (e.g., "convert to WebP", "re-compress", "minify SVG", "skip — already optimal").

Ask the user to confirm before proceeding. Present key stats: total file count, total current size, estimated size after optimization.

**Default exclusions** (never touch these):
- `node_modules/`
- `.git/`
- `.next/`
- `dist/`, `out/`, `build/`
- `coverage/`
- Any path containing `.cache`

---

### Phase 3 — Optimize

Run the optimizer. Pass any flags the user specified (see Options below). Default: convert + compress, quality 82, keep originals.

```bash
node .claude/skills/media-optimizer/scripts/optimize.js --quality 82 --keep-originals
```

The script processes files in this order:
1. SVG → SVGO minification
2. PNG / JPG / JPEG / GIF → convert to WebP + compress
3. Already-WebP / AVIF → re-compress if above quality threshold
4. MP4 / MOV / AVI / MKV → ffmpeg H.264 re-encode at CRF 23 (skip if ffmpeg absent)
5. MP3 / WAV / OGG / FLAC → ffmpeg AAC/Opus re-encode at 128kbps (skip if ffmpeg absent)

For image conversion: the `.webp` file is written alongside the original (e.g., `hero.jpg` → `hero.webp`). The original is renamed to `hero.jpg.original` when `--keep-originals` is set, or deleted when `--replace` is used.

**IMPORTANT — After conversion**: scan the codebase for references to converted filenames and update them automatically. For example, if `hero.jpg` becomes `hero.webp`, search for `hero.jpg` across all `.tsx`, `.ts`, `.jsx`, `.js`, `.html`, `.css`, `.md`, `.json` files and replace with `hero.webp`. Do this with targeted `grep` + `Edit` calls — do NOT use broad sed substitutions.

---

### Phase 4 — Report

After optimization, the script prints a structured savings report. Relay it to the user, then produce a short summary:

```
## Media Optimization Complete

| Metric | Value |
|--------|-------|
| Files processed | N |
| Total before | X MB |
| Total after | Y MB |
| Saved | Z MB (P%) |

**By type:**
- Images: N files, saved Z KB
- SVGs: N files, saved Z KB
- Videos: N files, saved Z MB (or "skipped — ffmpeg not found")
- Audio: N files, saved Z KB (or "skipped — ffmpeg not found")

**Reference updates:** N file(s) updated to point to new .webp paths.
**Originals backed up:** .jpg.original / .png.original files kept alongside converted assets.
```

---

## Options

Pass these as flags to the script, or infer them from the user's message:

| Flag | Default | Meaning |
|------|---------|---------|
| `--quality <n>` | `82` | WebP / video quality (1–100; lower = smaller file) |
| `--replace` | off | Delete original after conversion instead of keeping `.original` backup |
| `--keep-originals` | on | Rename original to `*.original` (default behavior) |
| `--images-only` | off | Skip video and audio entirely |
| `--svg-only` | off | Only process SVG files |
| `--no-svg` | off | Skip SVG files |
| `--no-convert` | off | Re-compress only; do not convert formats (skip JPG→WebP etc.) |
| `--dir <path>` | `.` (repo root) | Only process files under this directory |
| `--dry-run` | off | Print what would happen; make no changes |
| `--check` | off | Print tool availability and exit |
| `--min-savings <n>` | `10` | Skip a file if estimated savings < N KB (avoids touching already-optimal files) |

---

## Edge Cases & Rules

- **Never touch files in `node_modules/`, `.git/`, `.next/`, `dist/`, `out/`, `build/`.**
- **Never convert SVGs to WebP** — SVG is a vector format; only minify it with SVGO.
- **Animated GIFs**: convert to animated WebP. If the GIF is referenced in an `<img>` tag with no JS dependency, update the src. If it is used as a CSS `background-image`, update the CSS too.
- **Favicon files** (`favicon.ico`, `apple-touch-icon.png`, `icon.png`, `apple-icon.png`): skip by default unless the user explicitly includes them, because browsers and OS shells require specific formats.
- **Already-WebP files**: only re-compress if their current size is > 200 KB (avoid repeated lossy re-compression).
- **Lossless PNGs** (logos, icons, UI assets with transparency): prefer lossless WebP (`--lossless` flag in sharp) rather than lossy compression. Detect by checking if the PNG has an alpha channel.
- **If `sharp` fails on a file** (corrupt, unsupported sub-format), log the error with the filename, skip the file, and continue — never abort the whole run.
- **Source maps, JSON, and non-media files**: never touch them even if they appear in a media directory.

---

## Guidelines

- **Always dry-run first** and confirm with the user before writing files.
- **Parallel where possible**: process multiple files concurrently inside the script (the script uses `Promise.all` batches of 10).
- **Be conservative**: default quality of 82 preserves visible quality while cutting ~30–50% of image weight for typical photos.
- **Log clearly**: print each file's before/after size as it is processed so the user can follow progress.
- **Don't re-run on already-converted files**: if `hero.webp` already exists and `hero.jpg.original` also exists, the file was already processed — skip it.
