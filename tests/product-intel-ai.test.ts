/**
 * PRODUCT INTELLIGENCE — the AI boundary, tested without the network.
 *
 * WHY THIS FILE EXISTS
 *
 * There is no `ANTHROPIC_API_KEY` in this project — not locally, not in Vercel
 * — so the AI layer has never actually run. Everything about that boundary that
 * can be checked WITHOUT a key is checked here: the request the code builds,
 * what the model is forbidden to do, how a real Anthropic response is parsed,
 * every failure mode, and — the part that matters most — whether a hallucinated
 * specification in a draft title is caught by arithmetic rather than by hope.
 *
 * `globalThis.fetch` is replaced for the duration of each test. Nothing here
 * reaches the internet, nothing costs money, and the fake key below is a string
 * that is never sent anywhere.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { draftTitles, interpretAnalysis } from "../src/server/product-intel/ai";
import { checkTitleCandidates, supportedClaimsFor } from "../src/server/product-intel/title";

type CapturedRequest = { url: string; headers: Record<string, string>; body: Record<string, unknown> };

const realFetch = globalThis.fetch;
const FAKE_KEY = "test-key-never-sent-anywhere";

/** Install a fetch that records the request and returns `reply`. */
function withStub(
  reply: () => { ok: boolean; status: number; json: unknown } | Promise<never>,
  run: (captured: CapturedRequest[]) => Promise<void>,
): Promise<void> {
  const captured: CapturedRequest[] = [];
  const previousKey = process.env.ANTHROPIC_API_KEY;
  process.env.ANTHROPIC_API_KEY = FAKE_KEY;

  globalThis.fetch = (async (url: string, init: RequestInit) => {
    captured.push({
      url: String(url),
      headers: (init.headers ?? {}) as Record<string, string>,
      body: JSON.parse(String(init.body)) as Record<string, unknown>,
    });
    const r = await reply();
    return { ok: r.ok, status: r.status, json: async () => r.json } as unknown as Response;
  }) as typeof globalThis.fetch;

  return run(captured).finally(() => {
    globalThis.fetch = realFetch;
    if (previousKey === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = previousKey;
  });
}

/** A response shaped the way the Messages API really answers with thinking on. */
function anthropicReply(text: string, extra: Record<string, unknown> = {}) {
  return {
    ok: true,
    status: 200,
    json: {
      id: "msg_test",
      model: "claude-opus-5",
      stop_reason: "end_turn",
      content: [
        { type: "thinking", thinking: "" },
        { type: "text", text },
      ],
      ...extra,
    },
  };
}

// ---------------------------------------------------------------------------
// 1. NO KEY — what production does today
// ---------------------------------------------------------------------------

test("AI: with no API key the module still works and says why", async () => {
  const previous = process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  let called = false;
  globalThis.fetch = (async () => {
    called = true;
    throw new Error("network must not be touched");
  }) as typeof globalThis.fetch;

  try {
    const n = await interpretAnalysis("ÖLÇÜM: x");
    assert.equal(n.summary, null);
    assert.equal(n.launchNarrative, null);
    assert.match(n.disabledReason ?? "", /ANTHROPIC_API_KEY/);

    const t = await draftTitles("bağlam");
    assert.deepEqual(t.drafts, []);
    assert.match(t.disabledReason ?? "", /ANTHROPIC_API_KEY/);

    assert.equal(called, false, "no key must mean no request at all");
  } finally {
    globalThis.fetch = realFetch;
    if (previous !== undefined) process.env.ANTHROPIC_API_KEY = previous;
  }
});

// ---------------------------------------------------------------------------
// 2. THE REQUEST — model, parameters, and what the model is forbidden to do
// ---------------------------------------------------------------------------

test("AI: the request targets Opus with adaptive thinking and the versioned endpoint", async () => {
  await withStub(
    () => anthropicReply("ÖZET: bir şey."),
    async (captured) => {
      await interpretAnalysis("ÖLÇÜM: x");
      assert.equal(captured.length, 1);
      const req = captured[0]!;
      assert.equal(req.url, "https://api.anthropic.com/v1/messages");
      assert.equal(req.headers["anthropic-version"], "2023-06-01");
      assert.equal(req.headers["x-api-key"], FAKE_KEY);
      assert.equal(req.body.model, "claude-opus-5");
      assert.deepEqual(req.body.thinking, { type: "adaptive" });
      // Adaptive thinking is billed from the same budget as the answer, so the
      // ceiling has to leave room for both or the reply is cut mid-sentence.
      assert.ok(typeof req.body.max_tokens === "number" && (req.body.max_tokens as number) >= 8000);
      // budget_tokens is removed on this model family and would be a 400.
      assert.equal("budget_tokens" in (req.body.thinking as object), false);
    },
  );
});

test("AI: the system prompt forbids the three things that would make it dangerous", async () => {
  await withStub(
    () => anthropicReply("ÖZET: bir şey."),
    async (captured) => {
      await interpretAnalysis("ÖLÇÜM: x");
      const system = String(captured[0]!.body.system);
      // Inventing numbers.
      assert.match(system, /HİÇBİR sayı/);
      // Reading silence as absence — the module's core rule.
      assert.match(system, /OKUNAMADI ≠ YOK/);
      assert.match(system, /taranan kapsamda gözlenmedi/);
      // Predicting sales.
      assert.match(system, /TAHMİNİ YAPMA/);
    },
  );
});

test("AI: the title prompt forbids specifications the product does not have", async () => {
  await withStub(
    () => anthropicReply("BASLIK | Bir Başlık | gerekçe"),
    async (captured) => {
      await draftTitles("Ürün: test\nÖZELLİKLER:\n- Konnektör: USB-C");
      const system = String(captured[0]!.body.system);
      assert.match(system, /ÜRÜNDE OLMAYAN HİÇBİR ÖZELLİĞİ BAŞLIĞA YAZMA/);
      assert.match(system, /Karakter sınırını AŞMA/);
      assert.equal(captured[0]!.body.model, "claude-opus-5");
    },
  );
});

test("AI: the model is handed the fact sheet and nothing else", async () => {
  await withStub(
    () => anthropicReply("ÖZET: bir şey."),
    async (captured) => {
      const sheet = "Taranan 20 ilandan konnektör okunabilen 14'ünde USB-C 4 kez görüldü (%28.6).";
      await interpretAnalysis(sheet);
      const messages = captured[0]!.body.messages as Array<{ role: string; content: string }>;
      assert.equal(messages.length, 1);
      assert.equal(messages[0]!.role, "user");
      assert.ok(messages[0]!.content.includes(sheet), "the measured sheet must be what it sees");
    },
  );
});

// ---------------------------------------------------------------------------
// 3. PARSING A REAL RESPONSE
// ---------------------------------------------------------------------------

test("AI: thinking blocks are ignored and only text is read", async () => {
  await withStub(
    () => ({
      ok: true,
      status: 200,
      json: {
        stop_reason: "end_turn",
        content: [
          { type: "thinking", thinking: "bu metin asla ekrana çıkmamalı" },
          { type: "text", text: "ÖZET: pazar kalabalık." },
        ],
      },
    }),
    async () => {
      const n = await interpretAnalysis("ÖLÇÜM: x");
      assert.equal(n.summary, "ÖZET: pazar kalabalık.");
      assert.ok(!(n.summary ?? "").includes("asla ekrana"), "reasoning must never reach the screen");
    },
  );
});

test("AI: the narrative is split so launch prose lands on its own tab", async () => {
  await withStub(
    () =>
      anthropicReply(
        [
          "ÖZET: Pazar kalabalık ve fiyat odaklı.",
          "KONUMLANDIRMA: Üst segmentte teknik farkla konumlan.",
          "İLK DÖNEM:",
          "- Yorum topla",
          "DİKKAT:",
          "- Maliyet varsayım",
        ].join("\n"),
      ),
    async () => {
      const n = await interpretAnalysis("ÖLÇÜM: x");
      assert.ok(n.summary!.startsWith("ÖZET:"));
      assert.ok(!n.summary!.includes("KONUMLANDIRMA"), "summary must stop before the launch half");
      assert.ok(n.launchNarrative!.startsWith("KONUMLANDIRMA:"));
      assert.ok(n.launchNarrative!.includes("İLK DÖNEM:"));
    },
  );
});

test("AI: title drafts are parsed, capped at five, and junk lines ignored", async () => {
  await withStub(
    () =>
      anthropicReply(
        [
          "İşte önerilerim:",
          "BASLIK | Şarjlı El Vantilatörü USB-C 4000mAh | kapasite ve konnektör öne çıkarıldı",
          "BASLIK | El Vantilatörü 5 Kademeli Dijital Ekranlı | kademe vurgusu",
          "BASLIK | Mini Fan USB-C Şarjlı | kısa başlık",
          "BASLIK | Taşınabilir El Vantilatörü 4000mAh | taşınabilirlik",
          "BASLIK | El Vantilatörü Dijital Ekranlı Mini Fan | ekran vurgusu",
          "BASLIK | Altıncı öneri | sınırın üstünde",
          "bozuk satır",
        ].join("\n"),
      ),
    async () => {
      const r = await draftTitles("bağlam");
      assert.equal(r.drafts.length, 5, "at most five drafts");
      assert.equal(r.drafts[0]!.title, "Şarjlı El Vantilatörü USB-C 4000mAh");
      assert.equal(r.drafts[0]!.rationale, "kapasite ve konnektör öne çıkarıldı");
      assert.ok(!r.drafts.some((d) => d.title.includes("bozuk")));
    },
  );
});

// ---------------------------------------------------------------------------
// 4. FAILURE MODES — none of them may throw into the analysis
// ---------------------------------------------------------------------------

test("AI: a refusal is reported, not rendered as commentary", async () => {
  await withStub(
    () => ({ ok: true, status: 200, json: { stop_reason: "refusal", stop_details: { type: "refusal", category: "cyber" }, content: [] } }),
    async () => {
      const n = await interpretAnalysis("ÖLÇÜM: x");
      assert.equal(n.summary, null);
      assert.match(n.disabledReason ?? "", /güvenlik/);
    },
  );
});

test("AI: an HTTP error degrades to a note instead of failing the analysis", async () => {
  await withStub(
    () => ({ ok: false, status: 429, json: {} }),
    async () => {
      const n = await interpretAnalysis("ÖLÇÜM: x");
      assert.equal(n.summary, null);
      assert.match(n.disabledReason ?? "", /429/);
    },
  );
});

test("AI: a network failure never throws out of the module", async () => {
  await withStub(
    () => Promise.reject(new Error("ECONNRESET")),
    async () => {
      const n = await interpretAnalysis("ÖLÇÜM: x");
      assert.equal(n.summary, null);
      assert.match(n.disabledReason ?? "", /ECONNRESET/);
      const t = await draftTitles("bağlam");
      assert.deepEqual(t.drafts, []);
    },
  );
});

test("AI: a truncated answer is flagged, not shown as if it were finished", async () => {
  await withStub(
    () => anthropicReply("ÖZET: Pazar kalabalık ve fiyat", { stop_reason: "max_tokens" }),
    async () => {
      const n = await interpretAnalysis("ÖLÇÜM: x");
      assert.match(n.disabledReason ?? "", /token sınırına/);
    },
  );
});

test("AI: a truncated title reply keeps the drafts it got AND says it is short", async () => {
  await withStub(
    () =>
      anthropicReply(
        ["BASLIK | El Vantilatörü USB-C 4000mAh | a", "BASLIK | Şarjlı Mini Fan 5 Kademeli | b"].join("\n"),
        { stop_reason: "max_tokens" },
      ),
    async () => {
      const r = await draftTitles("bağlam");
      assert.equal(r.drafts.length, 2, "what did arrive is still usable");
      assert.match(r.disabledReason ?? "", /token sınırına/, "and the reader must know more were coming");
    },
  );
});

test("AI: the title request also leaves room for thinking", async () => {
  await withStub(
    () => anthropicReply("BASLIK | Bir Başlık | gerekçe"),
    async (captured) => {
      await draftTitles("bağlam");
      assert.ok((captured[0]!.body.max_tokens as number) >= 4000);
    },
  );
});

test("AI: an empty answer is null, not an empty commentary box", async () => {
  await withStub(
    () => anthropicReply("   "),
    async () => {
      const n = await interpretAnalysis("ÖLÇÜM: x");
      assert.equal(n.summary, null);
    },
  );
});

// ---------------------------------------------------------------------------
// 5. THE GROUNDING GATE — the reason any of this is safe
// ---------------------------------------------------------------------------

const PRODUCT = "El Vantilatörü USB-C 4000 mAh 5 Kademe Dijital Ekran";

test("AI: a hallucinated specification is caught even when the prose is perfect", async () => {
  await withStub(
    () =>
      anthropicReply(
        [
          // Grounded.
          "BASLIK | Şarjlı El Vantilatörü USB-C 4000mAh 5 Kademeli Dijital Ekranlı Mini Fan | ürünün gerçek değerleri",
          // Capacity inflated — the dangerous one.
          "BASLIK | Şarjlı El Vantilatörü USB-C 6000mAh 5 Kademeli Mini Fan | daha çekici kapasite",
          // A connector the product does not have.
          "BASLIK | El Vantilatörü Micro USB 4000mAh Dijital Ekran | alternatif konnektör",
          // Unsubstantiable marketing.
          "BASLIK | En İyi El Vantilatörü USB-C 4000mAh Ücretsiz Kargo | pazarlama dili",
        ].join("\n"),
      ),
    async () => {
      const { drafts } = await draftTitles("bağlam");
      assert.equal(drafts.length, 4);

      const checked = checkTitleCandidates(drafts, {
        maxChars: 100,
        supportedClaims: supportedClaimsFor(PRODUCT),
      });

      assert.equal(checked[0]!.accepted, true, "the grounded title must pass");

      assert.equal(checked[1]!.accepted, false);
      assert.ok(
        checked[1]!.violations.some((v) => v.code === "UNSUPPORTED_CLAIM" && v.detail === "6000 mah"),
        "an inflated capacity must be named exactly",
      );

      assert.equal(checked[2]!.accepted, false);
      assert.ok(checked[2]!.violations.some((v) => v.code === "UNSUPPORTED_CLAIM" && v.detail === "micro usb"));

      assert.equal(checked[3]!.accepted, false);
      assert.ok(checked[3]!.violations.some((v) => v.code === "BANNED_PHRASE"));

      // A rejected draft is kept with its reason — never silently dropped.
      for (const bad of checked.slice(1)) assert.ok(bad.violations.length > 0 && bad.title.length > 0);
    },
  );
});

test("AI: every accepted title's claims are a subset of what the product supports", async () => {
  await withStub(
    () =>
      anthropicReply(
        [
          "BASLIK | El Vantilatörü USB-C 4000mAh Dijital Ekranlı | a",
          "BASLIK | Şarjlı Mini Fan 5 Kademeli USB-C | b",
          "BASLIK | El Vantilatörü 4000mAh Bluetooth Bağlantılı | c",
        ].join("\n"),
      ),
    async () => {
      const { drafts } = await draftTitles("bağlam");
      const supported = new Set(supportedClaimsFor(PRODUCT));
      const checked = checkTitleCandidates(drafts, { maxChars: 100, supportedClaims: [...supported] });

      for (const c of checked.filter((x) => x.accepted)) {
        for (const claim of c.claims) {
          assert.ok(supported.has(claim), `accepted title claims "${claim}" which the product does not support`);
        }
      }
      // Bluetooth is not a property of this product, so that draft cannot pass.
      assert.equal(checked[2]!.accepted, false);
      assert.ok(checked[2]!.violations.some((v) => v.detail === "bluetooth"));
    },
  );
});

test("AI: a title over the marketplace ceiling is rejected however good it reads", async () => {
  await withStub(
    () => anthropicReply(`BASLIK | ${"El Vantilatörü USB-C 4000mAh ".repeat(5)} | uzun`),
    async () => {
      const { drafts } = await draftTitles("bağlam");
      const checked = checkTitleCandidates(drafts, { maxChars: 100, supportedClaims: supportedClaimsFor(PRODUCT) });
      assert.equal(checked[0]!.accepted, false);
      assert.ok(checked[0]!.violations.some((v) => v.code === "TOO_LONG"));
    },
  );
});

test("AI: when the model returns nothing usable, no title is shown at all", async () => {
  await withStub(
    () => anthropicReply("Üzgünüm, bu ürün için başlık öneremiyorum."),
    async () => {
      const { drafts } = await draftTitles("bağlam");
      assert.deepEqual(drafts, [], "prose that is not a draft must not become a title");
    },
  );
});
