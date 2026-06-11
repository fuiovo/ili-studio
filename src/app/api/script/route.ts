import { NextRequest, NextResponse } from "next/server";
import { generateScript } from "@/lib/deepseek";
import { loadProject, saveProject } from "@/lib/storage";

export const runtime = "nodejs";

/**
 * POST /api/script
 * body: { projectId, apiKey, topic, count, mode: "replace" | "append", model? }
 * Generates questions with DeepSeek (deepseek-v4-pro) and stores them on the project.
 */
export async function POST(req: NextRequest) {
  try {
    const { projectId, apiKey, topic, count, mode, model } = await req.json();
    if (!apiKey) {
      return NextResponse.json({ error: "Нужен DeepSeek API ключ" }, { status: 400 });
    }
    const project = await loadProject(projectId);
    if (!project) {
      return NextResponse.json({ error: "Проект не найден" }, { status: 404 });
    }

    const existing =
      mode === "append" ? project.questions.map((q) => q.voiceText) : undefined;

    const questions = await generateScript(
      apiKey,
      topic || project.settings.topic,
      Math.min(Math.max(Number(count) || 8, 1), 20),
      existing,
      typeof model === "string" && model.trim() ? model.trim() : undefined
    );

    project.questions =
      mode === "append" ? [...project.questions, ...questions] : questions;
    project.settings.topic = topic || project.settings.topic;
    // Script changed — previous composition/render are stale.
    project.composition = undefined;
    project.render = undefined;
    await saveProject(project);

    return NextResponse.json({ project });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
