import "server-only";

/**
 * PRODUCT INTELLIGENCE — the AI layer (the LAST and most constrained step).
 *
 * Structurally identical to RADAR's (`src/server/radar/ai.ts`), for the same
 * reason: the model is allowed to PHRASE measurements, never to produce them.
 * Everything it receives has already been computed by deterministic code, and
 * everything it returns is either narrative (labelled "yorum" in the UI) or a
 * title draft that must still pass `title.ts` before anyone sees it.
 *
 * Four structural guarantees, not prompt wishes:
 *   • It is never called when the analysis is INSUFFICIENT_DATA or BLOCKED.
 *   • It is handed a fact sheet, never the raw offers — there is no unmeasured
 *     number in its context to launder into a conclusion.
 *   • Title drafts are checked against the product's own claims afterwards; an
 *     invented specification is rejected by arithmetic, not by instruction.
 *   • With no API key the module still works. The summary is simply null.
 *
 * Transport is the same raw `fetch` RADAR uses, deliberately: one AI call shape
 * in this codebase, no new dependency in the deploy. The model differs — this
 * work is heavier than restating a score, so it runs on Opus with adaptive
 * thinking, overridable through PI_AI_MODEL.
 */

const API_URL = "https://api.anthropic.com/v1/messages";
const DEFAULT_MODEL = process.env.PI_AI_MODEL ?? "claude-opus-5";

export type AiNarrative = {
  summary: string | null;
  launchNarrative: string | null;
  disabledReason?: string;
};

export type AiTitleDraft = { title: string; rationale: string };

const SHARED_RULES = `KESİN KURALLAR:
- Sana verilmemiş HİÇBİR sayı, oran, fiyat, özellik veya rakip adı üretme. Kullandığın her sayı sana verilen ölçümden gelmeli.
- Ölçümleri sen yapma; ölçümler zaten yapıldı. Bir oranı yeniden hesaplama, yuvarlama veya "yaklaşık" diye değiştirme.
- EN KRİTİK KURAL — OKUNAMADI ≠ YOK: Bir özellik "okunabilen X ilandan" diye veriliyorsa, okunamayan ilanlar hakkında hiçbir şey söyleme. "Pazarda yok", "hiçbir rakipte bulunmuyor", "tek sen sunuyorsun" gibi ifadeler YASAK. Bunun yerine "taranan kapsamda gözlenmedi" de.
- Satış adedi, ciro, pazar payı veya büyüme TAHMİNİ YAPMA. "Bu ürün şu kadar satar" YASAK.
- "VERİ YETERSİZ" etiketli bir ölçümden sonuç çıkarma; o konuda veri olmadığını söyle.
- Abartma ve klişe yasak ("pazar lideri", "muazzam fırsat", "devrim" vb.). Sakin, kısa, ticari bir dil kullan.
- Türkçe yaz.`;

const NARRATIVE_SYSTEM = `Sen AYZENITH Product Intelligence'ın ticari yorum katmanısın. Sana bir ürünün pazaryeri analizinin ÖLÇÜLMÜŞ sonuçları verilir. Görevin bunları sade Türkçe ile açıklamak ve bir pazara giriş yaklaşımı yazmak. AYZENITH Türkiye merkezli bir ticaret/tedarik şirketidir.

${SHARED_RULES}

ÇIKTI FORMATI (düz metin, başka hiçbir şey yazma):
ÖZET: <3-4 cümle: bu pazarda ne görünüyor, ürünün durumu ne, en kritik bulgu ne>
KONUMLANDIRMA: <2-3 cümle: hedef müşteri ve ürünün nerede durduğu>
İLK DÖNEM: <3-5 madde, her biri "- " ile başlasın: ilk satış döneminde yapılacaklar>
DİKKAT: <1-3 madde, her biri "- " ile başlasın: bu analizin söyleyemediği veya riskli olan noktalar>`;

const TITLE_SYSTEM = `Sen AYZENITH Product Intelligence'ın başlık yazma katmanısın. Sana bir pazaryeri için ürünün DOĞRULANMIŞ özellikleri, rakip başlıklarından sayılmış kelimeler ve karakter sınırı verilir. Görevin o pazaryeri için ürün başlığı önermek.

${SHARED_RULES}
- ÜRÜNDE OLMAYAN HİÇBİR ÖZELLİĞİ BAŞLIĞA YAZMA. Sana verilmeyen bir kapasite, güç, kademe sayısı, bağlantı tipi veya malzeme uydurma. Yazdığın her teknik değer sana verilen özellik listesinde birebir bulunmalı.
- Karakter sınırını AŞMA.
- "en ucuz", "en iyi", "orijinal", "garantili", "ücretsiz kargo" gibi ifadeler kullanma.
- Aynı kelimeyi başlıkta ikiden fazla tekrarlama.

ÇIKTI FORMATI (her satır bir öneri, başka hiçbir şey yazma, en fazla 5 satır):
BASLIK | <başlık metni> | <neden bu başlık, tek cümle, hangi kelimeleri neden kullandığın>`;

async function call(
  system: string,
  user: string,
  maxTokens: number,
): Promise<{ text: string | null; disabledReason?: string }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { text: null, disabledReason: "AI katmanı devre dışı (ANTHROPIC_API_KEY tanımlı değil)." };

  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: DEFAULT_MODEL,
        max_tokens: maxTokens,
        // Adaptive thinking: the model decides how much reasoning this needs.
        // Only `text` blocks are read below, so thinking never reaches a screen.
        thinking: { type: "adaptive" },
        system,
        messages: [{ role: "user", content: user }],
      }),
      cache: "no-store",
    });
    if (!res.ok) return { text: null, disabledReason: `AI API HTTP ${res.status}` };
    const data = (await res.json()) as { content?: Array<{ type: string; text?: string }>; stop_reason?: string };
    if (data.stop_reason === "refusal") return { text: null, disabledReason: "AI isteği güvenlik nedeniyle yanıtlamadı." };

    const text = (data.content ?? [])
      .filter((b) => b.type === "text")
      .map((b) => b.text ?? "")
      .join("\n")
      .trim();

    // A cut-off answer is worse than none: half a sentence of commentary reads
    // as a finished thought, and half a list of title drafts silently loses the
    // ones the model had not written yet. Say it was truncated instead.
    if (data.stop_reason === "max_tokens") {
      return { text: text || null, disabledReason: "AI yanıtı token sınırına takıldı; metin eksik olabilir." };
    }
    return { text: text || null };
  } catch (e) {
    return { text: null, disabledReason: `AI erişilemedi: ${(e as Error).message}` };
  }
}

export async function interpretAnalysis(factSheet: string): Promise<AiNarrative> {
  // Adaptive thinking spends from the SAME budget as the answer, so a ceiling
  // sized for the prose alone truncates the reply. This is a ceiling, not a
  // target: the narrative is a few hundred words and is billed as what it uses.
  const r = await call(NARRATIVE_SYSTEM, `Aşağıdaki ÖLÇÜLMÜŞ analiz sonuçlarını yorumla. Yalnızca bunları kullan:\n\n${factSheet}`, 8000);
  if (!r.text) return { summary: null, launchNarrative: null, disabledReason: r.disabledReason };

  // The launch half is split out so the detail screen can show it under the
  // launch tab while the summary stays on the overview. `disabledReason` is
  // carried through even when there IS text: a truncated answer still has
  // prose, and the note is the only thing telling the reader it is unfinished.
  const idx = r.text.indexOf("KONUMLANDIRMA:");
  if (idx < 0) return { summary: r.text, launchNarrative: null, disabledReason: r.disabledReason };
  return {
    summary: r.text.slice(0, idx).trim(),
    launchNarrative: r.text.slice(idx).trim(),
    disabledReason: r.disabledReason,
  };
}

export async function draftTitles(context: string): Promise<{ drafts: AiTitleDraft[]; disabledReason?: string }> {
  const r = await call(TITLE_SYSTEM, context, 4000);
  if (!r.text) return { drafts: [], disabledReason: r.disabledReason };

  const drafts: AiTitleDraft[] = [];
  for (const line of r.text.split("\n")) {
    const m = line.match(/^\s*BASLIK\s*\|\s*([^|]+?)\s*\|\s*(.+?)\s*$/i);
    if (m && m[1] && m[2]) drafts.push({ title: m[1].trim(), rationale: m[2].trim() });
  }
  // As above: a truncated reply can carry two good drafts and be missing three,
  // and only the note says so.
  return { drafts: drafts.slice(0, 5), disabledReason: r.disabledReason };
}
