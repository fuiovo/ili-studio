// ElevenLabs TTS with character timestamps (Adam voice, Russian via multilingual v2).

export const ADAM_VOICE_ID = "pNInz6obpgDQGcFmaJgB";

export interface TtsResult {
  /** Raw MP3 bytes. */
  audio: Buffer;
  /** Total audio duration in seconds (from the last character timestamp). */
  duration: number;
  /** Second at which the standalone word "или" starts; option B reveal moment. */
  iliTime: number;
}

interface Alignment {
  characters: string[];
  character_start_times_seconds: number[];
  character_end_times_seconds: number[];
}

export async function synthesizeQuestion(
  apiKey: string,
  text: string,
  voiceId: string = ADAM_VOICE_ID
): Promise<TtsResult> {
  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/with-timestamps?output_format=mp3_44100_128`,
    {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text,
        model_id: "eleven_multilingual_v2",
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
          style: 0.35,
          use_speaker_boost: true,
        },
      }),
    }
  );

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`ElevenLabs error ${res.status}: ${body.slice(0, 500)}`);
  }

  const data = (await res.json()) as {
    audio_base64: string;
    alignment: Alignment | null;
    normalized_alignment: Alignment | null;
  };

  const audio = Buffer.from(data.audio_base64, "base64");
  const alignment = data.alignment ?? data.normalized_alignment;

  let duration = 0;
  let iliTime = 0;
  if (alignment && alignment.characters.length > 0) {
    const ends = alignment.character_end_times_seconds;
    duration = ends[ends.length - 1] ?? 0;
    iliTime = findIliTime(text, alignment) ?? duration * 0.45;
  }

  return { audio, duration, iliTime };
}

/**
 * Find the start time of the standalone word "или" in the alignment.
 * The voiceText is "<A> или <B>?", so we look for " или " surrounded by spaces.
 * If the option A itself contains "или" we take the *last* match before the
 * midpoint heuristic fails — in practice the separator is the most central one.
 */
function findIliTime(text: string, alignment: Alignment): number | null {
  const lower = text.toLowerCase();
  const matches: number[] = [];
  const re = /(^|[\s,])или(\s)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(lower)) !== null) {
    matches.push(m.index + m[1].length);
  }
  if (matches.length === 0) return null;

  // Prefer the match closest to the middle of the sentence (the separator).
  const mid = lower.length / 2;
  const idx = matches.reduce((best, cur) =>
    Math.abs(cur - mid) < Math.abs(best - mid) ? cur : best
  );

  const starts = alignment.character_start_times_seconds;
  if (idx < starts.length) return starts[idx];
  return null;
}

/**
 * Parse MP3 duration server-side is unreliable without ffprobe; we trust the
 * alignment timestamps which ElevenLabs returns for the full audio.
 */
