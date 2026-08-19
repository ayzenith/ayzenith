/**
 * Content-Disposition filenames must be ASCII: the header is encoded as a
 * ByteString, so a single character above U+00FF makes Node throw
 * "Cannot convert argument to a ByteString" and the whole download 500s —
 * after the PDF has already been rendered. Turkish document titles hit this
 * routinely ("Nakit Akışı", "Ürün Kârlılığı").
 *
 * Stripping accents via NFD alone is not enough here: it decomposes ğ and ş
 * into g/s plus a combining mark, but ı (dotless i) has no decomposition at
 * all, so it survives NFD and is then dropped as punctuation — turning
 * "Nakit Akışı" into "nakit-aks". The Turkish letters are therefore mapped
 * explicitly before normalising.
 */

const TURKISH_ASCII: Record<string, string> = {
  ı: "i", İ: "I", ş: "s", Ş: "S", ğ: "g", Ğ: "G",
  ç: "c", Ç: "C", ö: "o", Ö: "O", ü: "u", Ü: "U",
};

/** ASCII, filesystem-safe slug for use inside a Content-Disposition filename. */
export function asciiFilename(text: string, fallback = "belge"): string {
  const slug = text
    .replace(/[ıİşŞğĞçÇöÖüÜ]/g, (ch) => TURKISH_ASCII[ch] ?? ch)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9\s._-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "");
  return slug || fallback;
}
