import "server-only";

import type { AnalysisResult } from "./analyze";
import { CRITERION_LABELS, type RadarCriterionKey } from "@/config/radar";
import { countryName } from "@/components/admin/radar/ui";
import {
  deriveConflicts,
  getTopSources,
  splitScores,
  type SnapshotCriterion,
} from "@/components/admin/radar/insights";

/**
 * AYZENITH RADAR — AI interpretation layer (the LAST, most constrained step).
 *
 * The AI's ONLY job is to phrase, in Turkish, the sourced data and deterministic
 * scores the pipeline already produced. It is structurally prevented from being
 * the source of truth:
 *   • It receives only the computed criteria + their raw, sourced inputs.
 *   • It is instructed to never invent a number, a score, an HS code or a trade
 *     figure, and to say "veri yetersiz" when something is missing.
 *   • It never runs when the pipeline flagged INSUFFICIENT_DATA.
 *   • If no API key is configured the system still works — the summary is simply
 *     null and the UI shows the deterministic result without commentary.
 *
 * The AI text is always rendered as 🟡 "yorum" in the UI, never as 🟢 verified
 * data — so even a stray hallucinated phrase can't masquerade as sourced fact.
 */

const API_URL = "https://api.anthropic.com/v1/messages";
const DEFAULT_MODEL = process.env.RADAR_AI_MODEL ?? "claude-haiku-4-5-20251001";

export type AiInterpretation = {
  summary: string | null;
  disabledReason?: string;
};

function buildFactSheet(result: AnalysisResult): string {
  const criteria = result.criteria as unknown as SnapshotCriterion[];
  const model = result.tradeModel === "B2C" ? "B2C (tüketici pazarı)" : "B2B (toptan/distribütör)";
  const twin = splitScores(criteria, result.weightsUsed);
  const conflicts = deriveConflicts(criteria);
  const topSources = getTopSources(criteria);

  const lines: string[] = [];
  lines.push(`Pazar: ${result.countryLabel} (${result.countryCode})`);
  lines.push(`Kategori: ${result.categoryKey}`);
  lines.push(`Ticari model: ${model}`);
  lines.push(`Nihai skor (kod tarafından hesaplandı): ${result.finalScore}/100`);
  lines.push(
    `Market Opportunity: ${twin.marketOpportunity ?? "—"}/100 | AYZENITH Fit: ${twin.ayzenithFit ?? "—"}/100`,
  );
  lines.push(`Karar bandı: ${result.decision}`);
  lines.push(`Veri güveni: %${result.confidence} (${result.measuredCriteria}/5 kriter ölçüldü)`);
  lines.push("");
  lines.push("KRİTER SKORLARI VE HAM VERİLERİ (yalnızca bunları kullan):");
  for (const c of result.criteria) {
    const label = CRITERION_LABELS[c.key as RadarCriterionKey] ?? c.key;
    if (!c.available || c.score == null) {
      lines.push(`- ${label}: VERİ YOK`);
      continue;
    }
    const raw = Object.entries(c.rawInputs)
      .filter(([k]) => k !== "topSources")
      .map(([k, v]) => `${k}=${v}`)
      .join(", ");
    lines.push(`- ${label}: ${c.score}/100 | ${c.explanation} | ham: ${raw}`);
  }
  if (topSources.length > 0) {
    lines.push("");
    lines.push("EN BÜYÜK TEDARİKÇİ ÜLKELER (ithalat kaynak payı):");
    for (const s of topSources.slice(0, 5)) {
      lines.push(`- ${countryName(s.cc)}: %${s.sharePct}`);
    }
  }
  if (conflicts.length > 0) {
    lines.push("");
    lines.push("TESPİT EDİLEN ÇELİŞKİLİ SİNYALLER (bunları yorumunda dikkate al):");
    for (const c of conflicts) lines.push(`- ${c}`);
  }
  if (result.subCategories.length > 0) {
    lines.push("");
    lines.push("ÜRÜN / ALT KATEGORİLER (gerçek HS verisi, bileşik fırsat skoru):");
    for (const s of result.subCategories.slice(0, 6)) {
      lines.push(
        `- ${s.productGroup} (HS ${s.hs6}): fırsat skoru ${s.score}, pazar ${Math.round(
          s.latest,
        )} USD, trend ${s.trendPct == null ? "bilinmiyor" : `%${s.trendPct}`}, TR payı ${
          s.trSharePct == null ? "bilinmiyor" : `%${s.trSharePct}`
        }`,
      );
    }
  }
  return lines.join("\n");
}

const SYSTEM_PROMPT = `Sen AYZENITH RADAR'ın ticari yorum katmanısın. Görevin, SANA VERİLEN kaynaklı veriyi ve kod tarafından hesaplanmış skorları sade, sakin, güven veren bir Türkçe ile AÇIKLAMAK. AYZENITH Türkiye merkezli bir B2B ticaret/tedarik şirketidir.

KESİN KURALLAR:
- Sana verilmemiş HİÇBİR sayı, oran, ticaret rakamı, yüzde veya HS kodu üretme. Yeni rakam uydurma. Kullandığın her sayı sana verilen ham veriden gelmeli.
- Skoru sen belirleme; skorlar zaten verildi. Sadece "neden bu skor" diye açıkla. Skoru değiştirme.
- EN KRİTİK KURAL — VERİ YOK ≠ DÜŞÜK DEĞER: Bir veri "VERİ YOK" ise onu düşük, sıfır, yok veya negatif SAYMA. "doğrulanamadı" / "bu analizde ölçülmedi" de. Eksik veriden ne olumlu ne olumsuz ticari sonuç çıkar. Örneğin Türkiye ihracatı ölçülmediyse "Türkiye'nin bağlantısı yok" DEME; "Türkiye ihracat verisi doğrulanamadı" de.
- ÇOK ÖNEMLİ DİL KURALI: İthalat verisi TALEP değildir. "Tüketici talebi yüksek" DEME. Bunun yerine "ithalat hacmi yüksek" / "ithalat aktivitesi yüksek" de. Veri kaynağı neyi ölçüyorsa onu söyle.
- Türkiye'nin payı düşükse bunu otomatik "avantaj" sayma. "Türkiye zaten satıyor" (mevcut kanal) ile "Türkiye hızla büyüyor" (trend) ayrı şeylerdir; sadece sana verilen veriyle konuş.
- Sana "ÇELİŞKİLİ SİNYALLER" verildiyse bunları özetinde mutlaka dikkate al; genel pazar büyümesini Türkiye açısından otomatik fırsat sayma.
- B2C modelinde: kişi başına gelir, e-ticaret penetrasyonu, nüfus gibi tüketici verileri ÖLÇÜLMEDİ; bunları biliyormuş gibi konuşma.
- Abartma, klişe kullanma ("dünya lideri", "cutting-edge" vb. yasak). Kısa ve net ol.

ÇIKTI FORMATI (düz metin, Türkçe):
ÖZET: <2-3 cümle: pazar iyi mi, AYZENITH için uygun mu, neden>
GÜÇLÜ SİNYALLER:
- <madde>
ZAYIF SİNYALLER:
- <madde>
ÇELİŞKİLER:
- <madde (yoksa "Belirgin çelişki yok")>`;

// ---------------------------------------------------------------------------
// Advisory HS-code suggestion for a natural-language product (§3/§4).
//
// Used ONLY when the verified HS table has no match. The AI may SUGGEST possible
// HS-6 codes and explain why — but it can NEVER declare a code correct, and a
// suggestion is NEVER analysed until a human adds + verifies it in the HS editor.
// It invents no trade figures. If no API key, suggestions are simply empty.
// ---------------------------------------------------------------------------

export type HsSuggestion = { hs6: string; label: string; reason: string };

const SUGGEST_SYSTEM = `Sen AYZENITH RADAR'ın HS kodu ÖNERİ yardımcısısın. Sana bir ürün adı verilir; olası HS-6 (6 haneli) gümrük kodlarını ÖNERİRSİN. KESİN KURALLAR:
- Bir kodun kesinlikle doğru olduğunu İDDİA ETME. Bunlar yalnızca önericidir; insan doğrulaması gerekir.
- Ticaret rakamı, pazar büyüklüğü, yüzde gibi hiçbir sayı üretme. Yalnızca kod + kısa gerekçe.
- En fazla 4 öneri. Emin değilsen az öneri ver veya "öneri yok" de.
- Yalnızca gerçek WCO HS 2022 mantığına uygun kodlar öner.
ÇIKTI FORMATI (her satır bir öneri, başka hiçbir şey yazma):
HS <6 haneli kod> | <ürün grubunun kısa adı> | <neden bu kod, tek cümle>`;

export async function suggestHsForProduct(
  productName: string,
): Promise<{ suggestions: HsSuggestion[]; disabledReason?: string }> {
  const name = (productName ?? "").trim();
  if (!name) return { suggestions: [] };
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { suggestions: [], disabledReason: "AI öneri katmanı devre dışı (ANTHROPIC_API_KEY tanımlı değil)." };
  }
  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: DEFAULT_MODEL,
        max_tokens: 400,
        system: SUGGEST_SYSTEM,
        messages: [{ role: "user", content: `Ürün: "${name}". Olası HS-6 kodlarını öner.` }],
      }),
      cache: "no-store",
    });
    if (!res.ok) return { suggestions: [], disabledReason: `AI API HTTP ${res.status}` };
    const data = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
    const text = (data.content ?? []).filter((b) => b.type === "text").map((b) => b.text ?? "").join("\n");
    const suggestions: HsSuggestion[] = [];
    for (const line of text.split("\n")) {
      const m = line.match(/HS\s*(\d{6})\s*\|\s*([^|]+?)\s*\|\s*(.+)/i);
      if (m) suggestions.push({ hs6: m[1]!, label: m[2]!.trim(), reason: m[3]!.trim() });
    }
    return { suggestions: suggestions.slice(0, 4) };
  } catch (e) {
    return { suggestions: [], disabledReason: `AI erişilemedi: ${(e as Error).message}` };
  }
}

export async function interpret(result: AnalysisResult): Promise<AiInterpretation> {
  // Never interpret a non-result.
  if (result.decision === "INSUFFICIENT_DATA" || result.finalScore == null) {
    return { summary: null, disabledReason: "Veri yetersiz — yorum üretilmedi." };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      summary: null,
      disabledReason: "AI yorum katmanı devre dışı (ANTHROPIC_API_KEY tanımlı değil).",
    };
  }

  const factSheet = buildFactSheet(result);
  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: DEFAULT_MODEL,
        max_tokens: 600,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: `Aşağıdaki kaynaklı veriyi yorumla. Yalnızca bu verileri kullan:\n\n${factSheet}`,
          },
        ],
      }),
      cache: "no-store",
    });
    if (!res.ok) {
      return { summary: null, disabledReason: `AI API HTTP ${res.status}` };
    }
    const data = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
    const text = (data.content ?? [])
      .filter((b) => b.type === "text")
      .map((b) => b.text ?? "")
      .join("\n")
      .trim();
    return { summary: text || null };
  } catch (e) {
    return { summary: null, disabledReason: `AI erişilemedi: ${(e as Error).message}` };
  }
}
