// HeyGen Hyperframes render API client.
// Docs: https://developers.heygen.com/hyperframes

const BASE = "https://api.heygen.com";

export interface RenderStatus {
  renderId: string;
  status: "queued" | "rendering" | "completed" | "failed";
  videoUrl?: string;
  thumbnailUrl?: string;
  failureMessage?: string;
}

export async function submitRender(
  apiKey: string,
  zipBase64: string,
  opts: { title: string; variables?: Record<string, string> }
): Promise<string> {
  const res = await fetch(`${BASE}/v3/hyperframes/renders`, {
    method: "POST",
    headers: { "x-api-key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      project: { type: "base64", base64: zipBase64 },
      fps: 30,
      quality: "standard",
      format: "mp4",
      resolution: "1080p",
      aspect_ratio: "9:16",
      composition: "index.html",
      variables: opts.variables ?? {},
      title: opts.title.slice(0, 500),
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`HeyGen error ${res.status}: ${body.slice(0, 500)}`);
  }
  const data = await res.json();
  const id = data?.data?.render_id;
  if (!id) throw new Error("HeyGen returned no render_id");
  return id;
}

export async function getRenderStatus(
  apiKey: string,
  renderId: string
): Promise<RenderStatus> {
  const res = await fetch(`${BASE}/v3/hyperframes/renders/${renderId}`, {
    headers: { "x-api-key": apiKey },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`HeyGen error ${res.status}: ${body.slice(0, 500)}`);
  }
  const d = (await res.json())?.data ?? {};
  return {
    renderId,
    status: d.status,
    videoUrl: d.video_url,
    thumbnailUrl: d.thumbnail_url,
    failureMessage: d.failure_message,
  };
}
