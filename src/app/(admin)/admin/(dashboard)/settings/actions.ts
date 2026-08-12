"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/server/auth";
import { canManageSettings } from "@/lib/auth/roles";
import { logActivity } from "@/server/activity";
import { updateSiteSettings } from "@/server/settings";

/** Site-settings mutation. Admin+ only. */

const optionalUrl = z
  .string()
  .trim()
  .max(300)
  .refine((v) => v === "" || /^https?:\/\//i.test(v), "Bağlantı http(s):// ile başlamalı.");

const schema = z.object({
  companyEmail: z.string().trim().max(200),
  companyPhone: z.string().trim().max(60),
  companyLocation: z.string().trim().max(200),
  hoursShort: z.string().trim().max(120),
  hoursLong: z.string().trim().max(200),
  linkedin: optionalUrl,
  instagram: optionalUrl,
  x: optionalUrl,
  youtube: optionalUrl,
  facebook: optionalUrl,
  ga4Id: z.string().trim().max(40),
  clarityId: z.string().trim().max(40),
});

export type SettingsState = { error?: string; ok?: boolean };

export async function updateSettingsAction(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const user = await getCurrentUser();
  if (!user || !canManageSettings(user.role)) {
    return { error: "Bu işlem için yetkiniz yok." };
  }

  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Form doğrulanamadı." };
  }

  await updateSiteSettings(parsed.data);
  await logActivity({
    userId: user.id,
    action: "settings.update",
    entity: "settings",
    summary: "Site ayarları güncellendi",
  });

  // Footer + contact info live in the shared layout — refresh the whole tree so
  // the change shows across the public site immediately.
  revalidatePath("/", "layout");
  return { ok: true };
}
