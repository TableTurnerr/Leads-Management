// Compact persistence for the selection of restaurant IDs.
//
// Selections can range from a single click to a lasso over tens of thousands
// of rows, so we keep them out of the main zustand JSON blob and encode them
// adaptively. Two formats are tried and the smaller one wins:
//
//   v:<base64>  varint-encoded deltas of the sorted ID list
//   b:<base64>  packed bitset, 1 bit per possible ID up to max
//
// Varint-deltas are tiny for sparse selections; the bitset is unbeatable when
// the selection is dense (e.g. "select all in this state").

const KEY = "tt-selected-ids-v1";

function bytesToBase64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

function base64ToBytes(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function encodeVarintDeltas(ids: number[]): Uint8Array {
  const sorted = [...ids].sort((a, b) => a - b);
  const out: number[] = [];
  let prev = 0;
  for (const id of sorted) {
    let d = id - prev;
    prev = id;
    while (d >= 0x80) {
      out.push((d & 0x7f) | 0x80);
      d >>>= 7;
    }
    out.push(d & 0x7f);
  }
  return new Uint8Array(out);
}

function decodeVarintDeltas(bytes: Uint8Array): number[] {
  const out: number[] = [];
  let prev = 0;
  let i = 0;
  while (i < bytes.length) {
    let d = 0;
    let shift = 0;
    let b: number;
    do {
      b = bytes[i++];
      d |= (b & 0x7f) << shift;
      shift += 7;
    } while (b & 0x80);
    prev += d;
    out.push(prev);
  }
  return out;
}

function encodeBitset(ids: number[]): Uint8Array {
  if (!ids.length) return new Uint8Array();
  let max = ids[0];
  for (let i = 1; i < ids.length; i++) if (ids[i] > max) max = ids[i];
  const bytes = new Uint8Array((max >>> 3) + 1);
  for (const id of ids) bytes[id >>> 3] |= 1 << (id & 7);
  return bytes;
}

function decodeBitset(bytes: Uint8Array): number[] {
  const out: number[] = [];
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    if (!b) continue;
    for (let j = 0; j < 8; j++) if (b & (1 << j)) out.push((i << 3) | j);
  }
  return out;
}

export function encodeSelectedIds(ids: number[]): string {
  if (!ids.length) return "";
  const v = encodeVarintDeltas(ids);
  const b = encodeBitset(ids);
  return v.length <= b.length ? `v:${bytesToBase64(v)}` : `b:${bytesToBase64(b)}`;
}

export function decodeSelectedIds(s: string | null | undefined): number[] {
  if (!s) return [];
  const tag = s.slice(0, 1);
  const body = s.slice(2);
  if (tag !== "v" && tag !== "b") return [];
  const bytes = base64ToBytes(body);
  return tag === "b" ? decodeBitset(bytes) : decodeVarintDeltas(bytes);
}

export function loadSelectedIds(): number[] {
  if (typeof window === "undefined") return [];
  try {
    return decodeSelectedIds(window.localStorage.getItem(KEY));
  } catch {
    return [];
  }
}

export function saveSelectedIds(ids: number[]): void {
  if (typeof window === "undefined") return;
  try {
    if (!ids.length) window.localStorage.removeItem(KEY);
    else window.localStorage.setItem(KEY, encodeSelectedIds(ids));
  } catch {
    // Quota or DOM exception. Selection is recoverable on next interaction,
    // so swallow rather than crash the UI.
  }
}
