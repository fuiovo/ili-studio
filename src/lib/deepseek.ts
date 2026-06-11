// DeepSeek script generation for Russian "Что выберешь?" choice videos.

import { DEFAULT_TICK_SECONDS, Question } from "./types";

const DEEPSEEK_URL = "https://api.deepseek.com/chat/completions";
export const DEFAULT_SCRIPT_MODEL = "deepseek-v4-pro";

const SYSTEM_PROMPT = `Ты — сценарист вирусных русскоязычных TikTok-видео в формате "Что выберешь?" (красное или синее).
Каждый вопрос — это выбор между двумя вариантами, который зачитывается голосом: "<вариант А> или <вариант Б>?"

Правила стиля (выведены из реальных вирусных скриптов):
1. Разговорный язык, сленг, аппетитные/гиперболизированные описания ("сочнейшие хинкали", "наваристый бульон с чесночком").
2. Миксуй категории: вкусная еда против вкусной еды; приятное против неловкого; абсурдные дилеммы ("месяц без мяса или месяц без шоколада").
3. Обязательно включи 1-2 интерактивных вопроса-залипалки, например:
   - "...или провести ночь в заброшке с вторым человеком из 'Поделиться в Telegram'?"
   - "Быть всегда бедным или быть всегда богатым, но забыть первого человека из 'Поделиться в Telegram'?"
   - "Разбей свой телефон или поставь лайк этому видео" (CTA — пометь kind: "cta")
   - "Пиши коммент, если выбрал..."
4. Один вопрос может быть длинным и детальным (как "съесть аппетитный холодец из наваристого бульона с нежным мясом, чесночком и душистым перцем... или съесть мандарин с кожурой") — контраст длинного вкусного описания и короткой дичи очень смешной.
5. caption (text) — короткая версия для экрана (до 6-7 слов), voiceText — полная фраза для озвучки, заканчивается "?".
6. imageQuery — короткий запрос на АНГЛИЙСКОМ для поиска фото варианта (например "pancakes with sour cream", "khinkali dumplings").
7. Для CTA-вопросов про лайк используй imageQuery вида "broken smartphone screen" / "thumbs up like icon 3d".
8. Никакой жести 18+, ничего политического. Лёгкая дичь и кринж — можно, это формат.

Ответ — строго JSON-объект вида:
{"questions": [{"optionA": {"text": "...", "imageQuery": "..."}, "optionB": {"text": "...", "imageQuery": "..."}, "voiceText": "...", "kind": "normal" | "cta", "percentA": 65}]}
percentA — твоя оценка, сколько процентов зрителей выберут вариант А (30-85).`;

interface RawQuestion {
  optionA: { text: string; imageQuery: string };
  optionB: { text: string; imageQuery: string };
  voiceText: string;
  kind?: "normal" | "cta";
  percentA?: number;
}

export async function generateScript(
  apiKey: string,
  topic: string,
  count: number,
  existing?: string[],
  model: string = DEFAULT_SCRIPT_MODEL
): Promise<Question[]> {
  const avoid =
    existing && existing.length
      ? `\n\nУже использованные вопросы (НЕ повторяй их):\n${existing.join("\n")}`
      : "";
  const userPrompt = `Сгенерируй ${count} вопросов. Тематика/пожелания: ${topic}.${avoid}`;

  const res = await fetch(DEEPSEEK_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 1.0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`DeepSeek error ${res.status}: ${body.slice(0, 500)}`);
  }

  const data = await res.json();
  const text: string | undefined = data?.choices?.[0]?.message?.content;
  if (!text) throw new Error("DeepSeek returned an empty response");

  let parsed: RawQuestion[];
  try {
    const obj = JSON.parse(text);
    parsed = Array.isArray(obj) ? obj : obj.questions;
  } catch {
    const match = text.match(/\[[\s\S]*\]/);
    if (!match) throw new Error("Could not parse DeepSeek JSON output");
    parsed = JSON.parse(match[0]);
  }
  if (!Array.isArray(parsed)) throw new Error("Unexpected DeepSeek output shape");

  return parsed.map((q, i) => ({
    id: `q-${Date.now()}-${i}`,
    optionA: { text: q.optionA.text, imageQuery: q.optionA.imageQuery },
    optionB: { text: q.optionB.text, imageQuery: q.optionB.imageQuery },
    voiceText: q.voiceText,
    kind: q.kind === "cta" ? "cta" : "normal",
    showPercents: q.kind !== "cta",
    percentA: clampPercent(q.percentA),
    tickSeconds: DEFAULT_TICK_SECONDS,
  }));
}

function clampPercent(p: number | undefined): number {
  if (typeof p !== "number" || Number.isNaN(p))
    return 50 + Math.floor(Math.random() * 30);
  return Math.min(92, Math.max(8, Math.round(p)));
}
