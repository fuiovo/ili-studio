// Image sourcing: Pexels search (key), Openverse search (keyless fallback),
// for the two options of each question.

export interface ImageCandidate {
  /** Direct image URL (or data: URL for generated images). */
  src: string;
  sourceUrl?: string;
}

export async function searchPexels(
  apiKey: string,
  query: string,
  perPage = 6
): Promise<ImageCandidate[]> {
  const res = await fetch(
    `https://api.pexels.com/v1/search?query=${encodeURIComponent(
      query
    )}&per_page=${perPage}&orientation=landscape`,
    { headers: { Authorization: apiKey } }
  );
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Pexels error ${res.status}: ${body.slice(0, 300)}`);
  }
  const data = await res.json();
  type PexelsPhoto = { src: { large: string }; url: string };
  return ((data.photos ?? []) as PexelsPhoto[]).map((p) => ({
    src: p.src.large,
    sourceUrl: p.url,
  }));
}

export async function searchOpenverse(
  query: string,
  perPage = 6
): Promise<ImageCandidate[]> {
  const res = await fetch(
    `https://api.openverse.org/v1/images/?q=${encodeURIComponent(
      query
    )}&page_size=${perPage}&mature=false&aspect_ratio=wide`,
    { headers: { "User-Agent": "ili-studio/0.1" } }
  );
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Openverse error ${res.status}: ${body.slice(0, 300)}`);
  }
  const data = await res.json();
  type OvImage = { url: string; foreign_landing_url?: string };
  return ((data.results ?? []) as OvImage[]).map((r) => ({
    src: r.url,
    sourceUrl: r.foreign_landing_url,
  }));
}

/** Download a remote image and return its bytes plus a file extension guess. */
export async function downloadImage(
  url: string
): Promise<{ bytes: Buffer; ext: string }> {
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (ili-studio image fetcher)" },
  });
  if (!res.ok) throw new Error(`Image download failed ${res.status}: ${url}`);
  const ct = res.headers.get("content-type") ?? "";
  const ext = ct.includes("png")
    ? "png"
    : ct.includes("webp")
      ? "webp"
      : "jpg";
  const bytes = Buffer.from(await res.arrayBuffer());
  return { bytes, ext };
}
