import { NextRequest, NextResponse } from "next/server";
import { searchPexels, searchOpenverse, downloadImage } from "@/lib/images";
import { loadProject, saveProject, saveAsset } from "@/lib/storage";
import { ChoiceOption, Question } from "@/lib/types";

export const runtime = "nodejs";

/**
 * POST /api/images
 * Modes:
 *  - { projectId, action: "auto", provider, keys }            → fill all missing images
 *  - { projectId, action: "search", query, provider, keys }   → return candidates only
 *  - { projectId, action: "set", questionId, side, src, sourceUrl } → download & set image
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { projectId, action } = body;
    const keys = body.keys ?? {};

    if (action === "search") {
      const candidates = await search(body.query, body.provider, keys.pexels);
      return NextResponse.json({ candidates });
    }

    const project = await loadProject(projectId);
    if (!project) {
      return NextResponse.json({ error: "Проект не найден" }, { status: 404 });
    }

    if (action === "auto") {
      const provider = body.provider ?? project.settings.imageProvider;
      const errors: string[] = [];
      for (let i = 0; i < project.questions.length; i++) {
        const q = project.questions[i];
        for (const [side, opt] of [
          ["a", q.optionA],
          ["b", q.optionB],
        ] as const) {
          if (opt.image?.src) continue; // keep user choices
          try {
            await fillOption(project.id, q, side, opt, provider, keys);
          } catch (e) {
            errors.push(
              `${opt.text}: ${e instanceof Error ? e.message : String(e)}`
            );
          }
        }
      }
      project.composition = undefined;
      await saveProject(project);
      return NextResponse.json({ project, errors });
    }

    if (action === "set") {
      const { questionId, side, src, sourceUrl } = body;
      const q = project.questions.find((x) => x.id === questionId);
      if (!q) {
        return NextResponse.json({ error: "Вопрос не найден" }, { status: 404 });
      }
      const opt = side === "a" ? q.optionA : q.optionB;
      const { bytes, ext } = await downloadImage(src);
      const local = await saveAsset(
        project.id,
        `images/${q.id}-${side}.${ext}`,
        bytes
      );
      opt.image = {
        src: `${local}?v=${Date.now()}`,
        provider: "url",
        sourceUrl: sourceUrl ?? src,
        candidates: opt.image?.candidates,
      };
      project.composition = undefined;
      await saveProject(project);
      return NextResponse.json({ project });
    }

    return NextResponse.json({ error: "Неизвестное действие" }, { status: 400 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}

async function search(
  query: string,
  provider: string,
  pexelsKey?: string
): Promise<{ src: string; sourceUrl?: string }[]> {
  if (provider === "pexels" && pexelsKey) {
    const r = await searchPexels(pexelsKey, query);
    if (r.length) return r;
  }
  return searchOpenverse(query);
}

async function fillOption(
  projectId: string,
  q: Question,
  side: "a" | "b",
  opt: ChoiceOption,
  provider: string,
  keys: { pexels?: string }
): Promise<void> {
  const candidates = await search(opt.imageQuery, provider, keys.pexels);
  if (!candidates.length) throw new Error("Картинки не найдены");
  const top = candidates[0];
  const { bytes, ext } = await downloadImage(top.src);
  const local = await saveAsset(
    projectId,
    `images/${q.id}-${side}.${ext}`,
    bytes
  );
  opt.image = {
    src: `${local}?v=${Date.now()}`,
    provider: provider === "pexels" && keys.pexels ? "pexels" : "openverse",
    sourceUrl: top.sourceUrl,
    candidates: candidates.slice(0, 6),
  };
}
