import { NextRequest, NextResponse } from "next/server";
import { synthesizeQuestion } from "@/lib/elevenlabs";
import { loadProject, saveProject, saveAsset } from "@/lib/storage";

export const runtime = "nodejs";

/**
 * POST /api/tts
 * body: { projectId, apiKey, questionId? }
 * Generates Adam voiceovers (with word timestamps) for all questions missing
 * audio, or regenerates a single question when questionId is provided.
 */
export async function POST(req: NextRequest) {
  try {
    const { projectId, apiKey, questionId } = await req.json();
    if (!apiKey) {
      return NextResponse.json(
        { error: "Нужен ElevenLabs API ключ" },
        { status: 400 }
      );
    }
    const project = await loadProject(projectId);
    if (!project) {
      return NextResponse.json({ error: "Проект не найден" }, { status: 404 });
    }

    const targets = project.questions.filter((q) =>
      questionId ? q.id === questionId : !q.audio
    );
    if (!targets.length) {
      return NextResponse.json({ project, generated: 0 });
    }

    const errors: string[] = [];
    let generated = 0;
    for (const q of targets) {
      try {
        const r = await synthesizeQuestion(apiKey, q.voiceText);
        const src = await saveAsset(project.id, `audio/${q.id}.mp3`, r.audio);
        q.audio = {
          src,
          duration: r.duration,
          iliTime: r.iliTime,
        };
        generated++;
      } catch (e) {
        errors.push(
          `${q.voiceText.slice(0, 40)}…: ${e instanceof Error ? e.message : String(e)}`
        );
      }
    }
    project.composition = undefined;
    await saveProject(project);
    return NextResponse.json({ project, generated, errors });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
