import "server-only";

import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { uploadObject, deleteObject } from "@/lib/storage";
import {
  ALLOWED_IMAGE_MIME,
  MAX_UPLOAD_BYTES,
  type MediaDTO,
} from "@/config/media";

/**
 * Media repository — the only place that writes to Supabase Storage + the
 * MediaAsset table together, keeping the two in sync. The UI/actions call these.
 */

const EXT_BY_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/avif": "avif",
  "image/gif": "gif",
  "image/svg+xml": "svg",
};

function toDTO(row: {
  id: string;
  name: string;
  url: string;
  path: string;
  mime: string;
  size: number;
  width: number | null;
  height: number | null;
  createdAt: Date;
}): MediaDTO {
  return {
    id: row.id,
    name: row.name,
    url: row.url,
    path: row.path,
    mime: row.mime,
    size: row.size,
    width: row.width,
    height: row.height,
    createdAt: row.createdAt,
  };
}

/** List media, newest first, optionally filtered by a name query. */
export async function listMedia(query?: string): Promise<MediaDTO[]> {
  const q = query?.trim();
  const rows = await db.mediaAsset.findMany({
    where: q ? { name: { contains: q, mode: "insensitive" } } : undefined,
    orderBy: { createdAt: "desc" },
  });
  return rows.map(toDTO);
}

export type UploadInput = {
  bytes: Buffer;
  originalName: string;
  mime: string;
  userId?: string;
};

/** Validate, upload to storage, and record a MediaAsset. */
export async function createMediaFromUpload(input: UploadInput): Promise<MediaDTO> {
  const { bytes, originalName, mime, userId } = input;

  if (!ALLOWED_IMAGE_MIME.includes(mime)) {
    throw new Error("Yalnızca görsel dosyaları yüklenebilir (PNG, JPG, WEBP, AVIF, GIF, SVG).");
  }
  if (bytes.length === 0) throw new Error("Dosya boş.");
  if (bytes.length > MAX_UPLOAD_BYTES) throw new Error("Dosya 10 MB sınırını aşıyor.");

  const ext = EXT_BY_MIME[mime] ?? "bin";
  const path = `uploads/${randomUUID()}.${ext}`;
  const url = await uploadObject(path, bytes, mime);

  const cleanName = originalName.replace(/\.[^.]+$/, "").slice(0, 120) || "görsel";

  const row = await db.mediaAsset.create({
    data: {
      path,
      url,
      name: cleanName,
      mime,
      size: bytes.length,
      uploadedById: userId ?? null,
    },
  });
  return toDTO(row);
}

/** Rename the display label only (storage path is immutable). */
export async function renameMedia(id: string, name: string): Promise<void> {
  const clean = name.trim().slice(0, 120);
  if (!clean) return;
  await db.mediaAsset.update({ where: { id }, data: { name: clean } });
}

/** Delete both the DB row and the underlying storage object. */
export async function deleteMedia(id: string): Promise<void> {
  const row = await db.mediaAsset.findUnique({ where: { id } });
  if (!row) return;
  await deleteObject(row.path);
  await db.mediaAsset.delete({ where: { id } });
}

export async function countMedia(): Promise<number> {
  return db.mediaAsset.count();
}
