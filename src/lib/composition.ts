// HyperFrames composition builder.
//
// Produces a self-contained bundle (index.html + assets) that:
//  - renders locally with `npx hyperframes preview/render`
//  - renders in the cloud via the HeyGen Hyperframes API (zip upload)
//  - previews in a plain browser with ?preview=1 (assets/preview.js shim)
//
// Layout (1080x1920) replicates the viral "Что выберешь?" format:
// red top half / blue bottom half, black divider, "ИЛИ" badge, image+caption
// per option, staggered reveal on the spoken "или", ticking clock thinking
// time, then a green/red percentage reveal.

import { promises as fs } from "fs";
import path from "path";
import { Project, Question } from "./types";
import { projectDir } from "./storage";

const W = 1080;

// Countdown ring geometry (SVG circle around the ИЛИ badge).
const RING_R = 108;
const RING_C = 2 * Math.PI * RING_R;
const H = 1920;

const GSAP_CDN = "https://cdn.jsdelivr.net/npm/gsap@3.12.5/dist/gsap.min.js";

interface Segment {
  q: Question;
  start: number; // segment start (whoosh + option A reveal)
  voStart: number;
  voEnd: number;
  bReveal: number; // option B appears (the spoken "или")
  tickStart: number;
  percentTime: number; // percent reveal moment (if enabled)
  end: number;
}

export interface BuildResult {
  bundleDir: string; // absolute fs path
  publicDir: string; // public URL path
  totalDuration: number;
}

export function computeSegments(questions: Question[]): Segment[] {
  const segments: Segment[] = [];
  let t = 0.3; // small lead-in
  for (const q of questions) {
    const voDur = q.audio?.duration ?? estimateDuration(q.voiceText);
    const iliRel = q.audio?.iliTime ?? voDur * 0.45;
    const start = t;
    const voStart = start + 0.2;
    const voEnd = voStart + voDur;
    const tick = Math.max(1, q.tickSeconds);
    const tickStart = voEnd + 0.15;
    const percentTime = tickStart + tick * 0.55;
    const end = tickStart + tick + 0.35;
    segments.push({
      q,
      start,
      voStart,
      voEnd,
      bReveal: voStart + iliRel,
      tickStart,
      percentTime,
      end,
    });
    t = end;
  }
  return segments;
}

function estimateDuration(text: string): number {
  // ~14 chars/sec for Russian TTS at normal pace.
  return Math.max(1.5, text.length / 14);
}

export async function buildComposition(project: Project): Promise<BuildResult> {
  const dir = projectDir(project.id);
  const bundle = path.join(dir, "bundle");
  const assets = path.join(bundle, "assets");
  await fs.rm(bundle, { recursive: true, force: true });
  await fs.mkdir(path.join(assets, "audio"), { recursive: true });
  await fs.mkdir(path.join(assets, "img"), { recursive: true });
  await fs.mkdir(path.join(assets, "sfx"), { recursive: true });
  await fs.mkdir(path.join(assets, "fonts"), { recursive: true });

  // 1. Copy SFX + fonts from public/ into the bundle.
  const sfxSrc = path.join(process.cwd(), "public", "sfx");
  for (const f of ["tick.wav", "whoosh.wav", "pop.wav", "ding.wav"]) {
    await fs.copyFile(path.join(sfxSrc, f), path.join(assets, "sfx", f));
  }
  const fontSrc = path.join(process.cwd(), "public", "fonts");
  for (const f of [
    "montserrat-900-cyrillic.woff2",
    "montserrat-900-latin.woff2",
  ]) {
    await fs.copyFile(path.join(fontSrc, f), path.join(assets, "fonts", f));
  }

  // 2. Copy per-question audio + images into the bundle with stable names.
  const localAudio: Record<string, string> = {};
  const localImg: Record<string, string> = {};
  for (let i = 0; i < project.questions.length; i++) {
    const q = project.questions[i];
    if (q.audio?.src) {
      const src = publicToFs(q.audio.src);
      const name = `q-${i}.mp3`;
      await fs.copyFile(src, path.join(assets, "audio", name));
      localAudio[q.id] = `assets/audio/${name}`;
    }
    for (const [side, opt] of [
      ["a", q.optionA],
      ["b", q.optionB],
    ] as const) {
      if (opt.image?.src && opt.image.src.startsWith("/generated/")) {
        const src = publicToFs(opt.image.src);
        const ext = path.extname(src) || ".jpg";
        const name = `q-${i}-${side}${ext}`;
        try {
          await fs.copyFile(src, path.join(assets, "img", name));
          localImg[`${q.id}-${side}`] = `assets/img/${name}`;
        } catch {
          /* missing image — placeholder will be used */
        }
      }
    }
  }

  // 3. Vendor GSAP (so the bundle renders standalone, deterministic).
  let gsapTag = `<script src="${GSAP_CDN}"></script>`;
  try {
    const res = await fetch(GSAP_CDN);
    if (res.ok) {
      await fs.writeFile(
        path.join(assets, "gsap.min.js"),
        Buffer.from(await res.arrayBuffer())
      );
      gsapTag = `<script src="assets/gsap.min.js"></script>`;
    }
  } catch {
    /* fall back to CDN tag */
  }

  // 4. Music (optional).
  let musicRel: string | null = null;
  if (project.settings.musicSrc) {
    try {
      const src = publicToFs(project.settings.musicSrc);
      const name = `music${path.extname(src) || ".mp3"}`;
      await fs.copyFile(src, path.join(assets, name));
      musicRel = `assets/${name}`;
    } catch {
      /* ignore missing music */
    }
  }

  const segments = computeSegments(project.questions);
  const total = (segments.at(-1)?.end ?? 1) + 0.5;

  const html = renderHtml(project, segments, total, {
    localAudio,
    localImg,
    musicRel,
    gsapTag,
  });
  await fs.writeFile(path.join(bundle, "index.html"), html, "utf-8");
  await fs.writeFile(
    path.join(assets, "preview.js"),
    PREVIEW_JS,
    "utf-8"
  );

  return {
    bundleDir: bundle,
    publicDir: `/generated/${project.id}/bundle`,
    totalDuration: total,
  };
}

function publicToFs(publicPath: string): string {
  return path.join(process.cwd(), "public", publicPath.replace(/^\//, ""));
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function n(x: number): string {
  return x.toFixed(2);
}

interface RenderCtx {
  localAudio: Record<string, string>;
  localImg: Record<string, string>;
  musicRel: string | null;
  gsapTag: string;
}

function renderHtml(
  project: Project,
  segments: Segment[],
  total: number,
  ctx: RenderCtx
): string {
  const clips: string[] = [];
  const anims: string[] = [];

  // ---- audio tracks ----
  // track 1: voiceovers, track 2: ticks, track 3: whooshes, track 4: pops, track 5: dings
  segments.forEach((seg, i) => {
    const audioSrc = ctx.localAudio[seg.q.id];
    if (audioSrc) {
      clips.push(
        `<audio id="vo-${i}" class="clip" src="${audioSrc}" data-start="${n(seg.voStart)}" data-track-index="1" data-volume="1"></audio>`
      );
    }
    clips.push(
      `<audio id="tick-${i}" class="clip" src="assets/sfx/tick.wav" data-start="${n(seg.tickStart)}" data-duration="${n(Math.min(seg.q.tickSeconds, 13.5))}" data-track-index="2" data-volume="${project.settings.tickVolume}"></audio>`
    );
    clips.push(
      `<audio id="whoosh-${i}" class="clip" src="assets/sfx/whoosh.wav" data-start="${n(seg.start)}" data-track-index="3" data-volume="0.5"></audio>`
    );
    clips.push(
      `<audio id="pop-a-${i}" class="clip" src="assets/sfx/pop.wav" data-start="${n(seg.start + 0.1)}" data-track-index="4" data-volume="0.5"></audio>`,
      `<audio id="pop-b-${i}" class="clip" src="assets/sfx/pop.wav" data-start="${n(seg.bReveal)}" data-track-index="4" data-volume="0.5"></audio>`
    );
    if (seg.q.showPercents) {
      clips.push(
        `<audio id="ding-${i}" class="clip" src="assets/sfx/ding.wav" data-start="${n(seg.percentTime)}" data-track-index="5" data-volume="0.55"></audio>`
      );
    }
  });
  if (ctx.musicRel) {
    clips.push(
      `<audio id="music" class="clip" src="${ctx.musicRel}" data-start="0" data-duration="${n(total)}" data-track-index="6" data-volume="${project.settings.musicVolume}"></audio>`
    );
  }

  // ---- visual clips (tracks 10..15, reused across sequential questions) ----
  segments.forEach((seg, i) => {
    const q = seg.q;
    const imgA = ctx.localImg[`${q.id}-a`] ?? "";
    const imgB = ctx.localImg[`${q.id}-b`] ?? "";
    const capEndA = q.showPercents ? seg.percentTime : seg.end;
    const dur = (from: number, to: number) => n(Math.max(0.1, to - from));

    // Option A (top half): image then caption below it.
    clips.push(
      `<div id="qa-img-${i}" class="clip opt-img top" data-start="${n(seg.start)}" data-duration="${dur(seg.start, seg.end)}" data-track-index="10">${imgTag(imgA, q.optionA.text)}</div>`,
      `<h2 id="qa-cap-${i}" class="clip caption cap-top" data-start="${n(seg.start)}" data-duration="${dur(seg.start, capEndA)}" data-track-index="11">${esc(q.optionA.text)}</h2>`
    );
    // Option B (bottom half): caption above image.
    clips.push(
      `<h2 id="qb-cap-${i}" class="clip caption cap-bottom" data-start="${n(seg.bReveal)}" data-duration="${dur(seg.bReveal, capEndA)}" data-track-index="12">${esc(q.optionB.text)}</h2>`,
      `<div id="qb-img-${i}" class="clip opt-img bottom" data-start="${n(seg.bReveal)}" data-duration="${dur(seg.bReveal, seg.end)}" data-track-index="13">${imgTag(imgB, q.optionB.text)}</div>`
    );
    // Countdown ring around the ИЛИ badge (like the reference videos).
    clips.push(
      `<div id="ring-${i}" class="clip timer-ring" data-start="${n(seg.tickStart)}" data-duration="${dur(seg.tickStart, seg.tickStart + q.tickSeconds)}" data-track-index="16"><svg width="244" height="244" viewBox="0 0 244 244"><circle class="ring-fg" cx="122" cy="122" r="${RING_R}" fill="none" stroke="#fff" stroke-width="14" stroke-linecap="round" stroke-dasharray="${n(RING_C)}" stroke-dashoffset="0" transform="rotate(-90 122 122)"/></svg></div>`
    );
    if (q.showPercents) {
      const pa = q.percentA;
      const pb = 100 - pa;
      const colorA = pa >= pb ? "win" : "lose";
      const colorB = pb > pa ? "win" : "lose";
      clips.push(
        `<div id="pct-a-${i}" class="clip percent pct-top ${colorA}" data-start="${n(seg.percentTime)}" data-duration="${dur(seg.percentTime, seg.end)}" data-track-index="14">${pa}%</div>`,
        `<div id="pct-b-${i}" class="clip percent pct-bottom ${colorB}" data-start="${n(seg.percentTime)}" data-duration="${dur(seg.percentTime, seg.end)}" data-track-index="15">${pb}%</div>`
      );
    }

    // ---- GSAP entrance/exit animations ----
    anims.push(
      `tl.from("#qa-img-${i}", { x: ${W}, duration: 0.45, ease: "power3.out" }, ${n(seg.start)});`,
      `tl.from("#qa-cap-${i}", { scale: 0.4, opacity: 0, duration: 0.35, ease: "back.out(2.2)" }, ${n(seg.start + 0.1)});`,
      `tl.from("#qb-cap-${i}", { scale: 0.4, opacity: 0, duration: 0.35, ease: "back.out(2.2)" }, ${n(seg.bReveal)});`,
      `tl.from("#qb-img-${i}", { x: -${W}, duration: 0.45, ease: "power3.out" }, ${n(seg.bReveal)});`,
      // Countdown ring around the ИЛИ badge during the ticking phase.
      `tl.fromTo("#ring-${i} .ring-fg", { strokeDashoffset: 0 }, { strokeDashoffset: ${n(RING_C)}, duration: ${n(Math.max(0.5, seg.q.tickSeconds))}, ease: "none" }, ${n(seg.tickStart)});`,
      // Slide out at the end of the segment.
      `tl.to("#qa-img-${i}", { x: -${W}, duration: 0.3, ease: "power2.in" }, ${n(seg.end - 0.3)});`,
      `tl.to("#qb-img-${i}", { x: ${W}, duration: 0.3, ease: "power2.in" }, ${n(seg.end - 0.3)});`
    );
    if (q.showPercents) {
      anims.push(
        `tl.from("#pct-a-${i}", { scale: 0, duration: 0.4, ease: "back.out(2.5)" }, ${n(seg.percentTime)});`,
        `tl.from("#pct-b-${i}", { scale: 0, duration: 0.4, ease: "back.out(2.5)" }, ${n(seg.percentTime + 0.08)});`
      );
    }
  });

  const handle = project.settings.handle?.trim() ?? "";

  return `<!DOCTYPE html>
<html data-composition-variables='[{"id":"handle","type":"string","label":"Watermark handle","default":${JSON.stringify(handle)}}]'>
<head>
<meta charset="utf-8" />
<title>${esc(project.title)}</title>
${ctx.gsapTag}
<style>
  html, body { margin: 0; padding: 0; background: #000; }
  @font-face {
    font-family: "Montserrat"; font-style: normal; font-weight: 900;
    src: url("assets/fonts/montserrat-900-cyrillic.woff2") format("woff2");
    unicode-range: U+0301, U+0400-045F, U+0490-0491, U+04B0-04B1, U+2116;
  }
  @font-face {
    font-family: "Montserrat"; font-style: normal; font-weight: 900;
    src: url("assets/fonts/montserrat-900-latin.woff2") format("woff2");
    unicode-range: U+0000-00FF, U+2000-206F;
  }
  #root {
    position: relative; width: ${W}px; height: ${H}px; overflow: hidden;
    font-family: "Montserrat", "Arial Black", sans-serif; font-weight: 900;
  }
  .half { position: absolute; left: 0; width: 100%; height: 50%; }
  .half.red  { top: 0;   background: linear-gradient(180deg, #f4485e 0%, #d92645 100%); }
  .half.blue { top: 50%; background: linear-gradient(180deg, #52a9ec 0%, #3a86d4 100%); }
  .divider {
    position: absolute; top: calc(50% - 8px); left: 0; width: 100%; height: 16px;
    background: #000; z-index: 30;
  }
  .ili-badge {
    position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
    width: 190px; height: 190px; border-radius: 50%; background: #000;
    color: #fff; display: flex; align-items: center; justify-content: center;
    font-size: 52px; font-weight: 900; z-index: 31; letter-spacing: 1px;
  }
  .opt-img {
    position: absolute; left: 50%; margin-left: -440px; width: 880px; height: 600px;
    z-index: 10; border-radius: 10px; overflow: hidden;
  }
  .opt-img.top { top: 56px; }
  .opt-img.bottom { top: ${H - 56 - 600}px; }
  .opt-img img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .opt-img .placeholder {
    width: 100%; height: 100%; display: flex; align-items: center; justify-content: center;
    background: rgba(0,0,0,0.25); color: #fff; font-size: 40px; font-weight: 800;
    text-align: center; padding: 20px; box-sizing: border-box;
  }
  .caption {
    position: absolute; left: 5%; width: 90%; margin: 0; z-index: 20;
    color: #fff; font-size: 64px; line-height: 1.15; font-weight: 900; text-align: center;
    -webkit-text-stroke: 14px #000; paint-order: stroke fill;
  }
  /* Same distance from each image: image edge is at 624px from its screen edge,
     captions sit 26px from the image on both halves. */
  .cap-top { top: 680px; }
  .cap-bottom { bottom: 680px; }
  .percent {
    position: absolute; left: 0; width: 100%; margin: 0; z-index: 21;
    font-size: 150px; font-weight: 900; text-align: center; line-height: 1;
    -webkit-text-stroke: 16px #000; paint-order: stroke fill;
  }
  .percent.win { color: #2bff4f; }
  .percent.lose { color: #ff2b2b; }
  .pct-top { top: 668px; }
  .pct-bottom { bottom: 668px; }
  .timer-ring {
    position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
    width: 244px; height: 244px; z-index: 32;
  }
  .watermark {
    position: absolute; bottom: 28px; left: 0; width: 100%; text-align: center;
    color: rgba(255,255,255,0.85); font-size: 34px; font-weight: 700; z-index: 40;
    text-shadow: 2px 2px 0 rgba(0,0,0,0.6);
  }
</style>
</head>
<body>
<div id="root" data-composition-id="root" data-start="0" data-width="${W}" data-height="${H}">
  <div class="half red"></div>
  <div class="half blue"></div>
  <div class="divider"></div>
  <div class="ili-badge">ИЛИ</div>
  <div class="watermark" id="watermark">${esc(handle)}</div>

  ${clips.join("\n  ")}

  <script>
    // Watermark via Hyperframes variables (overridable at render time).
    try {
      const vars = (window.__hyperframes && window.__hyperframes.getVariables)
        ? window.__hyperframes.getVariables() : null;
      if (vars && typeof vars.handle === "string" && vars.handle.length) {
        document.getElementById("watermark").textContent = vars.handle;
      }
    } catch (e) { /* plain-browser preview */ }

    const tl = gsap.timeline({ paused: true });
    ${anims.join("\n    ")}
    // Extend the timeline to the full composition duration.
    tl.set({}, {}, ${n(total)});
    window.__timelines = window.__timelines || {};
    window.__timelines["root"] = tl;
  </script>
</div>
<script>
  // Browser-only preview shim (Hyperframes renderers ignore this).
  if (new URLSearchParams(location.search).has("preview")) {
    const s = document.createElement("script");
    s.src = "assets/preview.js";
    document.body.appendChild(s);
  }
</script>
</body>
</html>
`;
}

function imgTag(src: string, alt: string): string {
  if (!src) return `<div class="placeholder">${esc(alt)}</div>`;
  return `<img src="${src}" alt="${esc(alt)}" />`;
}

// Minimal in-browser preview driver: emulates clip visibility from data
// attributes, drives the GSAP timeline and plays audio clips. Approximate
// sync — good enough for editing; final timing comes from the renderer.
const PREVIEW_JS = `(function () {
  const root = document.getElementById("root");
  const tl = (window.__timelines || {})["root"];
  if (!root || !tl) return;
  const dur = tl.duration();

  const clips = Array.from(root.querySelectorAll(".clip")).map((el) => ({
    el,
    start: parseFloat(el.dataset.start || "0"),
    duration: el.dataset.duration ? parseFloat(el.dataset.duration) : null,
    isAudio: el.tagName === "AUDIO",
    volume: parseFloat(el.dataset.volume || "1"),
  }));
  for (const c of clips) {
    if (c.isAudio) { c.el.preload = "auto"; c.el.volume = Math.min(1, c.volume); }
  }

  // Scale the 1080x1920 canvas to fit the window.
  function fit() {
    const k = Math.min(window.innerWidth / ${W}, (window.innerHeight - 70) / ${H});
    root.style.transformOrigin = "top left";
    root.style.transform = "scale(" + k + ")";
  }
  window.addEventListener("resize", fit); fit();

  // Controls bar.
  const bar = document.createElement("div");
  bar.style.cssText = "position:fixed;bottom:0;left:0;right:0;height:70px;background:#111;display:flex;align-items:center;gap:12px;padding:0 16px;z-index:9999;font-family:sans-serif;box-sizing:border-box";
  bar.innerHTML = '<button id="pv-play" style="font-size:22px;width:48px;height:44px;border-radius:8px;border:none;background:#2bff4f;cursor:pointer">▶</button>' +
    '<input id="pv-seek" type="range" min="0" max="' + dur + '" step="0.05" value="0" style="flex:1">' +
    '<span id="pv-time" style="color:#fff;font-size:14px;min-width:90px;text-align:right"></span>';
  document.body.appendChild(bar);
  const playBtn = bar.querySelector("#pv-play");
  const seek = bar.querySelector("#pv-seek");
  const timeEl = bar.querySelector("#pv-time");

  let playing = false;
  let t = 0;
  let last = null;

  function applyTime(time, scrub) {
    t = Math.max(0, Math.min(dur, time));
    tl.seek(t, false);
    for (const c of clips) {
      const end = c.duration != null ? c.start + c.duration : (c.isAudio ? c.start + (c.el.duration || 9999) : dur);
      const active = t >= c.start && t < end;
      if (!c.isAudio) {
        c.el.style.visibility = active ? "visible" : "hidden";
      } else {
        if (active && playing && !scrub) {
          const offset = t - c.start;
          if (c.el.paused) {
            try { c.el.currentTime = offset; c.el.play().catch(function(){}); } catch (e) {}
          } else if (Math.abs(c.el.currentTime - offset) > 0.35) {
            c.el.currentTime = offset;
          }
        } else if (!c.el.paused) {
          c.el.pause();
        }
      }
    }
    seek.value = String(t);
    timeEl.textContent = t.toFixed(1) + "s / " + dur.toFixed(1) + "s";
  }

  function loop(ts) {
    if (playing) {
      if (last != null) t += (ts - last) / 1000;
      last = ts;
      if (t >= dur) { playing = false; playBtn.textContent = "▶"; t = dur; }
      applyTime(t, false);
    } else { last = ts; }
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  playBtn.addEventListener("click", function () {
    playing = !playing;
    playBtn.textContent = playing ? "❚❚" : "▶";
    if (!playing) for (const c of clips) if (c.isAudio) c.el.pause();
    if (playing && t >= dur) t = 0;
  });
  seek.addEventListener("input", function () {
    playing = false; playBtn.textContent = "▶";
    for (const c of clips) if (c.isAudio) c.el.pause();
    applyTime(parseFloat(seek.value), true);
  });

  applyTime(0, true);
})();
`;
