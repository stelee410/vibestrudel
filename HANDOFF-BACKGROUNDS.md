# Handoff — Generate background art pack for VibeStrudel

> **Target audience**: Codex (or any coding agent / contributor) picking up this scoped task.
> **Read time**: 10 min. Everything you need to start is in this doc.

---

## 1. Mission

VibeStrudel is a live-coding music tool with a "SHOW mode" that turns the screen into a stage display (single large central artwork + level meter, used when the music is projected to an audience or shared as a visual stream).

The SHOW stage currently has **8 procedural scenes** (`speaker / vinyl / radar / wave / bars / image-warp / image-pulse / particles`). Two of them (`image-warp`, `image-pulse`) require a user-supplied image via `?bg=URL`.

**Your job** is to deliver a **library of background art** that ships with the project, so users don't have to bring their own image. Specifically:

1. ~20 hand-curated **background images** (or procedural SVGs that render to images) covering different musical moods
2. A **JSON manifest** registering each image with metadata
3. A small **picker UI** in the topbar so users can flip through the pack without typing URLs
4. Optionally, **1-2 new procedural scenes** that build on the new art pack

Quality bar: each background should look "designed", not generic. Reference: https://sonara.fm/ aesthetic (印刷品/电影感), or club VJ visuals.

---

## 2. Project at a glance (skip if you already know it)

- **Single-page HTML app**: `index.html` (~165 KB, all logic inline, no build step)
- **Landing page**: `landing.html` (the "create session" entry)
- **CSS**: `themes/default.css` (single file, ~50 KB)
- **i18n**: `themes/i18n.js` (4 languages: en / zh / ja / fr)
- **Server**: `server/` — Fastify + Redis (Node.js, not relevant to this task)
- **Audio engine**: Strudel (vendored in `vendor/strudel/`)
- **Hydra**: WebGL visual synth, loaded from CDN, runs alongside SHOW stage
- **Deploy**: `bash deploy.sh` (rsync to prod) — see § 8

The app runs at https://vibe.linkyun.co.

---

## 3. Where backgrounds fit — the SHOW stage architecture

### 3.1 The container

```html
<!-- index.html line ~372 -->
<div id="show-stage" aria-hidden="true">
  <div class="show-art" id="show-art" data-active="speaker">
    <img class="show-art-custom" id="show-art-custom" src="" style="display:none">
    <svg class="show-art-scene scene-speaker" data-scene="speaker">…</svg>
    <svg class="show-art-scene scene-vinyl" data-scene="vinyl">…</svg>
    <!-- … 8 scenes total … -->
  </div>
  <div class="show-level"><!-- big level meter --></div>
</div>
```

- `#show-stage` is `position:fixed`, only visible when `body.mode-show` (URL `?mode=show` or `/control/`).
- `#show-art` is a centered ~50vmin square box.
- `.show-art-scene` divs are stacked absolutely inside. Only the one matching `[data-active="..."]` is visible (CSS rule at `themes/default.css` ~line 480).

### 3.2 The picker

A topbar button `SCENE: speaker` (defined at `index.html` ~line 65) cycles through all 8 scenes on click. State persists in `localStorage["vibestrudel.showScene"]`.

The cycle list lives at `index.html` line **1314**:
```js
const SCENES = ["speaker", "vinyl", "radar", "wave", "bars", "image-warp", "image-pulse", "particles"];
```

### 3.3 The image source

Today, `image-warp` and `image-pulse` scenes read `?bg=URL`:

```js
// index.html ~line 1352
function applyBgImage(){
  const bg = (new URLSearchParams(location.search).get("bg"))
          || localStorage.getItem("vibestrudel.showBg");
  if (!bg) return;
  if (imageWarpSrc) imageWarpSrc.setAttribute("href", bg);
  if (imagePulseSrc) imagePulseSrc.src = bg;
}
```

So images are URLs. Once the user opens the link with `?bg=...`, the URL is also stored in localStorage and survives across visits.

### 3.4 Audio-reactive variables — design backgrounds with these in mind

A `requestAnimationFrame` loop maintains four globals/CSS-vars derived from a `Web Audio AnalyserNode` tap on the master limiter:

| Name | Range | Source |
|---|---|---|
| `window.__audioLow` | 0..1 | FFT bins 0–10 (<1.7 kHz, mostly kick) |
| `window.__audioMid` | 0..1 | FFT bins 10–40 (1.7–7 kHz, snare/lead) |
| `window.__audioHi`  | 0..1 | FFT bins 40–128 (7–22 kHz, hat/air) |
| CSS `--amp` on `:root` | 0..1 | same as `__audioLow` |

A background designed to **swell on kicks** should react to `__audioLow`; a particle field that **sparkles on hats** should respond to `__audioHi`.

---

## 4. Deliverable

### 4.1 File layout

```
assets/
  backgrounds/
    manifest.json
    aurora-001.jpg           # or .png / .svg / .webp
    aurora-001-thumb.jpg     # 200×200 thumbnail for picker
    aurora-002.jpg
    aurora-002-thumb.jpg
    …
```

- **Source images**: 1280×1280 minimum, square aspect ratio. Format: JPG (preferred, smaller) or PNG (if transparency matters) or SVG (procedural, infinitely scalable — best for vector-y looks).
- **Thumbnails**: 200×200, JPG, ≤ 20 KB each.
- **Total pack size budget**: ≤ 8 MB after compression. Use `cwebp -q 75` if it helps.

### 4.2 `manifest.json` schema

```json
{
  "version": 1,
  "backgrounds": [
    {
      "id": "aurora-001",
      "title": "Aurora Drift",
      "subtitle": "Cold mountains under green northern lights",
      "tags": ["ambient", "cinematic", "cold", "outdoor"],
      "src": "/assets/backgrounds/aurora-001.jpg",
      "thumb": "/assets/backgrounds/aurora-001-thumb.jpg",
      "dominantColor": "#1d3a4a",
      "recommendedScene": "image-warp",
      "license": "CC0 (or whatever)",
      "credit": "Generated by Codex via … / photo by …"
    },
    …
  ]
}
```

Required fields: `id`, `title`, `src`, `thumb`, `dominantColor`, `license`.
Other fields strongly recommended.

### 4.3 Picker UI

Add a topbar button next to the existing `SCENE` button:

```html
<!-- in index.html topbar -->
<button class="bg-btn" id="bg-btn" title="Background pack (click cycles)">BG: aurora-001</button>
```

On click:
1. Fetch `/assets/backgrounds/manifest.json` (cache once at page load)
2. Cycle to next entry, update `imageWarpSrc.href` + `imagePulseSrc.src`
3. Persist choice in `localStorage["vibestrudel.bgId"]`
4. Update button label to show current title (truncate if > 12 chars)

If the user has set `?bg=URL` (custom external image), respect that — BG button cycles among the bundled pack OR "custom" entry. Show `BG: custom` and disable cycling if you prefer simpler logic.

**Bonus**: a small modal opens on long-press or Shift+click, showing thumbnails in a grid for direct pick. Skip if low on time.

### 4.4 First batch — 20 backgrounds across moods

Suggested themes (you can iterate):

| Mood family | Examples | Recommended scene |
|---|---|---|
| Cosmic / nebula | aurora, starfield, galaxy core, dust clouds | image-warp |
| Geometric / minimal | concentric rings, grid, Bauhaus, Suprematism | image-pulse |
| Liquid / fluid | ink in water, oil spill, marble, lava lamp | image-warp |
| Cityscape / neon | Tokyo night, Hong Kong rain, retro VHS city | image-pulse |
| Nature / texture | moss, bark, sand dunes, paper grain | image-warp |
| Abstract painting | Rothko stripes, gradient fields, brush strokes | image-pulse |
| Sci-fi / cyber | circuit, hologram, terminal grid | image-pulse |
| Print / poster | film poster crop, magazine spread, type | image-pulse |

Aim for **variety** within and across families. Avoid generic stock-photo look. The user is a live coder showing this to an audience — every background should feel **chosen**, not random.

---

## 5. Hard constraints

| | |
|---|---|
| **No external runtime deps** | Don't `<script src="https://npm.cdn...">`. Everything must work offline once assets are bundled. |
| **No tracking / analytics** in image hosts | Self-host all images under `/assets/backgrounds/`. Don't reference Imgur, Cloudinary etc. |
| **License clean** | Only CC0 / public-domain / your own work. Record in manifest. No copyrighted images. |
| **Total size** | ≤ 8 MB for the whole pack post-compression. |
| **Format** | JPG ≤ 250 KB each; SVG ≤ 30 KB each. PNG only if alpha needed. |
| **No tracking pixels / external requests in SVGs** | If using SVG, inline all `<style>` and no `<image href="http..."/>` references. |
| **Procedural ok** | If you want to GENERATE backgrounds with code (SVG / canvas), commit the generator script too under `tools/gen-backgrounds/`, and check in the generated assets. Reproducibility matters. |
| **Aspect** | Square (1:1). If you need rectangular, document why — the SHOW stage is square. |

---

## 6. Reference: where to look in existing code

| Topic | File | Approx line |
|---|---|---|
| `#show-stage` HTML container | `index.html` | 372 |
| All 8 scene SVG/divs | `index.html` | 376–476 |
| `SCENE` button (topbar) | `index.html` | 65 |
| `setActiveScene()` + cycling logic | `index.html` | 1290–1322 |
| `applyBgImage()` — current bg loader | `index.html` | 1346–1358 |
| Audio-reactive vars (`window.__audio*`) | `index.html` | 1054 (audio bridge) and 1148 (CSS var sync) |
| Scene display rules CSS | `themes/default.css` | 480 |
| Hydra integration (for reference, separate system) | `index.html` | 1010+ |
| i18n keys (en/zh/ja/fr) | `themes/i18n.js` | — add `bg.*` keys |

The simplest patch to add the picker is in `index.html` near the existing `setupShowStage` function (~line 1270).

---

## 7. Reference: visual style cues we like

- **sonara.fm** — paper / ink / film grain aesthetic. Restraint, monochrome with one accent color.
- **Hydra** built-in patterns — `osc()`, `voronoi()`, `noise()` — for procedural cosmic looks.
- **VJ loops** — kaleidoscope, geometric loops (sample queries: "minimal VJ loop", "boilerroom visuals").
- **Trentemøller / Lustmord / Burial album covers** — for dark ambient mood.
- **Le Witt / Sol Lewitt / Bauhaus** — for geometric.

Avoid:
- Generic stock photography ("sunset over mountains")
- Wedding / corporate aesthetic
- Anything with text in the image (the user's own wordmark overlays in PAPER mode)

---

## 8. Testing & deployment

### Local test
```bash
# Quick visual check — just point the running site at your local files:
cd /Users/stelee/Dev/vibestrudel
# Drop your generated files into assets/backgrounds/
# Then open the site, switch to SHOW mode, click BG button.
# (No build step. assets/ is bind-mounted into the Caddy container in prod;
#  local dev just open index.html in a browser pointing at correct ASSET_BASE.)
```

For dev convenience, the site is also live at `vibe.linkyun.co`. To preview your work without touching prod:
- Set `window.__ASSET_BASE` in URL: not currently supported via querystring, but you can `localStorage.setItem("vibestrudel.assetBase", "https://YOUR-PREVIEW.example.com")` and reload (you'll need to add this read at boot).
- Or run a local Python server: `python3 -m http.server 8888` from project root, open `http://localhost:8888/`.

### Production deploy
```bash
bash deploy.sh
```

This rsyncs `index.html`, `landing.html`, `themes/`, and `assets/` to the prod server (HK), then restarts Caddy. Your new `assets/backgrounds/*` will be served from `https://vibe.linkyun.co/assets/backgrounds/*` automatically (no Caddyfile changes needed — `./assets:/srv/public/assets:ro` is already mounted in `docker-compose.prod.yml`).

After deploy, verify:
```bash
curl -I https://vibe.linkyun.co/assets/backgrounds/manifest.json
# Expect: HTTP/2 200, content-type: application/json
```

---

## 9. Decisions you can make without asking

- Exact image style / palette / theme distribution
- Choice between bitmap (JPG) vs procedural SVG (mix is fine)
- Manifest fields beyond required minimum
- Picker UX details (cycle on click is the baseline; modal grid is bonus)
- New scene types if a background needs special treatment (e.g. a parallax scroll scene)

## 10. Questions worth raising back to the project owner

- Do we want NSFW/safety filtering on user-supplied `?bg=URL`?
- Should the pack include per-genre defaults (techno → cyberpunk bg, ambient → aurora)? If so, hook into `session.styleHint` and auto-pick a default bg on first load.
- Localization — should `title` / `subtitle` be i18n keys instead of literal English?

## 11. Definition of done

- [ ] ≥ 20 backgrounds in `assets/backgrounds/`, each with thumb + manifest entry
- [ ] `assets/backgrounds/manifest.json` validates against the schema in § 4.2
- [ ] `BG: …` button in topbar cycles through them; choice persists across reloads
- [ ] Image-warp and image-pulse scenes work with any bundled background; audio reactivity preserved
- [ ] If `tools/gen-backgrounds/` exists, it has a README explaining how to regenerate
- [ ] `bash deploy.sh` ships everything; no manual server steps needed
- [ ] At least one acoustic-look (paper/ink/print) and one electronic-look (neon/cyber) background per mood family
- [ ] Total pack ≤ 8 MB
- [ ] All assets are CC0 / yours; manifest records licensing

## 12. Open the door wider

If you spot improvements adjacent to this task — e.g., a 2-layer background (rotating + amp-reactive overlay), a "background mood matrix" picker UI, or a CLI tool to ingest user images into the pack format — do it and document in the PR. The project is still moving fast and welcome the extension.

---

**Owner contact**: Stephen Liy (stelee410 on GitHub)
**Repo**: https://github.com/stelee410/vibestrudel
**Live**: https://vibe.linkyun.co
**Last updated**: 2026-05-21
