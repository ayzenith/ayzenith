import { PrismaClient, ProductStatus, Role } from "@prisma/client";
import bcrypt from "bcryptjs";

/**
 * Seed the first Super Admin. There is NO public registration, so the initial
 * operator is created here from environment variables (never hardcoded):
 *
 *   SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD, SEED_ADMIN_NAME (optional)
 *
 * Idempotent: running it again does nothing if the user already exists.
 *
 * It also seeds the three launch products (idempotent upsert by slug) so the
 * public site keeps its catalogue after the move from hardcoded data to the DB.
 */

const prisma = new PrismaClient();

type Loc = { en: string; tr: string; de: string };
type LocList = { en: string[]; tr: string[]; de: string[] };
const L = (en: string, tr: string, de: string): Loc => ({ en, tr, de });
const LArr = (en: string[], tr: string[], de: string[]): LocList => ({ en, tr, de });

const seedProducts = [
  {
    slug: "anker-prime-140w",
    name: "Anker Prime 140W GaN Charger",
    categoryKey: "mobile",
    badge: "bestseller",
    availability: "in-stock",
    featured: true,
    shortDescription: L(
      "A three-port 140W GaN charger that powers laptops, tablets and phones from a single compact brick.",
      "Tek ve kompakt bir gövdeden dizüstü, tablet ve telefonu besleyen üç portlu 140W GaN şarj cihazı.",
      "Ein kompaktes 140-W-GaN-Ladegerät mit drei Anschlüssen für Laptop, Tablet und Smartphone.",
    ),
    description: L(
      "Built around GaN II technology, the Anker Prime 140W delivers full laptop-class charging from a brick a fraction of the size of a traditional adapter. Three ports let a laptop, tablet and phone charge at once, with intelligent power distribution across the load.",
      "GaN II teknolojisi üzerine kurulu Anker Prime 140W, geleneksel bir adaptörün çok daha küçük bir gövdesinden tam dizüstü sınıfı şarj sunar. Üç port; dizüstü, tablet ve telefonun aynı anda, yük arasında akıllı güç dağıtımıyla şarj olmasını sağlar.",
      "Basierend auf GaN-II-Technologie liefert das Anker Prime 140W volle Laptop-Ladeleistung aus einem Gehäuse, das nur einen Bruchteil eines klassischen Netzteils groß ist. Drei Anschlüsse laden Laptop, Tablet und Smartphone gleichzeitig – mit intelligenter Lastverteilung.",
    ),
    features: LArr(
      [
        "140W total output across three ports",
        "GaN II design — compact and cool-running",
        "Dynamic power distribution across devices",
        "Digital display for live power readout",
      ],
      [
        "Üç port genelinde toplam 140W çıkış",
        "GaN II tasarımı — kompakt ve düşük ısı",
        "Cihazlar arası dinamik güç dağıtımı",
        "Anlık güç göstergesi için dijital ekran",
      ],
      [
        "140 W Gesamtleistung über drei Anschlüsse",
        "GaN-II-Design — kompakt und kühl",
        "Dynamische Leistungsverteilung zwischen Geräten",
        "Digitalanzeige für Live-Leistungswerte",
      ],
    ),
    useCases: LArr(
      ["Laptop + phone travel kit", "Multi-device desk charging", "Fast top-ups on the move"],
      ["Dizüstü + telefon seyahat seti", "Çoklu cihaz masa şarjı", "Hareket hâlinde hızlı şarj"],
      ["Reise-Set für Laptop + Telefon", "Multi-Device-Laden am Schreibtisch", "Schnelles Nachladen unterwegs"],
    ),
    specs: [
      { label: L("Power output", "Güç çıkışı", "Leistung"), value: "140 W" },
      { label: L("Ports", "Portlar", "Anschlüsse"), value: "2× USB-C, 1× USB-A" },
      { label: L("Technology", "Teknoloji", "Technologie"), value: "GaN II" },
      { label: L("Display", "Ekran", "Anzeige"), value: "Digital readout" },
    ],
    marketplaces: {
      trendyol: "https://www.trendyol.com/sr?q=Anker%20Prime%20140W",
      hepsiburada: "https://www.hepsiburada.com/ara?q=Anker%20Prime%20140W",
      amazon: "https://www.amazon.com.tr/s?k=Anker+Prime+140W",
    },
  },
  {
    slug: "anker-737-power-bank",
    name: "Anker 737 Power Bank (PowerCore 24K)",
    categoryKey: "mobile",
    badge: "new",
    availability: "in-stock",
    featured: true,
    shortDescription: L(
      "A 24,000mAh power bank with 140W two-way charging and a smart digital display.",
      "140W çift yönlü şarj ve akıllı dijital ekrana sahip 24.000mAh taşınabilir batarya.",
      "Eine 24.000-mAh-Powerbank mit 140-W-Laden in beide Richtungen und smartem Digitaldisplay.",
    ),
    description: L(
      "The Anker 737 pairs a high 24,000mAh capacity with 140W input and output, so it recharges quickly and powers laptops as well as phones. A digital display reports remaining capacity, live wattage and estimated time — clarity buyers can trust.",
      "Anker 737, yüksek 24.000mAh kapasiteyi 140W giriş ve çıkışla birleştirir; böylece hızlı dolar ve telefonların yanı sıra dizüstü bilgisayarları da besler. Dijital ekran; kalan kapasiteyi, anlık gücü ve tahmini süreyi gösterir.",
      "Die Anker 737 verbindet 24.000 mAh Kapazität mit 140 W Ein- und Ausgang – schnell aufgeladen und stark genug für Laptops und Smartphones. Ein Digitaldisplay zeigt Restkapazität, Live-Leistung und geschätzte Zeit.",
    ),
    features: LArr(
      ["24,000mAh capacity", "140W two-way charging", "Smart digital display", "Charges laptops and phones"],
      ["24.000mAh kapasite", "140W çift yönlü şarj", "Akıllı dijital ekran", "Dizüstü ve telefon şarjı"],
      ["24.000 mAh Kapazität", "140 W Laden in beide Richtungen", "Smartes Digitaldisplay", "Lädt Laptops und Smartphones"],
    ),
    useCases: LArr(
      ["All-day mobile power", "Laptop backup on travel", "Field and event work"],
      ["Gün boyu mobil güç", "Seyahatte dizüstü yedeği", "Saha ve etkinlik kullanımı"],
      ["Mobile Energie den ganzen Tag", "Laptop-Backup auf Reisen", "Feld- und Event-Einsatz"],
    ),
    specs: [
      { label: L("Capacity", "Kapasite", "Kapazität"), value: "24,000 mAh" },
      { label: L("Max output", "Maks. çıkış", "Max. Ausgang"), value: "140 W" },
      { label: L("Ports", "Portlar", "Anschlüsse"), value: "2× USB-C, 1× USB-A" },
      { label: L("Display", "Ekran", "Anzeige"), value: "Digital readout" },
    ],
    marketplaces: {
      trendyol: "https://www.trendyol.com/sr?q=Anker%20737%20Power%20Bank",
      hepsiburada: "https://www.hepsiburada.com/ara?q=Anker%20737",
      amazon: "https://www.amazon.com.tr/s?k=Anker+737+Power+Bank",
      n11: "https://www.n11.com/arama?q=Anker+737",
    },
  },
  {
    slug: "usb-c-240w-cable",
    name: "USB-C to USB-C 240W Cable",
    categoryKey: "mobile",
    badge: null,
    availability: "limited",
    featured: false,
    shortDescription: L(
      "A braided USB-C cable rated for 240W charging and high-speed data.",
      "240W şarj ve yüksek hızlı veri için örgülü USB-C kablo.",
      "Ein geflochtenes USB-C-Kabel für 240-W-Laden und High-Speed-Daten.",
    ),
    description: L(
      "An E-marked, braided USB-C to USB-C cable rated to the full 240W USB Power Delivery ceiling, so it never becomes the bottleneck between a high-wattage charger and a laptop. Reinforced connectors and a durable braid are built for daily plug cycles.",
      "E-marked, örgülü USB-C — USB-C kablo; tam 240W USB Power Delivery tavanına dayanır; böylece yüksek güçlü şarj ile dizüstü arasında darboğaz oluşturmaz. Güçlendirilmiş konnektörler ve dayanıklı örgü, günlük kullanım için tasarlanmıştır.",
      "Ein E-markiertes, geflochtenes USB-C-zu-USB-C-Kabel für die volle 240-W-USB-Power-Delivery-Grenze – nie der Engpass zwischen starkem Ladegerät und Laptop. Verstärkte Stecker und robustes Geflecht für den täglichen Einsatz.",
    ),
    features: LArr(
      ["240W USB-PD rated", "E-marked for safe high-wattage", "Braided, reinforced connectors", "High-speed data transfer"],
      ["240W USB-PD uyumlu", "Güvenli yüksek güç için E-marked", "Örgülü, güçlendirilmiş konnektörler", "Yüksek hızlı veri aktarımı"],
      ["240 W USB-PD", "E-markiert für sichere hohe Leistung", "Geflochten, verstärkte Stecker", "High-Speed-Datenübertragung"],
    ),
    useCases: LArr(
      ["High-wattage laptop charging", "Pairing with 140W+ chargers", "Everyday durable carry"],
      ["Yüksek güçlü dizüstü şarjı", "140W+ şarj cihazlarıyla kullanım", "Günlük dayanıklı taşıma"],
      ["Laptop-Laden mit hoher Leistung", "Kombination mit 140-W+-Ladegeräten", "Robust für den Alltag"],
    ),
    specs: [
      { label: L("Rating", "Değer", "Nennwert"), value: "240 W (USB-PD)" },
      { label: L("Connectors", "Konnektörler", "Stecker"), value: "USB-C to USB-C" },
      { label: L("Build", "Yapı", "Aufbau"), value: "Braided, E-marked" },
      { label: L("Length", "Uzunluk", "Länge"), value: "1.8 m" },
    ],
    marketplaces: {
      trendyol: "https://www.trendyol.com/sr?q=USB-C%20240W%20kablo",
      hepsiburada: "https://www.hepsiburada.com/ara?q=USB-C%20240W%20kablo",
    },
  },
];

async function seedLaunchProducts() {
  for (let i = 0; i < seedProducts.length; i++) {
    const p = seedProducts[i]!;
    const common = {
      name: p.name,
      categoryKey: p.categoryKey,
      status: ProductStatus.PUBLISHED,
      featured: p.featured,
      availability: p.availability,
      badge: p.badge,
      image: null,
      sortOrder: i + 1,
      gallery: [],
      shortDescription: p.shortDescription,
      description: p.description,
      features: p.features,
      useCases: p.useCases,
      specs: p.specs,
      marketplaces: p.marketplaces,
      downloads: [],
    };
    await prisma.product.upsert({
      where: { slug: p.slug },
      // Do NOT overwrite editor changes on re-seed: only fill in if missing.
      update: {},
      create: { slug: p.slug, ...common },
    });
  }
  console.log(`✓ Ensured ${seedProducts.length} launch products exist.`);
}

async function main() {
  await seedLaunchProducts();

  const email = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD;
  const name = process.env.SEED_ADMIN_NAME?.trim() || "Administrator";

  if (!email || !password) {
    console.log(
      "↷ Skipping admin seed — set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD to create one.",
    );
    return;
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`✓ Super Admin ${email} already exists — no change.`);
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  await prisma.user.create({
    data: { email, name, passwordHash, role: Role.SUPER_ADMIN, active: true },
  });
  console.log(`✓ Created Super Admin: ${email}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
