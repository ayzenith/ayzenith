/**
 * Friendly grouping for the content editor — maps each next-intl top-level
 * namespace to a human page/section title (Turkish) and a display order. Any
 * namespace not listed still appears (using its raw key) at the end, so new
 * message groups are never hidden from the owner.
 */

export type ContentGroup = { ns: string; title: string; hint?: string };

export const CONTENT_GROUPS: readonly ContentGroup[] = [
  { ns: "hero", title: "Ana Sayfa · Giriş (Hero)", hint: "En üstteki büyük başlık ve alt metin" },
  { ns: "belief", title: "Ana Sayfa · Neden Varız" },
  { ns: "capabilities", title: "Ana Sayfa · Yetkinlikler" },
  { ns: "process", title: "Ana Sayfa · Süreç" },
  { ns: "difference", title: "Ana Sayfa · Farkımız" },
  { ns: "proof", title: "Ana Sayfa · Kanıt / Güven" },
  { ns: "vision", title: "Ana Sayfa · Vizyon" },
  { ns: "contact", title: "Ana Sayfa · İletişim Bandı" },
  { ns: "cta", title: "Çağrı Bandı (CTA)", hint: "Sayfaların altındaki ortaklık çağrısı" },
  { ns: "about", title: "Hakkımızda Sayfası" },
  { ns: "services", title: "Hizmetler Sayfası" },
  { ns: "products", title: "Ürünler Sayfası", hint: "Ürün kartları ürün yönetiminden düzenlenir" },
  { ns: "contactPage", title: "İletişim Sayfası" },
  { ns: "nav", title: "Menü ve Butonlar" },
  { ns: "footer", title: "Alt Bilgi (Footer)" },
  { ns: "metadata", title: "Site Başlığı & Açıklaması" },
  { ns: "errors", title: "Hata Mesajları" },
];

/** Turkish label for a leaf's last segment(s), lightly humanized. */
export function humanizeKey(key: string): string {
  const parts = key.split(".");
  const last = parts[parts.length - 1] ?? key;
  // Common field names → Turkish
  const dict: Record<string, string> = {
    title: "Başlık",
    subtitle: "Alt başlık",
    heading: "Başlık",
    overline: "Üst etiket",
    eyebrow: "Üst etiket",
    body: "Metin",
    description: "Açıklama",
    label: "Etiket",
    cta: "Buton",
    button: "Buton",
    tagline: "Slogan",
    name: "Ad",
  };
  return dict[last] ?? last;
}
