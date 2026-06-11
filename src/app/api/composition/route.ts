import { NextRequest, NextResponse } from "next/server";
import { buildComposition } from "@/lib/composition";
import { zipDirectory } from "@/lib/zip";
import { loadProject, saveProject } from "@/lib/storage";

export const runtime = "nodejs";

/**
 * POST /api/composition — build the Hyperframes bundle.
 * body: { projectId }
 */
export async function POST(req: NextRequest) {
  try {
    const { projectId } = await req.json();
    const project = await loadProject(projectId);
    if (!project) {
      return NextResponse.json({ error: "Проект не найден" }, { status: 404 });
    }
    if (!project.questions.length) {
      return NextResponse.json(
        { error: "Сначала сгенерируй сценарий" },
        { status: 400 }
      );
    }
    const result = await buildComposition(project);
    project.composition = {
      dir: result.publicDir,
      builtAt: new Date().toISOString(),
      totalDuration: result.totalDuration,
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

/**
 * GET /api/composition?projectId=x — download the bundle as a zip
 * (ready for `npx hyperframes render` or manual HeyGen upload).
 */
export async function GET(req: NextRequest) {
  try {
    const projectId = req.nextUrl.searchParams.get("projectId") ?? "";
    const project = await loadProject(projectId);
    if (!project?.composition) {
      return NextResponse.json(
        { error: "Композиция ещё не собрана" },
        { status: 404 }
      );
    }
    const { projectDir } = await import("@/lib/storage");
    const path = await import("path");
    const bundleDir = path.join(projectDir(project.id), "bundle");
    const zip = await zipDirectory(bundleDir);
    return new NextResponse(new Uint8Array(zip), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${project.id}-hyperframes.zip"`,
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
