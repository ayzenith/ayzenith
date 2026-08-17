"use server";

import { revalidatePath } from "next/cache";
import type { ChannelType } from "@prisma/client";
import { requireUser } from "@/server/auth";
import { deleteChannelIfUnused, seedStarterChannels, upsertChannel } from "@/server/os/channels";
import { parseOptionalDecimal } from "@/server/os/money";

function s(fd: FormData, key: string): string | null {
  const v = fd.get(key);
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
}

export async function upsertChannelAction(fd: FormData): Promise<void> {
  await requireUser();
  const name = s(fd, "name");
  if (!name) throw new Error("Kanal adı zorunlu.");
  await upsertChannel({
    id: s(fd, "id") ?? undefined,
    name,
    type: (s(fd, "type") as ChannelType) ?? "OTHER",
    commissionRate: parseOptionalDecimal(s(fd, "commissionRate")),
    currency: s(fd, "currency") ?? "TRY",
    active: fd.get("active") !== "false",
  });
  revalidatePath("/os/channels");
}

export async function deleteChannelAction(fd: FormData): Promise<void> {
  await requireUser();
  const id = s(fd, "id");
  if (!id) return;
  await deleteChannelIfUnused(id);
  revalidatePath("/os/channels");
}

export async function seedStarterChannelsAction(): Promise<void> {
  await requireUser();
  await seedStarterChannels();
  revalidatePath("/os/channels");
}
