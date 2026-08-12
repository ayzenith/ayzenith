import { uploadMediaAction, type UploadResult } from "@/app/(admin)/admin/(dashboard)/media/actions";
import { ALLOWED_IMAGE_MIME, MAX_UPLOAD_BYTES } from "@/config/media";

/**
 * Client helper: send File(s) to the upload server action. Does a quick
 * client-side pre-check so obviously-wrong files fail fast before the round trip.
 */
export async function uploadFiles(files: File[]): Promise<UploadResult> {
  const valid = files.filter((f) => f.size > 0);
  if (valid.length === 0) return { ok: false, error: "Dosya seçilmedi." };

  for (const f of valid) {
    if (!ALLOWED_IMAGE_MIME.includes(f.type)) {
      return { ok: false, error: `"${f.name}" bir görsel değil. (PNG, JPG, WEBP, AVIF, GIF, SVG)` };
    }
    if (f.size > MAX_UPLOAD_BYTES) {
      return { ok: false, error: `"${f.name}" 10 MB sınırını aşıyor.` };
    }
  }

  const fd = new FormData();
  for (const f of valid) fd.append("file", f);
  return uploadMediaAction(fd);
}
