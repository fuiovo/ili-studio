// Zip a composition bundle directory (for HeyGen upload / user download).

import { promises as fs } from "fs";
import path from "path";
import JSZip from "jszip";

export async function zipDirectory(dir: string): Promise<Buffer> {
  const zip = new JSZip();
  await addDir(zip, dir, "");
  return zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });
}

async function addDir(zip: JSZip, root: string, rel: string): Promise<void> {
  const entries = await fs.readdir(path.join(root, rel), {
    withFileTypes: true,
  });
  for (const e of entries) {
    const childRel = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) {
      await addDir(zip, root, childRel);
    } else {
      const bytes = await fs.readFile(path.join(root, childRel));
      zip.file(childRel, bytes);
    }
  }
}
