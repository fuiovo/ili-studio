import { NextRequest, NextResponse } from "next/server";
import path from "path";
import { submitRender, getRenderStatus } from "@/lib/heygen";
import { zipDirectory } from "@/lib/zip";
import { loadProject, saveProject, projectDir } from "@/lib/storage";

export const runtime = "nodejs";

/**
 * POST /api/render — zip the bundle and submit it to HeyGen Hyperframes.
 * body: { projectId, apiKey }
 */
export async function POST(req: NextRequest) {
  try {
    const { projectId, apiKey } = await req.json();
    if (!apiKey) {
      return NextResponse.json(
        { error: "Нужен HeyGen API ключ" },
        { status: 400 }
      );
    }
    const project = await loadProject(projectId);
    if (!project) {
      return NextResponse.json({ error: "Проект не найден" }, { status: 404 });
    }
    if (!project.composition) {
      return NextResponse.json(
        { error: "Сначала собери композицию" },
        { status: 400 }
      );
    }

    const bundleDir = path.join(projectDir(project.id), "bundle");
    const zip = await zipDirectory(bundleDir);
    const renderId = await submitRender(apiKey, zip.toString("base64"), {
      title: project.title,
      variables: project.settings.handle
        ? { handle: project.settings.handle }
        : {},
    });

    project.render = { renderId, status: "queued" };
    await saveProject(project);
    return NextResponse.json({ project });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}

/**
 * GET /api/render?projectId=x&apiKey=... — poll render status.
 * (HeyGen key is passed as a header to avoid logging.)
 */
export async function GET(req: NextRequest) {
  try {
    const projectId = req.nextUrl.searchParams.get("projectId") ?? "";
    const apiKey = req.headers.get("x-heygen-key") ?? "";
    const project = await loadProject(projectId);
    if (!project?.render) {
      return NextResponse.json({ error: "Рендер не запущен" }, { status: 404 });
    }
    if (!apiKey) {
      return NextResponse.json({ error: "Нужен HeyGen API ключ" }, { status: 400 });
    }
    const status = await getRenderStatus(apiKey, project.render.renderId);
    project.render = {
      renderId: status.renderId,
      status: status.status,
      videoUrl: status.videoUrl,
      failureMessage: status.failureMessage,
    };
    await saveProject(project);
    return NextResponse.json({ project });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
