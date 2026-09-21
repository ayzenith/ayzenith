/**
 * IMPORT INTELLIGENCE — product concept knowledge (pure, built-in).
 *
 * This table is the classifier's prior: "a product called X usually belongs to
 * heading Y, and Z decides between its subheadings". It is the system's OWN
 * knowledge (provenance INFERRED), not a source, and it is never shown as one:
 *   - every target code is checked against the official Turkish nomenclature
 *     loaded from the Ministry of Trade file before it can become a candidate —
 *     a code that is not in that file never reaches the screen;
 *   - the tariff WORDING evidence shown next to a candidate is the verbatim
 *     official text, not these notes;
 *   - a condition that cannot be decided from the product text is reported as
 *     missing information, never assumed.
 * Codes are HS 2022 headings/subheadings (the basis of the 2026 TGTC).
 */

import { mainMaterial, type ProductAttributes } from "./attributes";

export type ComplianceTag =
  | "RADIO"
  | "ELECTRICAL"
  | "BATTERY"
  | "TOY"
  | "TEXTILE"
  | "FOOTWEAR_LEATHER"
  | "COSMETIC"
  | "FOOD_CONTACT"
  | "MEDICAL"
  | "PPE"
  | "VEHICLE_PART"
  | "MACHINERY"
  | "CONSUMER"
  | "BABY";

export type Target = {
  code: string;
  weight: number;
  note: string;
  /** true = condition met, false = contradicted, null = the text does not say. */
  when?: (a: ProductAttributes) => boolean | null;
  whenLabel?: string;
  /** The usual answer when the text does not decide the condition. */
  default?: boolean;
};

export type Requirement = { key: string; label: string; present: (a: ProductAttributes) => boolean };

export type Concept = {
  id: string;
  label: string;
  /** Normalized phrases (see text.normalizeText); matched at word starts.
   *  "=word" must be the whole word; "^word" only counts in the product NAME. */
  keywords: string[];
  /** Phrases that point to a DIFFERENT product built around the same word. */
  negative?: string[];
  targets: Target[];
  requires?: Requirement[];
  compliance?: ComplianceTag[];
};

// ---------------------------------------------------------------------------
// Conditions
// ---------------------------------------------------------------------------

const mat = (a: ProductAttributes) => mainMaterial(a)?.material ?? null;
const SYNTHETIC = ["POLYESTER", "POLYAMIDE", "ACRYLIC", "ELASTANE"];
const isMat = (keys: string[]) => (a: ProductAttributes) => {
  const m = mat(a);
  return m == null ? null : keys.includes(m);
};
const hasMat = (keys: string[]) => (a: ProductAttributes) =>
  a.materials.length === 0 ? null : a.materials.some((m) => keys.includes(m.value.material));
const knitted = (a: ProductAttributes) => (a.constructionConflict ? null : a.construction ? a.construction.value === "KNITTED" : null);
const woven = (a: ProductAttributes) => (a.constructionConflict ? null : a.construction ? a.construction.value === "WOVEN" : null);
const wireless = (a: ProductAttributes) => (a.wireless.length > 0 ? true : null);
const cellular = (a: ProductAttributes) => (a.cellular ? true : null);
const notCellular = (a: ProductAttributes) => (a.cellular ? false : null);
const part = (a: ProductAttributes) => (a.partOrAccessory ? true : null);
const men = (a: ProductAttributes) => (a.gender ? a.gender.value === "MEN" : null);
const women = (a: ProductAttributes) => (a.gender ? a.gender.value === "WOMEN" : null);
const both = (x: (a: ProductAttributes) => boolean | null, y: (a: ProductAttributes) => boolean | null) => (a: ProductAttributes) => {
  const p = x(a);
  const q = y(a);
  if (p === false || q === false) return false;
  if (p === true && q === true) return true;
  return null;
};
const textHas = (...phrases: string[]) => (a: ProductAttributes) => (phrases.some((p) => a.normalized.includes(p)) ? true : null);
const speakers = (pred: (n: number) => boolean) => (a: ProductAttributes) => (a.speakerCount ? pred(a.speakerCount.value) : null);

const REQ_COMPOSITION: Requirement = { key: "composition", label: "Malzeme bileşimi (% oranlarıyla, ör. %95 pamuk %5 elastan)", present: (a) => a.materials.some((m) => m.value.pct != null) };
const REQ_CONSTRUCTION: Requirement = { key: "construction", label: "Kumaş yapısı: örme mi dokuma mı", present: (a) => a.construction != null };
const REQ_GENDER: Requirement = { key: "gender", label: "Kimin için: erkek / kadın / çocuk / bebek", present: (a) => a.gender != null };
const REQ_MATERIAL: Requirement = { key: "material", label: "Ana malzeme", present: (a) => a.materials.length > 0 };
const REQ_WIRELESS: Requirement = { key: "wireless", label: "Kablosuz bağlantı var mı (Bluetooth / Wi-Fi / hücresel)", present: (a) => a.wireless.length > 0 || /kablolu|wired/.test(a.normalized) };
const REQ_POWER: Requirement = { key: "power", label: "Güç (W) ve besleme (şebeke / pil)", present: (a) => a.powerW != null || a.battery != null };

// ---------------------------------------------------------------------------
// Concepts
// ---------------------------------------------------------------------------

export const CONCEPTS: Concept[] = [
  // --- Audio / telecom -----------------------------------------------------
  {
    id: "headphones",
    label: "Kulaklık",
    keywords: ["kulaklik", "headphone", "earphone", "earbud", "headset", "kulak ici", "kulak ustu", "in ear", "over ear", "true wireless", "tws"],
    negative: ["kulaklik standi", "headphone stand", "kulak pedi", "ear pad", "ear tip", "kulaklik kilifi"],
    targets: [
      { code: "851830", weight: 1, note: "85.18: başa/kulağa takılan kulaklıklar (mikrofonlu olsun olmasın)" },
      { code: "851762", weight: 0.16, note: "Kablosuz alıcı-verici özelliği nedeniyle 8517.62 (ses/veri alma-verme cihazı) tartışılabilir", when: wireless, whenLabel: "kablosuz bağlantı" },
      { code: "851890", weight: 0.12, note: "Ürün kulaklığın kendisi değil parçası/aksesuarıysa 8518.90", when: part, whenLabel: "parça/aksesuar" },
    ],
    requires: [REQ_WIRELESS],
    compliance: ["ELECTRICAL", "CONSUMER"],
  },
  {
    id: "speaker",
    label: "Hoparlör",
    keywords: ["hoparlor", "speaker", "soundbar", "ses bombasi", "bluetooth hoparlor"],
    negative: ["hoparlor kablosu", "speaker cable", "speaker stand"],
    targets: [
      { code: "851821", weight: 0.8, note: "Kabinine monte edilmiş tek hoparlör", when: speakers((n) => n === 1), whenLabel: "tek hoparlör" },
      { code: "851822", weight: 0.8, note: "Aynı kabine monte edilmiş birden fazla hoparlör", when: speakers((n) => n > 1), whenLabel: "birden fazla hoparlör" },
      { code: "851829", weight: 0.25, note: "Kabinine monte edilmemiş hoparlörler" },
    ],
    requires: [{ key: "speakerCount", label: "Kabindeki hoparlör (sürücü) sayısı", present: (a) => a.speakerCount != null }],
    compliance: ["ELECTRICAL", "CONSUMER"],
  },
  {
    id: "microphone",
    label: "Mikrofon",
    keywords: ["mikrofon", "microphone", "yaka mikrofonu", "podcast mikrofon"],
    negative: ["kulaklik", "headset"],
    targets: [{ code: "851810", weight: 1, note: "Mikrofonlar ve bunların mesnetleri" }],
    compliance: ["ELECTRICAL"],
  },
  {
    id: "smartphone",
    label: "Akıllı telefon",
    keywords: ["akilli telefon", "smartphone", "smart phone", "cep telefonu", "mobile phone", "cell phone", "android telefon", "iphone"],
    negative: ["telefon kilifi", "phone case", "ekran koruyucu", "screen protector", "telefon tutucu", "phone holder"],
    targets: [
      { code: "851713", weight: 1, note: "8517.13: akıllı telefonlar" },
      { code: "851714", weight: 0.2, note: "Akıllı olmayan hücresel telefonlar", when: textHas("tuslu", "feature phone"), whenLabel: "tuşlu/akıllı olmayan" },
    ],
    compliance: ["RADIO", "ELECTRICAL", "BATTERY", "CONSUMER"],
  },
  {
    id: "smartwatch",
    label: "Akıllı saat / bileklik",
    keywords: ["akilli saat", "smartwatch", "smart watch", "akilli bileklik", "fitness tracker", "smart band", "akilli bant"],
    targets: [
      { code: "851762", weight: 1, note: "Veri alan/veren giyilebilir cihaz: 8517.62", when: notCellular, whenLabel: "hücresel bağlantı yok", default: true },
      { code: "851713", weight: 0.7, note: "TGTC 8517.13.00.00.11 'Akıllı saatler (8517.62 alt pozisyonundakiler hariç)' — hücresel bağlantılı saatler", when: cellular, whenLabel: "hücresel bağlantı (e-SIM/LTE)" },
      { code: "910211", weight: 0.08, note: "Yalnız zaman gösteren elektronik kol saati olsaydı 91.02" },
    ],
    requires: [{ key: "cellular", label: "Hücresel bağlantı (e-SIM/LTE) var mı", present: (a) => a.cellular != null || /hucresel|lte|esim|sim/.test(a.normalized) }],
    compliance: ["RADIO", "ELECTRICAL", "BATTERY", "CONSUMER"],
  },
  {
    id: "network",
    label: "Ağ cihazı (router/modem/switch)",
    keywords: ["router", "modem", "access point", "erisim noktasi", "mesh wifi", "network switch", "ag anahtari", "wifi extender", "menzil genisletici"],
    targets: [{ code: "851762", weight: 1, note: "Ağlarda ses/görüntü/veri alma-verme makinaları" }],
    compliance: ["RADIO", "ELECTRICAL"],
  },
  // --- Computing -------------------------------------------------------------
  {
    id: "laptop",
    label: "Dizüstü / tablet bilgisayar",
    keywords: ["laptop", "dizustu", "notebook bilgisayar", "tablet", "ultrabook", "macbook", "chromebook", "ipad"],
    negative: ["laptop cantasi", "laptop bag", "tablet kilifi", "tablet case", "laptop stand", "notebook defter"],
    targets: [
      { code: "847130", weight: 1, note: "Ağırlığı ≤10 kg taşınabilir otomatik bilgi işlem makinaları" },
      { code: "851713", weight: 0.08, note: "Arama yapabilen hücresel tablet tartışılabilir", when: cellular, whenLabel: "hücresel bağlantı" },
    ],
    compliance: ["ELECTRICAL", "BATTERY", "RADIO"],
  },
  {
    id: "desktop",
    label: "Masaüstü bilgisayar",
    keywords: ["masaustu bilgisayar", "desktop pc", "desktop computer", "mini pc", "all in one pc"],
    targets: [
      { code: "847150", weight: 0.7, note: "Diğer işlem birimleri" },
      { code: "847141", weight: 0.4, note: "Aynı muhafaza içinde işlem, giriş ve çıkış birimi olanlar" },
    ],
    compliance: ["ELECTRICAL"],
  },
  {
    id: "peripherals",
    label: "Klavye / fare",
    keywords: ["klavye", "keyboard", "mouse", "kablosuz fare", "oyuncu faresi", "gaming mouse"],
    negative: ["mouse pad", "mousepad", "fare altligi"],
    targets: [{ code: "847160", weight: 1, note: "Giriş veya çıkış birimleri" }],
    compliance: ["ELECTRICAL"],
  },
  {
    id: "monitor",
    label: "Monitör",
    keywords: ["monitor", "ekran monitor", "oyuncu monitoru", "gaming monitor"],
    targets: [
      { code: "852852", weight: 1, note: "Otomatik bilgi işlem makinasına doğrudan bağlanabilen monitörler" },
      { code: "852859", weight: 0.2, note: "Diğer monitörler" },
    ],
    compliance: ["ELECTRICAL"],
  },
  {
    id: "tv",
    label: "Televizyon",
    keywords: ["televizyon", "smart tv", "led tv", "oled tv", "television"],
    targets: [{ code: "852872", weight: 1, note: "Televizyon alıcıları (renkli)" }],
    compliance: ["ELECTRICAL", "RADIO"],
  },
  {
    id: "projector",
    label: "Projektör",
    keywords: ["projeksiyon", "projektor", "projector", "mini projeksiyon"],
    targets: [
      { code: "852862", weight: 0.6, note: "Otomatik bilgi işlem makinasına bağlanabilen projektörler" },
      { code: "852869", weight: 0.6, note: "Diğer projektörler" },
    ],
    compliance: ["ELECTRICAL"],
  },
  {
    id: "storage",
    label: "USB bellek / hafıza kartı / SSD",
    keywords: ["usb bellek", "flash bellek", "usb flash", "flash drive", "hafiza karti", "memory card", "sd kart", "micro sd", "ssd", "harici disk", "external drive"],
    targets: [
      { code: "852351", weight: 1, note: "Yarı iletken kalıcı depolama birimleri" },
      { code: "847170", weight: 0.35, note: "Depolama birimleri (SSD/HDD için tartışmalı)", when: textHas("ssd", "harici disk", "hard disk", "hdd"), whenLabel: "SSD/disk" },
    ],
    compliance: ["ELECTRICAL"],
  },
  // --- Power -----------------------------------------------------------------
  {
    id: "powerbank",
    label: "Powerbank",
    keywords: ["powerbank", "power bank", "tasinabilir sarj", "harici batarya", "portable charger"],
    targets: [
      { code: "850760", weight: 1, note: "Lityum-iyon akümülatörler" },
      { code: "850440", weight: 0.12, note: "Statik konvertör olarak değerlendirilirse 8504.40" },
    ],
    compliance: ["BATTERY", "ELECTRICAL"],
  },
  {
    id: "charger",
    label: "Şarj cihazı / adaptör",
    keywords: ["sarj aleti", "sarj cihazi", "sarj adaptoru", "charger", "adaptor", "adapter", "guc kaynagi", "power supply", "kablosuz sarj"],
    negative: ["powerbank", "power bank", "sarj kablosu", "charging cable"],
    targets: [{ code: "850440", weight: 1, note: "Statik konvertörler (şarj cihazları, adaptörler)" }],
    compliance: ["ELECTRICAL"],
  },
  {
    id: "cable",
    label: "Kablo (konnektörlü)",
    keywords: ["usb kablo", "sarj kablosu", "hdmi kablo", "data kablosu", "charging cable", "usb cable", "hdmi cable", "=kablo"],
    targets: [{ code: "854442", weight: 1, note: "Konnektörlü, gerilimi ≤1000 V elektrik iletkenleri" }],
    compliance: ["ELECTRICAL"],
  },
  {
    id: "battery",
    label: "Pil / akü",
    keywords: ["pil", "battery", "akumulator", "aa pil", "aaa pil", "sarj edilebilir pil", "li ion pil", "battery pack"],
    negative: ["powerbank", "power bank"],
    targets: [
      { code: "850610", weight: 0.6, note: "Manganez dioksitli (alkalin) piller", when: textHas("alkalin", "alkaline"), whenLabel: "alkalin" },
      { code: "850650", weight: 0.4, note: "Lityumlu (şarj edilemeyen) piller", when: both(textHas("lityum", "lithium"), (a) => (/sarj edilebilir|rechargeable/.test(a.normalized) ? false : null)), whenLabel: "şarj edilemeyen lityum" },
      { code: "850760", weight: 0.6, note: "Lityum-iyon akümülatörler (şarj edilebilir)", when: textHas("sarj edilebilir", "rechargeable", "li ion", "lityum iyon"), whenLabel: "şarj edilebilir" },
    ],
    requires: [{ key: "chemistry", label: "Pil kimyası ve şarj edilebilir olup olmadığı", present: (a) => /alkalin|alkaline|lityum|lithium|li ion|ni mh|nimh|sarj edilebilir|rechargeable/.test(a.normalized) }],
    compliance: ["BATTERY"],
  },
  {
    id: "solar",
    label: "Güneş paneli",
    keywords: ["gunes paneli", "solar panel", "fotovoltaik", "photovoltaic", "pv panel"],
    targets: [{ code: "854143", weight: 1, note: "Modül veya panel halindeki fotovoltaik hücreler" }],
    compliance: ["ELECTRICAL"],
  },
  {
    id: "welding",
    label: "Kaynak makinesi",
    keywords: ["kaynak makine", "welding machine", "kaynak makinasi", "inverter kaynak", "welder", "punta kaynak"],
    targets: [
      { code: "851539", weight: 1, note: "Ark kaynağı yapan elektrikli makina ve cihazlar (diğer)" },
      { code: "851531", weight: 0.5, note: "Tam veya yarı otomatik metal ark kaynağı makinaları", when: textHas("otomatik"), whenLabel: "otomatik" },
      { code: "851521", weight: 0.4, note: "Direnç kaynağı (punta) makinaları — tam/yarı otomatik", when: textHas("punta", "direnc kaynak"), whenLabel: "punta/direnç kaynağı" },
    ],
    compliance: ["MACHINERY", "ELECTRICAL"],
  },
  {
    id: "inverter",
    label: "İnvertör",
    keywords: ["inverter", "invertor", "evirici"],
    negative: ["kaynak", "welding", "klima", "buzdolabi"],
    targets: [{ code: "850440", weight: 1, note: "Statik konvertörler" }],
    compliance: ["ELECTRICAL"],
  },
  // --- Imaging / drones --------------------------------------------------------
  {
    id: "camera",
    label: "Kamera",
    keywords: ["fotograf makinesi", "dijital kamera", "digital camera", "aksiyon kamera", "action camera", "webcam", "web kamerasi", "guvenlik kamerasi", "ip kamera", "security camera", "=kamera"],
    negative: ["kamera lensi", "camera bag", "kamera cantasi", "tripod"],
    targets: [
      { code: "852589", weight: 1, note: "Televizyon kameraları, dijital kameralar ve video kamera kaydediciler (diğer)" },
      { code: "852583", weight: 0.1, note: "Gece görüşlü kameralar", when: textHas("gece gorus", "night vision"), whenLabel: "gece görüşü" },
    ],
    compliance: ["ELECTRICAL", "RADIO"],
  },
  {
    id: "drone",
    label: "Drone",
    keywords: ["drone", "dron", "quadcopter", "insansiz hava araci"],
    targets: [{ code: "8806", weight: 1, note: "88.06: insansız hava araçları (alt pozisyon ağırlığa göre)" }],
    requires: [{ key: "weight", label: "Kalkış ağırlığı (kg)", present: (a) => a.weightKg != null }],
    compliance: ["RADIO", "BATTERY"],
  },
  // --- Lighting ----------------------------------------------------------------
  {
    id: "led-lamp",
    label: "LED ampul",
    keywords: ["led ampul", "led bulb", "led lamba", "ampul"],
    targets: [{ code: "853952", weight: 1, note: "LED lambalar" }],
    compliance: ["ELECTRICAL"],
  },
  {
    id: "luminaire",
    label: "Aydınlatma armatürü",
    keywords: ["avize", "aplik", "masa lambasi", "abajur", "lambader", "led serit", "led strip", "aydinlatma armaturu", "luminaire", "ceiling light", "tavan lambasi"],
    targets: [{ code: "9405", weight: 1, note: "94.05: aydınlatma cihazları (alt pozisyon tip ve ışık kaynağına göre)" }],
    compliance: ["ELECTRICAL"],
  },
  // --- Personal care appliances --------------------------------------------------
  {
    id: "hair-dryer",
    label: "Saç kurutma makinesi",
    keywords: ["sac kurutma", "hair dryer", "fon makinesi"],
    targets: [{ code: "851631", weight: 1, note: "Saç kurutma cihazları" }],
    compliance: ["ELECTRICAL", "CONSUMER"],
  },
  {
    id: "hair-styler",
    label: "Saç düzleştirici / maşa",
    keywords: ["sac duzlestirici", "hair straightener", "sac masasi", "curling iron", "sac sekillendirici"],
    targets: [{ code: "851632", weight: 1, note: "Diğer saç bakım cihazları" }],
    compliance: ["ELECTRICAL", "CONSUMER"],
  },
  {
    id: "shaver",
    label: "Tıraş / saç kesme / epilasyon",
    keywords: ["tiras makinesi", "shaver", "sac kesme makinesi", "trimmer", "clipper", "epilator", "epilasyon aleti"],
    targets: [
      { code: "851010", weight: 0.6, note: "Tıraş makinaları", when: textHas("tiras", "shaver"), whenLabel: "tıraş" },
      { code: "851020", weight: 0.6, note: "Saç kesme makinaları", when: textHas("sac kesme", "trimmer", "clipper"), whenLabel: "saç kesme" },
      { code: "851030", weight: 0.6, note: "Epilasyon aletleri", when: textHas("epilat", "epilasyon"), whenLabel: "epilasyon" },
    ],
    compliance: ["ELECTRICAL", "CONSUMER"],
  },
  {
    id: "toothbrush",
    label: "Elektrikli diş fırçası",
    keywords: ["elektrikli dis fircasi", "electric toothbrush", "sarjli dis fircasi"],
    targets: [{ code: "850980", weight: 1, note: "Elektromekanik ev aletleri (diğer)" }],
    compliance: ["ELECTRICAL", "BATTERY"],
  },
  // --- Kitchen / household appliances ------------------------------------------
  {
    id: "kettle",
    label: "Kettle / su ısıtıcı",
    keywords: ["kettle", "su isitici", "elektrikli caydanlik", "cay makinesi"],
    targets: [{ code: "851679", weight: 1, note: "Diğer elektrotermik ev cihazları" }],
    compliance: ["ELECTRICAL", "FOOD_CONTACT"],
  },
  {
    id: "coffee",
    label: "Kahve makinesi",
    keywords: ["kahve makinesi", "coffee maker", "coffee machine", "espresso makinesi", "turk kahvesi makinesi"],
    targets: [{ code: "851671", weight: 1, note: "Kahve veya çay yapmaya mahsus cihazlar" }],
    compliance: ["ELECTRICAL", "FOOD_CONTACT"],
  },
  {
    id: "toaster",
    label: "Ekmek kızartma / tost makinesi",
    keywords: ["ekmek kizartma", "toaster", "tost makinesi"],
    targets: [
      { code: "851672", weight: 0.7, note: "Ekmek kızartma makinaları (toaster)" },
      { code: "851679", weight: 0.5, note: "Tost makinesi ekmek kızartıcı sayılmazsa diğer elektrotermik cihazlar", when: textHas("tost makinesi"), whenLabel: "tost makinesi" },
    ],
    compliance: ["ELECTRICAL", "FOOD_CONTACT"],
  },
  {
    id: "microwave",
    label: "Mikrodalga fırın",
    keywords: ["mikrodalga", "microwave"],
    targets: [{ code: "851650", weight: 1, note: "Mikrodalga fırınlar" }],
    compliance: ["ELECTRICAL", "FOOD_CONTACT"],
  },
  {
    id: "airfryer",
    label: "Airfryer / fritöz / elektrikli fırın",
    keywords: ["airfryer", "air fryer", "fritoz", "elektrikli firin", "mini firin"],
    targets: [{ code: "851660", weight: 1, note: "Diğer fırınlar; ocaklar, pişirme cihazları" }],
    compliance: ["ELECTRICAL", "FOOD_CONTACT"],
  },
  {
    id: "vacuum",
    label: "Elektrikli süpürge",
    keywords: ["elektrikli supurge", "vacuum cleaner", "robot supurge", "robot vacuum", "dikey supurge", "supurge"],
    targets: [
      { code: "850811", weight: 0.7, note: "Gücü ≤1500 W, toz torbası/haznesi ≤20 l olanlar" },
      { code: "850819", weight: 0.4, note: "Diğer elektrikli süpürgeler" },
    ],
    requires: [REQ_POWER],
    compliance: ["ELECTRICAL", "CONSUMER"],
  },
  {
    id: "blender",
    label: "Blender / mikser / mutfak robotu",
    keywords: ["blender", "mikser", "rondo", "mutfak robotu", "food processor", "el blenderi", "hand blender", "mixer"],
    targets: [{ code: "850940", weight: 1, note: "Gıda öğütücüler, karıştırıcılar, meyve/sebze suyu sıkacakları" }],
    compliance: ["ELECTRICAL", "FOOD_CONTACT"],
  },
  {
    id: "iron",
    label: "Ütü",
    keywords: ["utu", "buharli utu", "steam iron", "clothes iron"],
    targets: [{ code: "851640", weight: 1, note: "Elektrikli ütüler" }],
    compliance: ["ELECTRICAL"],
  },
  {
    id: "fan",
    label: "Vantilatör",
    keywords: ["vantilator", "masa fani", "ayakli fan", "desk fan", "standing fan"],
    targets: [{ code: "841451", weight: 1, note: "Gücü ≤125 W masa, yer, duvar vantilatörleri" }],
    requires: [REQ_POWER],
    compliance: ["ELECTRICAL"],
  },
  {
    id: "printer",
    label: "Yazıcı",
    keywords: ["yazici", "printer", "3d yazici", "3d printer"],
    targets: [
      { code: "844332", weight: 1, note: "Bilgi işlem makinasına bağlanabilen yazıcılar", when: (a) => (/3d/.test(a.normalized) ? false : null) },
      { code: "848520", weight: 0.9, note: "Plastik/kauçuk ile eklemeli imalat (3D yazıcı)", when: textHas("3d"), whenLabel: "3D yazıcı" },
    ],
    compliance: ["ELECTRICAL"],
  },
  // --- Games / toys ------------------------------------------------------------
  {
    id: "console",
    label: "Oyun konsolu / oyun kolu",
    keywords: ["oyun konsolu", "game console", "playstation", "xbox", "nintendo", "gamepad", "oyun kolu", "joystick", "controller"],
    targets: [{ code: "950450", weight: 1, note: "Video oyun konsolları ve makinaları" }],
    compliance: ["ELECTRICAL", "RADIO"],
  },
  {
    id: "toy",
    label: "Oyuncak",
    keywords: ["oyuncak", "toy", "lego", "yapboz", "puzzle", "pelus", "plush", "rc araba", "uzaktan kumandali oyuncak", "oyun hamuru"],
    targets: [
      { code: "950300", weight: 1, note: "Oyuncaklar; yapboz; küçültülmüş modeller" },
      { code: "950490", weight: 0.25, note: "Kutu/masa oyunları", when: textHas("kutu oyunu", "board game", "masa oyunu"), whenLabel: "kutu oyunu" },
    ],
    compliance: ["TOY", "CONSUMER"],
  },
  // --- Mobility ----------------------------------------------------------------
  {
    id: "escooter",
    label: "Elektrikli scooter / bisiklet",
    keywords: ["elektrikli scooter", "e scooter", "elektrikli bisiklet", "e bike", "ebike", "electric scooter"],
    targets: [{ code: "871160", weight: 1, note: "Elektrik motorlu motosiklet/bisiklet" }],
    compliance: ["BATTERY", "ELECTRICAL", "VEHICLE_PART"],
  },
  {
    id: "bicycle",
    label: "Bisiklet",
    keywords: ["bisiklet", "bicycle", "dag bisikleti", "mountain bike"],
    negative: ["elektrikli", "e bike", "bisiklet kaski", "bisiklet lambasi", "bisiklet yaka", "bisiklet yakali"],
    targets: [{ code: "871200", weight: 1, note: "Motorsuz bisikletler" }],
    compliance: ["CONSUMER"],
  },
  {
    id: "car-parts",
    label: "Motorlu taşıt parçası",
    keywords: ["oto yedek parca", "araba parcasi", "car part", "fren balatasi", "brake pad", "amortisor", "shock absorber", "debriyaj"],
    targets: [{ code: "8708", weight: 1, note: "87.08: motorlu kara taşıtları için aksam ve parçalar" }],
    compliance: ["VEHICLE_PART"],
  },
  {
    id: "tyre",
    label: "Oto lastiği",
    keywords: ["oto lastigi", "araba lastigi", "tyre", "tire", "kis lastigi", "yaz lastigi"],
    targets: [{ code: "401110", weight: 1, note: "Binek otomobiller için yeni dış lastikler" }],
    compliance: ["VEHICLE_PART"],
  },
  // --- Apparel -----------------------------------------------------------------
  {
    id: "tshirt",
    label: "Tişört / atlet",
    keywords: ["tisort", "t shirt", "tshirt", "tee", "atlet", "singlet", "fanila", "polo yaka tisort"],
    targets: [
      { code: "610910", weight: 1, note: "Örme tişörtler — pamuktan", when: both(isMat(["COTTON"]), (a) => woven(a) === true ? false : true), whenLabel: "ağırlıklı pamuk" },
      { code: "610990", weight: 1, note: "Örme tişörtler — diğer dokumaya elverişli maddelerden", when: both((a) => { const m = mat(a); return m == null ? null : m !== "COTTON"; }, (a) => woven(a) === true ? false : true), whenLabel: "ağırlıklı pamuk dışı" },
      { code: "6205", weight: 0.2, note: "Dokuma ise örme tişört değil, erkek gömleği (62.05)", when: both(woven, men), whenLabel: "dokuma + erkek" },
      { code: "6206", weight: 0.2, note: "Dokuma ise kadın bluzu (62.06)", when: both(woven, women), whenLabel: "dokuma + kadın" },
    ],
    requires: [REQ_COMPOSITION, REQ_CONSTRUCTION],
    compliance: ["TEXTILE", "CONSUMER"],
  },
  {
    id: "sweater",
    label: "Kazak / hırka / sweatshirt",
    keywords: ["kazak", "sweater", "hirka", "cardigan", "sweatshirt", "hoodie", "kapusonlu", "pullover", "triko", "suveter"],
    targets: [
      { code: "611020", weight: 1, note: "Örme kazak/hırka — pamuktan", when: isMat(["COTTON"]), whenLabel: "pamuk" },
      { code: "611030", weight: 1, note: "Örme kazak/hırka — sentetik veya suni liflerden", when: isMat([...SYNTHETIC, "VISCOSE"]), whenLabel: "sentetik/suni lif" },
      { code: "611011", weight: 1, note: "Örme kazak/hırka — yünden", when: isMat(["WOOL"]), whenLabel: "yün" },
      { code: "611090", weight: 0.3, note: "Örme kazak/hırka — diğer maddelerden" },
    ],
    requires: [REQ_COMPOSITION],
    compliance: ["TEXTILE", "CONSUMER"],
  },
  {
    id: "shirt",
    label: "Gömlek / bluz",
    keywords: ["gomlek", "shirt", "bluz", "blouse"],
    negative: ["t shirt", "tshirt", "tisort", "sweatshirt"],
    targets: [
      { code: "6205", weight: 1, note: "Erkek gömlekleri (dokuma)", when: both(men, (a) => (knitted(a) === true ? false : null)), whenLabel: "erkek + dokuma" },
      { code: "6206", weight: 1, note: "Kadın bluz ve gömlekleri (dokuma)", when: both(women, (a) => (knitted(a) === true ? false : null)), whenLabel: "kadın + dokuma" },
      { code: "6105", weight: 0.7, note: "Erkek gömlekleri (örme)", when: both(men, knitted), whenLabel: "erkek + örme" },
      { code: "6106", weight: 0.7, note: "Kadın bluz ve gömlekleri (örme)", when: both(women, knitted), whenLabel: "kadın + örme" },
    ],
    requires: [REQ_GENDER, REQ_CONSTRUCTION, REQ_COMPOSITION],
    compliance: ["TEXTILE", "CONSUMER"],
  },
  {
    id: "trousers",
    label: "Pantolon / jean / şort",
    keywords: ["pantolon", "jean", "kot pantolon", "trousers", "pants", "sort", "shorts", "esofman alti", "tayt", "leggings"],
    targets: [
      { code: "6203", weight: 1, note: "Erkek pantolon ve şortları (dokuma)", when: both(men, (a) => (knitted(a) === true ? false : null)), whenLabel: "erkek + dokuma" },
      { code: "6204", weight: 1, note: "Kadın pantolon ve şortları (dokuma)", when: both(women, (a) => (knitted(a) === true ? false : null)), whenLabel: "kadın + dokuma" },
      { code: "6103", weight: 0.7, note: "Erkek pantolon ve şortları (örme)", when: both(men, knitted), whenLabel: "erkek + örme" },
      { code: "6104", weight: 0.7, note: "Kadın pantolon, şort ve taytları (örme)", when: both(women, knitted), whenLabel: "kadın + örme" },
    ],
    requires: [REQ_GENDER, REQ_CONSTRUCTION, REQ_COMPOSITION],
    compliance: ["TEXTILE", "CONSUMER"],
  },
  {
    id: "dress",
    label: "Elbise / etek",
    keywords: ["elbise", "dress", "etek", "skirt"],
    negative: ["elbise askisi", "elbise dolabi"],
    targets: [
      { code: "6204", weight: 1, note: "Kadın elbise ve etekleri (dokuma)", when: (a) => (knitted(a) === true ? false : null) },
      { code: "6104", weight: 0.8, note: "Kadın elbise ve etekleri (örme)", when: knitted, whenLabel: "örme" },
    ],
    requires: [REQ_CONSTRUCTION, REQ_COMPOSITION],
    compliance: ["TEXTILE", "CONSUMER"],
  },
  {
    id: "outerwear",
    label: "Mont / kaban / ceket",
    keywords: ["mont", "kaban", "parka", "jacket", "coat", "yagmurluk", "sisme mont", "puffer", "ruzgarlik", "windbreaker"],
    targets: [
      { code: "6201", weight: 1, note: "Erkek palto, mont ve rüzgarlıkları (dokuma)", when: both(men, (a) => (knitted(a) === true ? false : null)), whenLabel: "erkek + dokuma" },
      { code: "6202", weight: 1, note: "Kadın palto, mont ve rüzgarlıkları (dokuma)", when: both(women, (a) => (knitted(a) === true ? false : null)), whenLabel: "kadın + dokuma" },
      { code: "6101", weight: 0.5, note: "Erkek mont (örme)", when: both(men, knitted), whenLabel: "erkek + örme" },
      { code: "6102", weight: 0.5, note: "Kadın mont (örme)", when: both(women, knitted), whenLabel: "kadın + örme" },
    ],
    requires: [REQ_GENDER, REQ_CONSTRUCTION, REQ_COMPOSITION],
    compliance: ["TEXTILE", "CONSUMER"],
  },
  {
    id: "underwear",
    label: "İç çamaşırı / pijama",
    keywords: ["ic camasiri", "boxer", "slip", "kulot", "underwear", "brief", "pijama", "pyjama", "gecelik", "sutyen", "bra"],
    targets: [
      { code: "6107", weight: 1, note: "Erkek iç çamaşırı, pijama (örme)", when: both(men, (a) => (woven(a) === true ? false : null)), whenLabel: "erkek + örme" },
      { code: "6108", weight: 1, note: "Kadın iç çamaşırı, gecelik, pijama (örme)", when: both(women, (a) => (woven(a) === true ? false : null)), whenLabel: "kadın + örme" },
      { code: "621210", weight: 0.9, note: "Sütyenler", when: textHas("sutyen", "bra"), whenLabel: "sütyen" },
    ],
    requires: [REQ_GENDER, REQ_COMPOSITION],
    compliance: ["TEXTILE", "CONSUMER"],
  },
  {
    id: "socks",
    label: "Çorap",
    keywords: ["corap", "sock", "kulotlu corap", "tights"],
    targets: [{ code: "6115", weight: 1, note: "61.15: külotlu çoraplar, çoraplar (örme)" }],
    requires: [REQ_COMPOSITION],
    compliance: ["TEXTILE", "CONSUMER"],
  },
  {
    id: "babywear",
    label: "Bebek giyimi",
    keywords: ["bebek zibin", "zibin", "bebek body", "tulum bebek", "baby romper", "bebek giyim", "baby clothes"],
    targets: [
      { code: "6111", weight: 1, note: "Bebek giyim eşyası (örme)", when: (a) => (woven(a) === true ? false : null) },
      { code: "6209", weight: 0.6, note: "Bebek giyim eşyası (dokuma)", when: woven, whenLabel: "dokuma" },
    ],
    requires: [REQ_COMPOSITION],
    compliance: ["TEXTILE", "BABY", "CONSUMER"],
  },
  {
    id: "scarf",
    label: "Atkı / şal / eşarp",
    keywords: ["atki", "sal", "esarp", "scarf", "fular", "boyunluk"],
    targets: [
      { code: "611710", weight: 0.7, note: "Şal, atkı, eşarp (örme)", when: knitted, whenLabel: "örme" },
      { code: "6214", weight: 0.7, note: "Şal, atkı, eşarp (örme olmayan)", when: (a) => (knitted(a) === true ? false : null) },
    ],
    requires: [REQ_CONSTRUCTION, REQ_COMPOSITION],
    compliance: ["TEXTILE"],
  },
  {
    id: "hat",
    label: "Şapka / bere",
    keywords: ["sapka", "bere", "kasket", "beanie", "baseball cap", "bucket hat"],
    targets: [{ code: "650500", weight: 1, note: "Örme veya dantel/keçe/diğer mensucattan başlıklar" }],
    compliance: ["TEXTILE"],
  },
  {
    id: "gloves",
    label: "Eldiven",
    keywords: ["eldiven", "glove"],
    targets: [
      { code: "6116", weight: 0.7, note: "Örme eldivenler", when: (a) => (hasMat(["LEATHER", "PLASTIC", "RUBBER"])(a) === true ? false : null) },
      { code: "420329", weight: 0.6, note: "Deri eldivenler", when: hasMat(["LEATHER"]), whenLabel: "deri" },
      { code: "392620", weight: 0.4, note: "Plastik eldivenler", when: hasMat(["PLASTIC"]), whenLabel: "plastik" },
      { code: "401519", weight: 0.4, note: "Kauçuk eldivenler", when: hasMat(["RUBBER"]), whenLabel: "kauçuk" },
    ],
    requires: [REQ_MATERIAL],
    compliance: ["PPE", "TEXTILE"],
  },
  // --- Home textiles -------------------------------------------------------------
  {
    id: "towel",
    label: "Havlu / bornoz",
    keywords: ["havlu", "towel", "bornoz", "bathrobe", "plaj havlusu"],
    targets: [
      { code: "630260", weight: 1, note: "Tuvalet/mutfak bezleri — pamuktan havlu kumaştan", when: (a) => (textHas("bornoz", "bathrobe")(a) ? false : isMat(["COTTON"])(a)) },
      { code: "630291", weight: 0.5, note: "Diğer — pamuktan" },
      { code: "6107", weight: 0.4, note: "Bornoz (erkek, örme)", when: both(textHas("bornoz", "bathrobe"), men), whenLabel: "bornoz" },
      { code: "6108", weight: 0.4, note: "Bornoz (kadın, örme)", when: both(textHas("bornoz", "bathrobe"), women), whenLabel: "bornoz" },
    ],
    requires: [REQ_COMPOSITION],
    compliance: ["TEXTILE"],
  },
  {
    id: "bedlinen",
    label: "Nevresim / çarşaf",
    keywords: ["nevresim", "carsaf", "yastik kilifi", "bed linen", "duvet cover", "sheet set", "pike takimi"],
    targets: [{ code: "6302", weight: 1, note: "63.02: yatak çarşafları, masa örtüleri, tuvalet ve mutfak bezleri" }],
    requires: [REQ_COMPOSITION],
    compliance: ["TEXTILE"],
  },
  {
    id: "blanket",
    label: "Battaniye",
    keywords: ["battaniye", "blanket", "polar battaniye"],
    targets: [{ code: "6301", weight: 1, note: "63.01: battaniyeler" }],
    requires: [REQ_COMPOSITION],
    compliance: ["TEXTILE"],
  },
  {
    id: "curtain",
    label: "Perde",
    keywords: ["perde", "curtain", "stor perde"],
    targets: [{ code: "6303", weight: 1, note: "63.03: perdeler, stor perdeler" }],
    requires: [REQ_COMPOSITION],
    compliance: ["TEXTILE"],
  },
  {
    id: "carpet",
    label: "Halı / kilim",
    keywords: ["salon halisi", "hali kilim", "kilim", "carpet", "rug", "paspas", "yolluk"],
    targets: [
      { code: "5703", weight: 0.6, note: "Tufte halılar" },
      { code: "5702", weight: 0.5, note: "Dokuma halılar ve kilimler" },
      { code: "5705", weight: 0.3, note: "Diğer halılar" },
    ],
    requires: [{ key: "carpetMaking", label: "Halının yapım şekli (tufte / dokuma / keçe)", present: (a) => /tufte|tufted|dokuma|woven|kece|felt/.test(a.normalized) }],
    compliance: ["TEXTILE"],
  },
  // --- Bags / footwear / accessories --------------------------------------------
  {
    id: "bag",
    label: "Çanta / cüzdan / valiz",
    keywords: ["canta", "el cantasi", "handbag", "sirt cantasi", "backpack", "cuzdan", "wallet", "valiz", "bavul", "suitcase", "laptop cantasi", "tote bag", "bag"],
    targets: [
      { code: "420221", weight: 0.8, note: "El çantaları — dış yüzü deri", when: both(textHas("el canta", "handbag", "omuz canta"), hasMat(["LEATHER"])), whenLabel: "el çantası + deri" },
      { code: "420222", weight: 0.8, note: "El çantaları — dış yüzü plastik levha veya mensucat", when: both(textHas("el canta", "handbag", "omuz canta", "tote"), hasMat(["PLASTIC", ...SYNTHETIC, "COTTON"])), whenLabel: "el çantası + plastik/tekstil" },
      { code: "420292", weight: 0.8, note: "Sırt çantası vb. — dış yüzü plastik levha veya mensucat", when: textHas("sirt canta", "backpack", "laptop canta"), whenLabel: "sırt/laptop çantası" },
      { code: "420231", weight: 0.7, note: "Cep/çanta eşyası (cüzdan) — deri", when: both(textHas("cuzdan", "wallet"), hasMat(["LEATHER"])), whenLabel: "cüzdan + deri" },
      { code: "420232", weight: 0.7, note: "Cep/çanta eşyası (cüzdan) — plastik/mensucat", when: both(textHas("cuzdan", "wallet"), (a) => (hasMat(["LEATHER"])(a) === true ? false : null)), whenLabel: "cüzdan + deri değil" },
      { code: "420212", weight: 0.7, note: "Valiz/bavul — dış yüzü plastik veya mensucat", when: textHas("valiz", "bavul", "suitcase", "trolley"), whenLabel: "valiz" },
    ],
    requires: [REQ_MATERIAL],
    compliance: ["CONSUMER"],
  },
  {
    id: "phone-case",
    label: "Telefon kılıfı",
    keywords: ["telefon kilifi", "phone case", "iphone kilif", "kilif"],
    targets: [
      { code: "420232", weight: 0.6, note: "Cepte taşınan eşya kutuları — dış yüzü plastik levha/mensucat" },
      { code: "392690", weight: 0.5, note: "Kalıplanmış sert plastik kılıflar plastikten diğer eşya sayılabilir" },
    ],
    requires: [REQ_MATERIAL],
    compliance: ["CONSUMER"],
  },
  {
    id: "footwear",
    label: "Ayakkabı / bot / terlik",
    keywords: ["ayakkabi", "sneaker", "spor ayakkabi", "bot", "cizme", "terlik", "sandalet", "shoe", "boot", "slipper", "sandal", "loafer"],
    negative: ["ayakkabi bagi", "shoe lace", "ayakkabi boyasi", "ayakkabilik"],
    targets: [
      { code: "6403", weight: 0.9, note: "Yüzü deri ayakkabılar", when: hasMat(["LEATHER"]), whenLabel: "yüzü deri" },
      { code: "64039", weight: 1, note: "Yüzü deri, dış tabanı kauçuk/plastik ayakkabılar (64.03 — diğer ayakkabılar)", when: both(hasMat(["LEATHER"]), textHas("kaucuk taban", "plastik taban", "rubber sole", "eva taban", "poliuretan taban", "termo taban")), whenLabel: "yüzü deri + kauçuk/plastik taban" },
      { code: "64035", weight: 1, note: "Yüzü ve dış tabanı deri ayakkabılar", when: textHas("deri taban", "leather sole", "kosele taban"), whenLabel: "deri taban" },
      { code: "6404", weight: 0.9, note: "Yüzü dokumaya elverişli maddeden ayakkabılar", when: hasMat([...SYNTHETIC, "COTTON", "WOOL", "LINEN"]), whenLabel: "yüzü tekstil" },
      { code: "6402", weight: 0.7, note: "Dış tabanı ve yüzü kauçuk/plastik ayakkabılar", when: (a) => (hasMat(["LEATHER"])(a) === true ? false : hasMat(["RUBBER", "PLASTIC"])(a)), whenLabel: "yüzü kauçuk/plastik" },
    ],
    requires: [
      { key: "upperMaterial", label: "Yüz (saya) ve dış taban malzemesi", present: (a) => a.materials.length > 0 && /taban|sole/.test(a.normalized) },
      { key: "ankle", label: "Bileği örtüyor mu (bot / ayakkabı)", present: (a) => /bilek|ankle|bot|cizme|boot|terlik|sandalet|slipper|sandal/.test(a.normalized) },
    ],
    compliance: ["FOOTWEAR_LEATHER", "CONSUMER"],
  },
  {
    id: "watch",
    label: "Kol saati",
    keywords: ["kol saati", "wrist watch", "wristwatch", "^saat"],
    negative: ["akilli saat", "smartwatch", "smart watch", "duvar saati", "masa saati", "alarm saati"],
    targets: [
      { code: "9102", weight: 1, note: "91.02: kol saatleri (kasası kıymetli metal olmayan)" },
      { code: "9101", weight: 0.15, note: "Kasası kıymetli metalden kol saatleri", when: textHas("altin", "gold", "platin", "platinum"), whenLabel: "kıymetli metal kasa" },
    ],
    compliance: ["CONSUMER"],
  },
  {
    id: "sunglasses",
    label: "Güneş gözlüğü / gözlük çerçevesi",
    keywords: ["gunes gozlugu", "sunglasses", "gozluk cercevesi", "eyeglass frame", "gozluk"],
    targets: [
      { code: "900410", weight: 1, note: "Güneş gözlükleri", when: (a) => (/cerceve|frame/.test(a.normalized) ? false : null) },
      { code: "9003", weight: 0.6, note: "Gözlük çerçeveleri", when: textHas("cerceve", "frame"), whenLabel: "çerçeve" },
    ],
    compliance: ["CONSUMER", "PPE"],
  },
  {
    id: "jewelry",
    label: "Takı",
    keywords: ["taki", "kolye", "kupe", "yuzuk", "bileklik", "necklace", "earring", "ring", "bracelet", "jewelry", "jewellery"],
    negative: ["akilli bileklik", "smart band"],
    targets: [
      { code: "7117", weight: 1, note: "Taklit mücevherci eşyası", when: (a) => (/altin|gold|gumus|silver|925|platin/.test(a.normalized) ? false : null) },
      { code: "7113", weight: 0.9, note: "Kıymetli metalden mücevherci eşyası", when: textHas("altin", "gold", "gumus", "silver", "925", "platin"), whenLabel: "kıymetli metal" },
    ],
    compliance: ["CONSUMER"],
  },
  // --- Home / kitchen goods ------------------------------------------------------
  {
    id: "furniture",
    label: "Mobilya",
    keywords: ["mobilya", "furniture", "sehpa", "dolap", "gardirop", "kitaplik", "calisma masasi", "yemek masasi", "tv unitesi", "wardrobe", "cabinet", "bookshelf"],
    targets: [{ code: "9403", weight: 1, note: "94.03: diğer mobilyalar (alt pozisyon malzeme ve kullanım yerine göre)" }],
    requires: [REQ_MATERIAL],
    compliance: ["CONSUMER"],
  },
  {
    id: "seating",
    label: "Sandalye / koltuk",
    keywords: ["sandalye", "koltuk", "kanepe", "sofa", "chair", "berjer", "ofis koltugu", "office chair", "tabure", "stool"],
    targets: [{ code: "9401", weight: 1, note: "94.01: oturmaya mahsus mobilya" }],
    compliance: ["CONSUMER"],
  },
  {
    id: "mattress",
    label: "Yatak / yastık",
    keywords: ["sunger yatak", "yatak", "mattress", "visco yastik", "yastik", "pillow"],
    negative: ["yastik kilifi", "yatak ortusu", "baza"],
    targets: [
      { code: "940421", weight: 0.6, note: "Yataklar — hücreli kauçuk/plastikten", when: textHas("sunger", "foam", "visco", "latex"), whenLabel: "sünger/köpük" },
      { code: "940429", weight: 0.5, note: "Yataklar — diğer maddelerden (yaylı vb.)", when: textHas("yayli", "spring"), whenLabel: "yaylı" },
      { code: "940490", weight: 0.5, note: "Yastık, yorgan vb. (diğer)", when: textHas("yastik", "pillow", "yorgan", "quilt"), whenLabel: "yastık/yorgan" },
    ],
    compliance: ["CONSUMER"],
  },
  {
    id: "plastic-kitchen",
    label: "Plastik mutfak / sofra eşyası",
    keywords: ["saklama kabi", "food container", "plastik tabak", "plastik bardak", "matara", "plastik kutu", "lunch box", "beslenme kabi"],
    targets: [
      { code: "392410", weight: 1, note: "Plastikten sofra ve mutfak eşyası", when: (a) => (hasMat(["STAINLESS_STEEL", "STEEL", "ALUMINIUM", "GLASS"])(a) === true ? false : null) },
      { code: "392390", weight: 0.2, note: "Plastikten taşıma/ambalaj kapları" },
    ],
    requires: [REQ_MATERIAL],
    compliance: ["FOOD_CONTACT"],
  },
  {
    id: "cookware",
    label: "Tencere / tava",
    keywords: ["tencere", "tava", "cookware", "frying pan", "dudukle tencere", "wok", "sahan", "cezve", "caydanlik"],
    targets: [
      { code: "732393", weight: 0.9, note: "Paslanmaz çelikten sofra/mutfak eşyası", when: isMat(["STAINLESS_STEEL"]), whenLabel: "paslanmaz çelik" },
      { code: "732391", weight: 0.7, note: "Dökme demirden (emaye edilmemiş)", when: textHas("dokum", "cast iron"), whenLabel: "döküm" },
      { code: "761510", weight: 0.9, note: "Alüminyumdan sofra/mutfak eşyası", when: isMat(["ALUMINIUM"]), whenLabel: "alüminyum" },
      { code: "732394", weight: 0.5, note: "Emaye edilmiş demir/çelikten", when: textHas("emaye", "enamel"), whenLabel: "emaye" },
    ],
    requires: [REQ_MATERIAL],
    compliance: ["FOOD_CONTACT"],
  },
  {
    id: "cutlery",
    label: "Çatal-kaşık / bıçak",
    keywords: ["catal", "kasik", "catal bicak takimi", "cutlery", "spoon", "fork", "mutfak bicagi", "kitchen knife", "bicak"],
    targets: [
      { code: "8215", weight: 0.9, note: "82.15: kaşık, çatal, kepçe vb.", when: (a) => (/bicak|knife/.test(a.normalized) && !/catal|kasik|spoon|fork/.test(a.normalized) ? false : null) },
      { code: "8211", weight: 0.8, note: "82.11: bıçaklar", when: textHas("bicak", "knife"), whenLabel: "bıçak" },
    ],
    compliance: ["FOOD_CONTACT"],
  },
  {
    id: "glassware",
    label: "Cam bardak / sürahi",
    keywords: ["cam bardak", "bardak", "surahi", "glass cup", "drinking glass", "kadeh", "wine glass"],
    negative: ["plastik bardak", "karton bardak", "paper cup"],
    targets: [
      { code: "7013", weight: 1, note: "70.13: sofra/mutfak için camdan eşya", when: (a) => (hasMat(["PLASTIC", "PAPER"])(a) === true ? false : null) },
      { code: "392410", weight: 0.3, note: "Plastikten bardak", when: hasMat(["PLASTIC"]), whenLabel: "plastik" },
    ],
    compliance: ["FOOD_CONTACT"],
  },
  {
    id: "tableware",
    label: "Tabak / fincan / kupa",
    keywords: ["=tabak", "fincan", "kupa", "mug", "plate", "yemek takimi", "dinner set", "kase", "bowl", "servis tabagi"],
    negative: ["plastik tabak", "karton tabak", "paper plate"],
    targets: [
      { code: "691110", weight: 0.9, note: "Porselenden sofra ve mutfak eşyası", when: isMat(["PORCELAIN"]), whenLabel: "porselen" },
      { code: "6912", weight: 0.8, note: "Porselen dışı seramikten sofra eşyası", when: isMat(["CERAMIC"]), whenLabel: "seramik" },
      { code: "7013", weight: 0.6, note: "Camdan sofra eşyası", when: isMat(["GLASS"]), whenLabel: "cam" },
      { code: "392410", weight: 0.6, note: "Plastikten sofra eşyası", when: isMat(["PLASTIC"]), whenLabel: "plastik" },
      { code: "732393", weight: 0.5, note: "Paslanmaz çelikten sofra eşyası", when: isMat(["STAINLESS_STEEL"]), whenLabel: "paslanmaz çelik" },
    ],
    requires: [REQ_MATERIAL],
    compliance: ["FOOD_CONTACT"],
  },
  {
    id: "candle",
    label: "Mum",
    keywords: ["mum", "candle", "kokulu mum"],
    targets: [{ code: "340600", weight: 1, note: "Mumlar" }],
    compliance: ["CONSUMER"],
  },
  // --- Cosmetics -----------------------------------------------------------------
  {
    id: "perfume",
    label: "Parfüm",
    keywords: ["parfum", "perfume", "edt", "edp", "eau de parfum", "eau de toilette", "kolonya", "body mist"],
    targets: [{ code: "330300", weight: 1, note: "Parfümler ve tuvalet suları" }],
    compliance: ["COSMETIC"],
  },
  {
    id: "makeup",
    label: "Makyaj / cilt bakım",
    keywords: ["ruj", "lipstick", "rimel", "maskara", "mascara", "eyeliner", "fondoten", "foundation", "nemlendirici", "moisturizer", "serum", "cilt bakim", "skincare", "yuz kremi", "gunes kremi", "sunscreen", "oje", "nail polish", "pudra", "allik"],
    targets: [
      { code: "330410", weight: 0.8, note: "Dudak makyaj müstahzarları", when: textHas("ruj", "lipstick", "dudak"), whenLabel: "dudak" },
      { code: "330420", weight: 0.8, note: "Göz makyaj müstahzarları", when: textHas("rimel", "maskara", "mascara", "eyeliner", "far "), whenLabel: "göz" },
      { code: "330430", weight: 0.8, note: "El ve ayak tırnakları için müstahzarlar", when: textHas("oje", "nail"), whenLabel: "tırnak" },
      { code: "330491", weight: 0.6, note: "Pudralar", when: textHas("pudra", "powder"), whenLabel: "pudra" },
      { code: "330499", weight: 0.7, note: "Diğer güzellik/cilt bakım müstahzarları" },
    ],
    compliance: ["COSMETIC"],
  },
  {
    id: "haircare",
    label: "Şampuan / saç bakım",
    keywords: ["sampuan", "shampoo", "sac kremi", "conditioner", "sac maskesi", "sac serumu"],
    targets: [
      { code: "330510", weight: 1, note: "Şampuanlar", when: (a) => (/sampuan|shampoo/.test(a.normalized) ? true : null) },
      { code: "330590", weight: 0.6, note: "Diğer saç müstahzarları" },
    ],
    compliance: ["COSMETIC"],
  },
  {
    id: "soap",
    label: "Sabun",
    keywords: ["sabun", "soap", "sivi sabun", "liquid soap"],
    targets: [
      { code: "340111", weight: 0.8, note: "Tuvalet sabunları (katı)", when: (a) => (/sivi|liquid/.test(a.normalized) ? false : null) },
      { code: "340130", weight: 0.8, note: "Cilt yıkamaya mahsus sıvı müstahzarlar", when: textHas("sivi", "liquid"), whenLabel: "sıvı" },
    ],
    compliance: ["COSMETIC"],
  },
  {
    id: "oralcare",
    label: "Diş macunu",
    keywords: ["dis macunu", "toothpaste"],
    targets: [{ code: "330610", weight: 1, note: "Diş macunları" }],
    compliance: ["COSMETIC"],
  },
  {
    id: "deodorant",
    label: "Deodorant",
    keywords: ["deodorant", "roll on", "antiperspirant"],
    targets: [{ code: "330720", weight: 1, note: "Deodorantlar ve ter önleyiciler" }],
    compliance: ["COSMETIC"],
  },
  // --- Stationery / tools / sports / packaging / medical -------------------------
  {
    id: "notebook",
    label: "Defter / ajanda",
    keywords: ["defter", "ajanda", "planner", "not defteri"],
    targets: [{ code: "482010", weight: 1, note: "Defterler, ajandalar, not defterleri" }],
    compliance: ["CONSUMER"],
  },
  {
    id: "pen",
    label: "Kalem",
    keywords: ["kalem", "tukenmez", "ballpoint", "pen", "kursun kalem", "pencil", "marker", "kececi kalem"],
    targets: [
      { code: "9608", weight: 1, note: "96.08: tükenmez, keçe uçlu kalemler vb.", when: (a) => (/kursun|pencil/.test(a.normalized) ? false : null) },
      { code: "9609", weight: 0.6, note: "96.09: kurşun kalemler", when: textHas("kursun", "pencil"), whenLabel: "kurşun kalem" },
    ],
    compliance: ["CONSUMER"],
  },
  {
    id: "drill",
    label: "Elektrikli el aleti",
    keywords: ["matkap", "drill", "sarjli matkap", "vidalama", "taslama", "angle grinder", "dekupaj", "jigsaw"],
    targets: [
      { code: "846721", weight: 0.9, note: "Elektrik motorlu elde kullanılan matkaplar", when: textHas("matkap", "drill", "vidalama"), whenLabel: "matkap" },
      { code: "846729", weight: 0.6, note: "Diğer elektrik motorlu el aletleri" },
    ],
    compliance: ["MACHINERY", "ELECTRICAL"],
  },
  {
    id: "handtools",
    label: "El aleti",
    keywords: ["tornavida", "pense", "anahtar takimi", "screwdriver", "pliers", "wrench", "cekic", "hammer", "alet cantasi", "tool set"],
    targets: [
      { code: "8205", weight: 0.8, note: "82.05: el aletleri (tornavida, çekiç vb.)" },
      { code: "8203", weight: 0.4, note: "82.03: pense, kerpeten vb.", when: textHas("pense", "pliers", "kerpeten"), whenLabel: "pense" },
      { code: "8204", weight: 0.4, note: "82.04: somun anahtarları", when: textHas("anahtar", "wrench"), whenLabel: "anahtar" },
    ],
    compliance: ["CONSUMER"],
  },
  {
    id: "sports",
    label: "Spor malzemesi",
    keywords: ["yoga mati", "dumbbell", "dambil", "fitness", "kosu bandi", "treadmill", "direnc bandi", "resistance band", "futbol topu", "basketbol topu", "football", "basketball"],
    targets: [
      { code: "950691", weight: 0.8, note: "Genel fiziksel egzersiz, jimnastik eşyası" },
      { code: "950662", weight: 0.6, note: "Şişirilebilir toplar", when: textHas("topu", " ball"), whenLabel: "top" },
    ],
    compliance: ["CONSUMER"],
  },
  {
    id: "helmet",
    label: "Kask",
    keywords: ["kask", "helmet", "bisiklet kaski", "motosiklet kaski"],
    targets: [{ code: "650610", weight: 1, note: "Koruyucu başlıklar (kasklar)" }],
    compliance: ["PPE"],
  },
  {
    id: "plastic-bag",
    label: "Plastik poşet / torba",
    keywords: ["poset", "plastik torba", "plastic bag", "cop torbasi", "ambalaj torbasi"],
    targets: [
      { code: "392321", weight: 0.8, note: "Etilen polimerlerinden torba ve çantalar" },
      { code: "392329", weight: 0.5, note: "Diğer plastiklerden torba ve çantalar" },
    ],
    requires: [{ key: "polymer", label: "Plastik türü (PE / PP / diğer)", present: (a) => /polietilen|polyethylene|pe |ldpe|hdpe|polipropilen|polypropylene/.test(a.normalized) }],
    compliance: ["FOOD_CONTACT"],
  },
  {
    id: "mask",
    label: "Yüz maskesi",
    keywords: ["yuz maskesi", "cerrahi maske", "face mask", "ffp2", "n95"],
    targets: [
      { code: "630790", weight: 0.8, note: "Mensucattan diğer hazır eşya (maskeler)" },
      { code: "902000", weight: 0.2, note: "Değiştirilebilir filtreli solunum cihazları", when: textHas("filtreli", "respirator"), whenLabel: "filtreli" },
    ],
    compliance: ["PPE", "MEDICAL"],
  },
  {
    id: "bp-monitor",
    label: "Tansiyon aleti / termometre",
    keywords: ["tansiyon aleti", "blood pressure monitor", "termometre", "thermometer", "ates olcer"],
    targets: [
      { code: "901890", weight: 0.8, note: "Tıpta kullanılan diğer alet ve cihazlar", when: textHas("tansiyon", "blood pressure"), whenLabel: "tansiyon" },
      { code: "902519", weight: 0.8, note: "Termometreler (sıvılı olmayan)", when: textHas("termometre", "thermometer", "ates"), whenLabel: "termometre" },
    ],
    compliance: ["MEDICAL", "ELECTRICAL"],
  },
];

// ---------------------------------------------------------------------------
// Matching
// ---------------------------------------------------------------------------

/** Endings a whole-word keyword may still carry: plural, possessive, accusative. */
const WORD_SUFFIX = "(?:ler|lar|leri|lari|s|es|i|u|si|su|yi|yu)?";

/**
 * Keyword match at a word start. Long last words match as a prefix
 * ("kulaklik" → "kulakliklar", "headphone" → "headphones"); short words and
 * words marked "=" must be the whole word, because as a prefix they hit other
 * words entirely: "kablo" → "kablosuz", "mont" → "monte", "bot" → "bottle".
 */
export function phraseAt(text: string, keyword: string): boolean {
  if (!keyword) return false;
  const exact = keyword.startsWith("=");
  const words = (exact ? keyword.slice(1) : keyword).split(" ").filter(Boolean);
  if (words.length === 0) return false;
  const last = words[words.length - 1]!;
  const head = words.slice(0, -1).map((w) => `${w}\\s+`).join("");
  const tail = exact || last.length <= 4 ? `${last}${WORD_SUFFIX}(?=\\s|$)` : last;
  return new RegExp(`(^|\\s)${head}${tail}`).test(text);
}

export type ConceptMatch = {
  concept: Concept;
  score: number;
  matched: string[];
  inName: boolean;
  negativeHits: string[];
};

export function matchConcepts(a: ProductAttributes): ConceptMatch[] {
  const out: ConceptMatch[] = [];
  for (const c of CONCEPTS) {
    const matched = c.keywords.filter((k) => (k.startsWith("^") ? phraseAt(a.normalizedName, k.slice(1)) : phraseAt(a.normalized, k)));
    if (matched.length === 0) continue;
    const inName = matched.some((k) => phraseAt(a.normalizedName, k.replace(/^^/, "")));
    // Longest matched phrase is the strongest signal ("bluetooth hoparlor" > "hoparlor").
    const longest = Math.max(...matched.map((k) => k.split(" ").length));
    let score = (inName ? 3 : 1.5) + (longest - 1) * 0.5 + Math.min(matched.length - 1, 3) * 0.3;
    const negativeHits = (c.negative ?? []).filter((k) => phraseAt(a.normalized, k));
    if (negativeHits.length > 0) score *= 0.3;
    out.push({ concept: c, score, matched, inName, negativeHits });
  }
  // A product NAMED as one thing whose description merely mentions another
  // ("tişört … bisiklet yaka") is the first thing.
  if (out.some((m) => m.inName)) for (const m of out) if (!m.inName) m.score *= 0.5;
  return out.sort((x, y) => y.score - x.score);
}

/** Extra search words implied by attributes, in the tariff's own vocabulary. */
export function tariffVocabulary(a: ProductAttributes): string[] {
  const out = new Set<string>();
  for (const m of a.materials) {
    const k = m.value.material;
    if (k === "COTTON") out.add("pamuk");
    if (SYNTHETIC.includes(k)) out.add("sentetik");
    if (k === "VISCOSE") out.add("suni");
    if (k === "WOOL") out.add("yun");
    if (k === "LEATHER") out.add("deri");
    if (k === "PLASTIC") out.add("plastik");
    if (k === "STAINLESS_STEEL") out.add("paslanmaz");
    if (k === "ALUMINIUM") out.add("aluminyum");
    if (k === "PORCELAIN") out.add("porselen");
    if (k === "GLASS") out.add("cam");
  }
  if (a.construction?.value === "KNITTED") out.add("orme");
  if (a.gender?.value === "MEN") out.add("erkek");
  if (a.gender?.value === "WOMEN") out.add("kadin");
  if (a.gender?.value === "CHILD") out.add("cocuk");
  if (a.gender?.value === "BABY") out.add("bebek");
  if (a.wireless.length > 0) out.add("kablosuz");
  if (a.cellular) out.add("hucresel");
  return [...out];
}
