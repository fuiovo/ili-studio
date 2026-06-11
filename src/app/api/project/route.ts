import { NextRequest, NextResponse } from "next/server";
import {
  listProjects,
  loadProject,
  saveProject,
  deleteProject,
} from "@/lib/storage";
import { DEFAULT_SETTINGS, Project } from "@/lib/types";

export const runtime = "nodejs";

/** GET /api/project — list all; GET /api/project?id=x — load one. */
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (id) {
    const project = await loadProject(id);
    if (!project) {
      return NextResponse.json({ error: "Проект не найден" }, { status: 404 });
    }
    return NextResponse.json({ project });
  }
  return NextResponse.json({ projects: await listProjects() });
}

/**
 * POST /api/project
 * body: { action: "create", title? } | { action: "update", project } |
 *       { action: "delete", id }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    if (body.action === "create") {
      const now = new Date().toISOString();
      const project: Project = {
        id: `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
        title: body.title || `Что выберешь? ${new Date().toLocaleDateString("ru-RU")}`,
        createdAt: now,
        updatedAt: now,
        settings: { ...DEFAULT_SETTINGS },
        questions: [],
      };
      await saveProject(project);
      return NextResponse.json({ project });
    }

    if (body.action === "update") {
      const incoming = body.project as Project;
      const current = await loadProject(incoming.id);
      if (!current) {
        return NextResponse.json({ error: "Проект не найден" }, { status: 404 });
      }
      // Invalidate composition when content changed.
      const contentChanged =
        JSON.stringify(current.questions) !== JSON.stringify(incoming.questions) ||
        JSON.stringify(current.settings) !== JSON.stringify(incoming.settings);
      if (contentChanged) incoming.composition = undefined;
      await saveProject(incoming);
      return NextResponse.json({ project: incoming });
    }

    if (body.action === "delete") {
      await deleteProject(body.id);
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Неизвестное действие" }, { status: 400 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
