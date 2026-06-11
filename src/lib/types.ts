// Shared types for the ILI Studio pipeline.

export type ImageProvider = "pexels" | "openverse" | "openai";

export interface OptionImage {
  /** Public URL or local path (relative to /public) of the chosen image. */
  src: string;
  /** Where the image came from. */
  provider: ImageProvider | "upload" | "url";
  /** Attribution / source page when available. */
  sourceUrl?: string;
  /** Alternative candidates the user can swap to. */
  candidates?: { src: string; sourceUrl?: string }[];
}

export interface ChoiceOption {
  /** Caption text shown under/over the image, e.g. "Блинчики со сметаной". */
  text: string;
  /** Short search query / image-gen prompt for this option (the LLM fills this in). */
  imageQuery: string;
  image?: OptionImage;
}

export interface Question {
  id: string;
  optionA: ChoiceOption;
  optionB: ChoiceOption;
  /**
   * Full sentence the narrator reads, e.g.
   * "Блинчики со сметаной или блинчики с нутеллой?"
   * Editable independently from captions.
   */
  voiceText: string;
  /** Show the percentage reveal after the ticking phase. */
  showPercents: boolean;
  /** Percent for option A (option B gets 100 - percentA). */
  percentA: number;
  /** Seconds of ticking-clock "thinking time" after the voiceover. */
  tickSeconds: number;
  /** Special engagement question (like CTA / tag a friend / Telegram share). */
  kind: "normal" | "cta";
  /** Filled in after TTS generation. */
  audio?: {
    /** Path relative to /public, e.g. /generated/<id>/audio/q-0.mp3 */
    src: string;
    duration: number;
    /** Second at which the word "или" starts — option B reveal moment. */
    iliTime: number;
  };
}

export interface ProjectSettings {
  /** Number of questions to generate. */
  questionCount: number;
  /** Theme / topic prompt for the script model, e.g. "еда и абсурдные дилеммы". */
  topic: string;
  imageProvider: ImageProvider;
  /** TikTok handle shown as a small watermark (Hyperframes variable). */
  handle: string;
  /** Volume of the ticking clock, 0..1. */
  tickVolume: number;
  /** Optional background music file (relative to /public) and its volume. */
  musicSrc?: string;
  musicVolume: number;
}

export interface Project {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  settings: ProjectSettings;
  questions: Question[];
  /** Set after the composition bundle has been built. */
  composition?: {
    /** Path relative to /public of the bundle dir, e.g. /generated/<id>/bundle */
    dir: string;
    builtAt: string;
    totalDuration: number;
  };
  /** Last HeyGen render, if any. */
  render?: {
    renderId: string;
    status: "queued" | "rendering" | "completed" | "failed";
    videoUrl?: string;
    failureMessage?: string;
  };
}

export interface ApiKeys {
  openai?: string;
  elevenlabs?: string;
  heygen?: string;
  pexels?: string;
}

export const DEFAULT_SETTINGS: ProjectSettings = {
  questionCount: 8,
  topic: "еда, абсурдные дилеммы и интерактив с Telegram",
  imageProvider: "pexels",
  handle: "",
  tickVolume: 0.55,
  musicVolume: 0.12,
};

export const DEFAULT_TICK_SECONDS = 3.5;
