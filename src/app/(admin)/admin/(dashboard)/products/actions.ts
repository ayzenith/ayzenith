"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/server/auth";
import { logActivity } from "@/server/activity";
import {
  createProduct,
  updateProduct,
  deleteProduct,
  setProductStatus,
  slugExists,
  type ProductWriteInput,
  type ProductStatusValue,
} from "@/server/products";

/**
 * Product mutations. The client editor serialises the whole product into a
 * single JSON `payload` field; here we validate it with zod, enforce slug
 * uniqueness, persist through the repository, write an audit entry, and refresh
 * the public pages so changes appear on the site immediately.
 */

const localizedString = z.object({
  en: z.string(),
  tr: z.string(),
  de: z.string(),
});
const localizedList = z.object({
  en: z.array(z.string()),
  tr: z.array(z.string()),
  de: z.array(z.string()),
});

const payloadSchema = z.object({
  slug: z
    .string()
    .trim()
    .min(1, "URL adı (slug) gerekli.")
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug yalnızca küçük harf, rakam ve tire içerebilir."),
  name: z.string().trim().min(1, "Ürün adı gerekli."),
  categoryKey: z.string().trim().min(1, "Kategori seçin."),
  status: z.enum(["DRAFT", "PUBLISHED", "HIDDEN"]),
  featured: z.boolean(),
  availability: z.enum(["in-stock", "limited", "coming-soon"]),
  badge: z.enum(["new", "bestseller", "featured"]).nullable(),
  image: z.string().trim().nullable(),
  gallery: z.array(z.string().trim().min(1)),
  shortDescription: localizedString,
  description: localizedString,
  features: localizedList,
  useCases: localizedList,
  specs: z.array(
    z.object({ label: localizedString, value: z.string().trim().min(1) }),
  ),
  marketplaces: z.record(z.string(), z.string().trim().url()).default({}),
  downloads: z
    .array(z.object({ label: localizedString, href: z.string().trim().min(1) }))
    .default([]),
});

export type ProductFormState = { error?: string; ok?: boolean };

function revalidatePublic() {
  // The public product routes are dynamic (revalidate = 0), but refresh their
  // cache entries explicitly so lists/sitemap reflect the change right away.
  revalidatePath("/products");
  revalidatePath("/[locale]/products", "page");
  revalidatePath("/sitemap.xml");
}

export async function saveProductAction(
  _prev: ProductFormState,
  formData: FormData,
): Promise<ProductFormState> {
  const user = await getCurrentUser();
  if (!user) return { error: "Oturum bulunamadı. Lütfen tekrar giriş yapın." };

  const id = (formData.get("id") as string | null)?.trim() || null;
  const raw = formData.get("payload");
  if (typeof raw !== "string") return { error: "Geçersiz form verisi." };

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return { error: "Form verisi çözümlenemedi." };
  }

  const parsed = payloadSchema.safeParse(json);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Form doğrulanamadı." };
  }
  const data = parsed.data;

  if (await slugExists(data.slug, id ?? undefined)) {
    return { error: `"${data.slug}" adresi başka bir ürün tarafından kullanılıyor.` };
  }

  // Strip empty gallery/spec/marketplace entries defensively.
  const input: ProductWriteInput = {
    slug: data.slug,
    name: data.name,
    categoryKey: data.categoryKey,
    status: data.status,
    featured: data.featured,
    availability: data.availability,
    badge: data.badge,
    image: data.image && data.image.length > 0 ? data.image : null,
    gallery: data.gallery,
    shortDescription: data.shortDescription,
    description: data.description,
    features: data.features,
    useCases: data.useCases,
    specs: data.specs,
    marketplaces: data.marketplaces,
    downloads: data.downloads,
  };

  try {
    if (id) {
      await updateProduct(id, input);
      await logActivity({
        userId: user.id,
        action: "product.update",
        entity: "product",
        entityId: id,
        summary: `Ürün güncellendi: ${input.name}`,
      });
    } else {
      const created = await createProduct(input);
      await logActivity({
        userId: user.id,
        action: "product.create",
        entity: "product",
        entityId: created.id,
        summary: `Ürün oluşturuldu: ${input.name}`,
      });
    }
  } catch {
    return { error: "Ürün kaydedilemedi. Lütfen tekrar deneyin." };
  }

  revalidatePublic();
  return { ok: true };
}

export async function setProductStatusAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;
  const id = (formData.get("id") as string | null)?.trim();
  const status = (formData.get("status") as string | null)?.trim() as
    | ProductStatusValue
    | undefined;
  if (!id || !status || !["DRAFT", "PUBLISHED", "HIDDEN"].includes(status)) return;

  await setProductStatus(id, status);
  await logActivity({
    userId: user.id,
    action: "product.status",
    entity: "product",
    entityId: id,
    summary: `Ürün durumu değişti: ${status}`,
  });
  revalidatePublic();
  revalidatePath("/admin/products");
}

export async function deleteProductAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;
  const id = (formData.get("id") as string | null)?.trim();
  if (!id) return;

  await deleteProduct(id);
  await logActivity({
    userId: user.id,
    action: "product.delete",
    entity: "product",
    entityId: id,
    summary: "Ürün silindi",
  });
  revalidatePublic();
  revalidatePath("/admin/products");
}
