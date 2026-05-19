# /add-instagram-post

Download an Instagram post or reel thumbnail, save it as WebP, and wire it into the Instagram section of the homepage.

## Arguments

`$ARGUMENTS` must contain:

1. **URL** — the Instagram post or reel link (required)
2. **Slot** — which of the 6 grid positions to fill (required):
   - `1` / `top left` — column 1, row 1
   - `2` / `top center` — column 2, row 1
   - `3` / `top right` — column 3, row 1
   - `4` / `bottom left` — column 1, row 2
   - `5` / `bottom center` — column 2, row 2
   - `6` / `bottom right` — column 3, row 2
3. **Caption** — the hover text (optional; see fallback logic below)
4. **Co-author** — Instagram handle of the co-poster, with or without `@` (optional). Detected as any token starting with `@` that remains after slot parsing, or preceded by `with`/`co`/`feat`/`ft`.

**Example invocations:**

```
/add-instagram-post https://www.instagram.com/reel/abc123/ 2 "Crispy falafel, straight from the fryer."
/add-instagram-post https://www.instagram.com/p/xyz789/ top-left "Samoon fresh from the oven."
/add-instagram-post https://www.instagram.com/reel/def456/ slot 4
/add-instagram-post https://www.instagram.com/reel/ghi789/ 3 with @someplace
/add-instagram-post https://www.instagram.com/reel/jkl012/ 5 "Great collab dish!" @partnerchef
```

---

## Steps to execute

### 1 — Parse arguments

From `$ARGUMENTS`, extract:
- `URL`: the first token that starts with `http`
- `SLOT`: one of `1–6`, `slot 1`–`slot 6`, `top left/center/right`, `bottom left/center/right`
- `CAPTION`: everything remaining after the slot token that is not a co-author token (empty string if absent)
- `CO_AUTHOR`: any token starting with `@`, or the word immediately after `with`/`co`/`feat`/`ft`. Strip the leading `@` when storing. Empty string if absent.

Map the slot to an array index and slot number:

| Slot | Label | Array index (`POSTS[i]`) |
|------|-------|--------------------------|
| 1 | top left | 0 |
| 2 | top center | 1 |
| 3 | top right | 2 |
| 4 | bottom left | 3 |
| 5 | bottom center | 4 |
| 6 | bottom right | 5 |

### 2 — Run the download script

Execute the following command from the repo root, passing the URL and slot:

```
node scripts/fetch-instagram-thumb.mjs "<URL>" "<SLOT>"
```

The script:
- Calls `yt-dlp` to fetch the raw thumbnail (must be installed: `pip install yt-dlp`)
- Converts it to WebP via `sharp` (already a project dependency)
- Saves it to `public/Images/instagram/post-<slotNum>.webp`
- Fetches the post description via a second `yt-dlp --print description` call (best-effort)
- Prints three machine-readable lines: `SLOT_INDEX=<n>`, `SLOT_FILE=<path>`, and `POST_CAPTION=<text>`

If `yt-dlp` is not installed, tell the user to run `pip install yt-dlp` and abort.

### 3 — Run /media-optimizer on the saved image

After the script succeeds, invoke `/media-optimizer` so the new WebP is re-compressed to the project's standard quality settings and the exact byte savings are reported.

### 4 — Determine the caption to use

- If `CAPTION` was provided in `$ARGUMENTS`, use it as-is.
- If `CAPTION` was omitted **and** `POST_CAPTION` is non-empty, use `POST_CAPTION` (the first ~8 words of the post's actual caption fetched by the script).
- If both are absent, leave the existing caption unchanged.

### 5 — Update InstagramSection.tsx

Open `src/components/home/InstagramSection.tsx`.

Locate the `POSTS` array entry whose `id` equals `"<slotNum>"` (e.g. `"3"` for slot 3).

Make these changes to that entry:

- **`image`** → `/Images/instagram/post-<slotNum>.webp`
- **`url`** → the actual Instagram post URL supplied by the user
- **`caption`** → the caption determined in step 4 (or unchanged if not applicable)
- **`coAuthor`** → if `CO_AUTHOR` is non-empty, set this field to the handle (without `@`); if `CO_AUTHOR` is empty, remove the `coAuthor` field entirely from the object

Do not touch any other entry in the array.

### 6 — Confirm

Report back:
- Which slot was updated (number + label)
- The saved image path
- The caption now in use
- The co-author handle (if set), and whether the full combined handle fits on one line or only the co-author handle will be shown (combined string `@albaghdadyrestaurant & @<coAuthor>` ≤ 38 chars = full; longer = co-author only)
- Any byte savings from /media-optimizer

If anything failed (yt-dlp not found, network error, bad URL), explain precisely what went wrong and what the user should do next.
