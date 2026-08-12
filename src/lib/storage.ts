import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { MEDIA_BUCKET } from "@/config/media";

/**
 * Supabase Storage admin client — SERVER ONLY. Uses the service-role key, which
 * bypasses RLS, so it must never be imported into a Client Component. All media
 * uploads/deletes flow through the server (repository + actions); the browser
 * never talks to Supabase directly.
 */

let cached: SupabaseClient | null = null;

function client(): SupabaseClient {
  if (cached) return cached;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Supabase Storage is not configured (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).",
    );
  }
  cached = createClient(url, key, { auth: { persistSession: false } });
  return cached;
}

/** Upload bytes to the media bucket and return the public URL. */
export async function uploadObject(
  path: string,
  body: Buffer | Uint8Array,
  contentType: string,
): Promise<string> {
  const { error } = await client()
    .storage.from(MEDIA_BUCKET)
    .upload(path, body, { contentType, upsert: false });
  if (error) throw new Error(`Yükleme başarısız: ${error.message}`);
  return publicUrl(path);
}

/** Remove an object from the media bucket (best-effort — never throws). */
export async function deleteObject(path: string): Promise<void> {
  const { error } = await client().storage.from(MEDIA_BUCKET).remove([path]);
  if (error) console.error("storage.remove failed:", error.message);
}

/** Public URL for a stored object (bucket is public). */
export function publicUrl(path: string): string {
  return client().storage.from(MEDIA_BUCKET).getPublicUrl(path).data.publicUrl;
}
