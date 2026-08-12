/**
 * Media types + limits — client-safe (no server imports), shared by the Media
 * Library UI, the media picker and the server repository.
 */

export type MediaDTO = {
  id: string;
  name: string;
  url: string;
  path: string;
  mime: string;
  size: number;
  width: number | null;
  height: number | null;
  createdAt: Date;
};

export const MEDIA_BUCKET = "media";

/** 10 MB — matches the bucket's fileSizeLimit. */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export const ALLOWED_IMAGE_MIME: readonly string[] = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/avif",
  "image/gif",
  "image/svg+xml",
];

/** Human-readable file size, e.g. "2.4 MB". */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
