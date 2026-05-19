// Turbopack spawns `node .next/dev/build/postcss.js <port>` workers to run
// @tailwindcss/postcss. On Windows these get orphaned when `next dev` exits
// ungracefully (Ctrl+C in PowerShell doesn't cascade to children). Each
// orphan holds ~50MB, so they pile up across sessions and OOM the machine.

import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

if (process.platform !== "win32") process.exit(0);

const here = path.dirname(fileURLToPath(import.meta.url));
const marker = path.join(path.resolve(here, ".."), ".next", "dev", "build", "postcss.js");

const script = `
$ErrorActionPreference = 'SilentlyContinue'
$marker = $env:MARKER
$matches = Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" |
  Where-Object { $_.CommandLine -like "*$marker*" }
$orphans = $matches | Where-Object {
  -not (Get-CimInstance Win32_Process -Filter "ProcessId = $($_.ParentProcessId)")
}
if ($orphans) {
  $count = @($orphans).Count
  $orphans | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
  Write-Host "Cleaned up $count orphan postcss worker(s) from a previous dev run."
}
`;

try {
  execFileSync(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-Command", script],
    { stdio: "inherit", env: { ...process.env, MARKER: marker } },
  );
} catch {
  // best-effort: never block dev startup on cleanup
}
