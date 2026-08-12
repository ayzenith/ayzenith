"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/server/auth";
import { logActivity } from "@/server/activity";
import {
  createUser,
  emailExists,
  setUserActive,
  updateUserRole,
  getUserById,
  countActiveSuperAdmins,
} from "@/server/users";
import { canManageUsers } from "@/lib/auth/roles";

/**
 * User-management mutations. Super-Admin only. Guards protect the "last active
 * Super Admin" invariant and stop an admin from locking themselves out.
 */

const ROLES = ["SUPER_ADMIN", "ADMIN", "EDITOR"] as const;

const createSchema = z.object({
  name: z.string().trim().min(1, "Ad gerekli.").max(120),
  email: z.string().trim().email("Geçerli bir e-posta girin.").max(200),
  role: z.enum(ROLES),
  password: z.string().min(8, "Şifre en az 8 karakter olmalı.").max(200),
});

export type CreateUserState = { error?: string; ok?: boolean };

async function requireManager() {
  const user = await getCurrentUser();
  if (!user || !canManageUsers(user.role)) return null;
  return user;
}

export async function createUserAction(
  _prev: CreateUserState,
  formData: FormData,
): Promise<CreateUserState> {
  const actor = await requireManager();
  if (!actor) return { error: "Bu işlem için yetkiniz yok." };

  const parsed = createSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    role: formData.get("role"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Form doğrulanamadı." };
  }
  const data = parsed.data;

  if (await emailExists(data.email)) {
    return { error: "Bu e-posta zaten kayıtlı." };
  }

  const created = await createUser(data);
  await logActivity({
    userId: actor.id,
    action: "user.create",
    entity: "user",
    entityId: created.id,
    summary: `Kullanıcı eklendi: ${created.email} (${created.role})`,
  });
  revalidatePath("/admin/users");
  return { ok: true };
}

export async function setUserActiveAction(formData: FormData): Promise<void> {
  const actor = await requireManager();
  if (!actor) return;
  const id = (formData.get("id") as string | null)?.trim();
  const active = (formData.get("active") as string | null) === "true";
  if (!id) return;

  // Never deactivate yourself, and never remove the last active Super Admin.
  if (id === actor.id) return;
  if (!active) {
    const target = await getUserById(id);
    if (target?.role === "SUPER_ADMIN" && (await countActiveSuperAdmins()) <= 1) return;
  }

  await setUserActive(id, active);
  await logActivity({
    userId: actor.id,
    action: "user.active",
    entity: "user",
    entityId: id,
    summary: active ? "Kullanıcı etkinleştirildi" : "Kullanıcı devre dışı bırakıldı",
  });
  revalidatePath("/admin/users");
}

export async function setUserRoleAction(formData: FormData): Promise<void> {
  const actor = await requireManager();
  if (!actor) return;
  const id = (formData.get("id") as string | null)?.trim();
  const role = (formData.get("role") as string | null)?.trim();
  if (!id || !role || !ROLES.includes(role as (typeof ROLES)[number])) return;

  // Don't let an admin change their own role (self-lockout guard).
  if (id === actor.id) return;
  // Don't demote the last active Super Admin.
  const target = await getUserById(id);
  if (
    target?.role === "SUPER_ADMIN" &&
    role !== "SUPER_ADMIN" &&
    (await countActiveSuperAdmins()) <= 1
  ) {
    return;
  }

  await updateUserRole(id, role as (typeof ROLES)[number]);
  await logActivity({
    userId: actor.id,
    action: "user.role",
    entity: "user",
    entityId: id,
    summary: `Kullanıcı rolü değişti: ${role}`,
  });
  revalidatePath("/admin/users");
}
