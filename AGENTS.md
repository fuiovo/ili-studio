# AGENTS.md

Guidance for AI agents working in this repo.

## What this is

Next.js (App Router, TS) app that generates Russian "Что выберешь?" choice videos:
DeepSeek script → Pexels/Openverse images → ElevenLabs TTS (Adam, with
character timestamps) → HeyGen Hyperframes HTML composition → MP4 render
(HeyGen API or local `npx hyperframes render`).

## Hard rules

- **No Gemini API and no OpenAI API** — the owner explicitly removed both. Script gen uses DeepSeek (`deepseek-v4-pro`, OpenAI-compatible endpoint at api.deepseek.com).
- API keys are pasted into the UI and forwarded per-request; never persist them
  server-side or commit them.
- `public/generated/` is runtime output and gitignored — never commit it.
- Composition output must stay Hyperframes-compliant:
  - timed elements need `class="clip"` + `data-start`/`data-duration`/`data-track-index`;
  - clips on the same track must not overlap;
  - GSAP timeline registered as `window.__timelines["root"]` (paused), extended
    with `tl.set({}, {}, TOTAL)`;
  - scripts must never play/pause/seek media or toggle clip visibility
    (the `assets/preview.js` shim does this only behind `?preview=1`, which
    renderers never pass).

## Key timing logic

- `computeSegments()` in `src/lib/composition.ts` is the single source of truth
  for per-question timing (option B reveals at the spoken "или" from ElevenLabs
  alignment; ticking phase after voiceover; percent reveal at 55% of ticking).
- If you change `voiceText`, audio is invalidated (`q.audio = undefined`) and
  must be regenerated.

## Checks

```bash
npm run lint && npm run typecheck && npm run build
```
