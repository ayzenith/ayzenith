/**
 * AYZENITH LEAD FINDER — multi-language vocabulary for website verification (§V3.9).
 *
 * THE GAP THIS CLOSES. Discovery already works across 29 European countries, but
 * every word the verifier looked for was German. A search in Lyon or Milano found
 * real firms and then went blind on them: no `/impressum` exists there, "Grossiste"
 * and "Grossista" were not commercial roles, "Gérant" and "Amministratore Delegato"
 * were not decision-makers, and a SARL or S.r.l. was not a legal entity. The firms
 * came back permanently "doğrulanamadı" — not because anything was unknowable, but
 * because we were reading for the wrong language.
 *
 * TWO KINDS OF VOCABULARY, AND THE DIFFERENCE IS THE WHOLE DESIGN:
 *
 *  1. TEXT dictionaries (roles, B2B/B2C markers, decision-maker titles, legal
 *     forms, scale words) are matched against page text we have ALREADY
 *     downloaded. Adding a language costs nothing but a few string scans, so they
 *     are ALL-LANGUAGE AND ALWAYS ON. There is no language detection in front of
 *     them and there must not be: a German firm's English export page and an
 *     Italian firm's German landing page both stay readable.
 *
 *  2. SUB-PAGE PATHS cost a real HTTP request each, so those ARE chosen by
 *     country — and the count is unchanged. We already spent 3 requests per firm
 *     asking for /impressum, /kontakt, /ueber-uns; on a French site all three are
 *     guaranteed 404s. The same three requests now ask for /mentions-legales,
 *     /contact, /qui-sommes-nous. Same latency, vastly better hit rate.
 *
 * Terms are picked for being unambiguous ACROSS languages, because they all run
 * against every page. Bare Polish "hurt" would fire on the English word "hurt", so
 * the stem "hurtow" is used instead; bare Italian "privati" would fire inside
 * "privatisation", so "clienti privati" is used. When a word is only safe in
 * context, it is stored with its context.
 */

/** The language packs we ship sub-page paths for. */
export type SiteLang = "de" | "fr" | "it" | "es" | "pt" | "nl" | "be" | "pl" | "cs" | "nordic" | "tr" | "en";

/** ISO-3166 alpha-2 → language pack. Anything unlisted falls back to "en", whose
 *  paths are the international ones most sites expose regardless of language. */
const COUNTRY_LANG: Record<string, SiteLang> = {
  DE: "de", AT: "de", CH: "de", LI: "de",
  FR: "fr", LU: "fr", MC: "fr",
  IT: "it", SM: "it",
  ES: "es",
  PT: "pt",
  NL: "nl",
  BE: "be",
  PL: "pl",
  CZ: "cs", SK: "cs",
  SE: "nordic", DK: "nordic", NO: "nordic", FI: "nordic", IS: "nordic",
  TR: "tr",
  GB: "en", IE: "en", MT: "en", CY: "en",
};

/** Country-code TLD → language pack. Checked BEFORE the search country: a `.fr`
 *  domain is direct evidence about the site itself, whereas the search country is
 *  only where the firm was found — a French supplier discovered in a Belgian
 *  search should still be read in French. */
const TLD_LANG: Record<string, SiteLang> = {
  de: "de", at: "de", ch: "de", li: "de",
  fr: "fr", lu: "fr", mc: "fr",
  it: "it", sm: "it",
  es: "es",
  pt: "pt",
  nl: "nl",
  be: "be",
  pl: "pl",
  cz: "cs", sk: "cs",
  se: "nordic", dk: "nordic", no: "nordic", fi: "nordic", is: "nordic",
  tr: "tr",
  uk: "en", ie: "en",
};

/** Decide which language pack to read a site with. */
export function langForSite(website?: string | null, country?: string | null): SiteLang {
  if (website) {
    try {
      const host = new URL(website.includes("://") ? website : `https://${website}`).hostname;
      const tld = host.split(".").pop()?.toLowerCase() ?? "";
      const byTld = TLD_LANG[tld];
      if (byTld) return byTld;
    } catch {
      /* fall through to the search country */
    }
  }
  return COUNTRY_LANG[(country ?? "").toUpperCase()] ?? "en";
}

/**
 * Sub-pages to try after the homepage, in two parallel rounds of three — the SAME
 * shape and cost as the original German-only list.
 *
 * Round one is what the country's own firms actually publish. Round two is the
 * fallback, and it deliberately ends on the privacy policy: GDPR obliges every EU
 * site to name its data controller there, so a privacy page carries the legal
 * entity, its address and very often its VAT id even when the firm publishes no
 * legal-notice page at all. That makes it the one page we can rely on existing in
 * every member state.
 */
const SUBPAGE_PACKS: Record<SiteLang, string[][]> = {
  de: [
    ["impressum", "kontakt", "ueber-uns"],
    ["contact", "about", "datenschutz"],
  ],
  fr: [
    ["mentions-legales", "contact", "qui-sommes-nous"],
    ["a-propos", "nous-contacter", "politique-de-confidentialite"],
  ],
  it: [
    ["contatti", "chi-siamo", "note-legali"],
    ["azienda", "contattaci", "privacy"],
  ],
  es: [
    ["contacto", "aviso-legal", "quienes-somos"],
    ["empresa", "sobre-nosotros", "politica-de-privacidad"],
  ],
  pt: [
    ["contactos", "sobre-nos", "quem-somos"],
    ["empresa", "contato", "politica-de-privacidade"],
  ],
  nl: [
    ["contact", "over-ons", "colofon"],
    ["bedrijf", "algemene-voorwaarden", "privacy"],
  ],
  // Belgium is genuinely bilingual, so round one spends its three requests across
  // both languages rather than betting on one of them.
  be: [
    ["contact", "over-ons", "mentions-legales"],
    ["qui-sommes-nous", "algemene-voorwaarden", "privacy"],
  ],
  pl: [
    ["kontakt", "o-nas", "o-firmie"],
    ["firma", "regulamin", "polityka-prywatnosci"],
  ],
  cs: [
    ["kontakt", "o-nas", "kontakty"],
    ["firma", "obchodni-podminky", "ochrana-osobnich-udaju"],
  ],
  nordic: [
    ["kontakt", "om-oss", "yhteystiedot"],
    ["about", "om", "tietosuoja"],
  ],
  tr: [
    ["iletisim", "hakkimizda", "kurumsal"],
    ["contact", "about", "gizlilik"],
  ],
  en: [
    ["contact", "about", "about-us"],
    ["imprint", "legal", "privacy"],
  ],
};

export function subpageRounds(lang: SiteLang): string[][] {
  return SUBPAGE_PACKS[lang] ?? SUBPAGE_PACKS.en;
}

// ---------------------------------------------------------------------------
// Page classification
// ---------------------------------------------------------------------------

/** STRICT legal / registry pages. A name printed here is an official disclosure,
 *  which is why it carries the higher decision-maker confidence.
 *  The separator class accepts a SPACE as well as a hyphen because these patterns
 *  are matched against link TEXT ("Mentions légales") as well as URLs. */
export const LEGAL_PAGE_RE =
  /(impressum|imprint|legal[-_\s]?notice|mentions[-_\s]?legales|note[-_\s]?legali|dati[-_\s]?societari|aviso[-_\s]?legal|informacion[-_\s]?legal|informacao[-_\s]?legal|colofon|nota[-_\s]?prawna|juridische[-_\s]?informatie|firmenbuch)/i;

/** Company-info pages: about / contact / privacy / TEAM. Real management names
 *  live here in the many countries that have no Impressum equivalent, so they
 *  ARE read — just at a lower confidence than an official legal notice.
 *  Team/staff pages were previously entirely absent from this pattern (§ audit
 *  finding — "no team-page path in any language pack") even though a "Team" or
 *  "Yönetim Ekibi" link is exactly where a site names people beyond the
 *  Impressum's forced director listing. Reusing this ONE shared pattern means
 *  team pages get discovered (via `discoverInfoPages` below, which ranks hits
 *  against this same regex) AND get mined for names once fetched (the per-page
 *  loop in website.ts also gates decision-maker extraction on this pattern) —
 *  no separate plumbing needed. */
export const COMPANY_INFO_PAGE_RE =
  /(ueber[-_\s]?uns|about|kontakt|contact|contatti|contattaci|chi[-_\s]?siamo|azienda|qui[-_\s]?sommes[-_\s]?nous|nous[-_\s]?contacter|a[-_\s]?propos|quienes[-_\s]?somos|sobre[-_\s]?nosotros|contacto|empresa|quem[-_\s]?somos|contactos|over[-_\s]?ons|bedrijf|o[-_\s]?nas|o[-_\s]?firmie|firma|iletisim|hakkimizda|kurumsal|om[-_\s]?oss|yhteystiedot|privacy|datenschutz|politique[-_\s]?de[-_\s]?confidentialite|politica[-_\s]?de[-_\s]?privacid|polityka[-_\s]?prywatnosci|gizlilik|tietosuoja|ochrana[-_\s]?osobnich|\bteam\b|notre[-_\s]?equipe|nuestro[-_\s]?equipo|nosso[-_\s]?equipa|squadra|nasz[-_\s]?zespol|nas[-_\s]?tym|ekibimiz|yonetim[-_\s]?ekibi|calisanlarimiz|mitarbeiter)/i;

/**
 * Strip diacritics so a pattern written in plain ASCII still matches the accented
 * form a site actually prints — "Quiénes somos", "Mentions légales", "Über uns".
 * Applied only when classifying links and URLs, never to page text used as
 * evidence, so nothing we store is altered.
 */
export function foldAccents(s: string): string {
  return s.normalize("NFD").replace(/\p{Diacritic}/gu, "");
}

/** Product-focused paths — product signals found here count fully (§V3.1). */
export const HIGH_VALUE_PATH_RE =
  /\/(shop|produkt|produkte|product|products|produits|prodotti|productos|producten|produkty|urunler|kategori|kategorie|category|categorie|categorias|sortiment|assortiment|katalog|katalogue|catalogue|catalogo|catalogo|kollektion|collection|collezione|coleccion|item|ware|boutique|tienda|negozio|winkel|sklep|magasin)(?:\/|$)/i;

/** Career / corporate / news / privacy paths — what a firm SELLS and WHO it sells
 *  to are not evidenced here (§V3.1).
 *
 *  Privacy and cookie policies are on this list for a reason found in testing: they
 *  are boilerplate about data handling, and their vocabulary collides head-on with
 *  our commercial one. Reading loveco's /datenschutz stamped a plain B2C retailer
 *  as a "distributor", purely because a privacy text describes the distribution of
 *  personal data. These pages are still fetched and still mined for the legal
 *  entity, VAT id and named officers — that is precisely why they are fetched —
 *  but they contribute no role, model or product evidence. */
export const LOW_VALUE_PATH_RE =
  /\/(career|careers|jobs?|karriere|carriere|carrieres|carriera|lavora-con-noi|empleo|trabaja-con-nosotros|vacatures|kariera|kariyer|rekrytering|partner|partnership|corporate|investor|presse|press|pressroom|newsroom|news|nieuws|notizie|noticias|actualites|aktualnosci|blog|medien|media|privacy|privacy-policy|datenschutz|cookie|cookies|confidentialite|privacid|prywatnosci|gizlilik|tietosuoja|osobnich|agb|terms|conditions|voorwaarden|regulamin)(?:\/|$|\.|-)/i;

// ---------------------------------------------------------------------------
// Commercial-role vocabulary
// ---------------------------------------------------------------------------

/**
 * Role terms in every market we search, merged into the German/English set that
 * website.ts already had. Plain strings are substring matches (deliberate — so
 * compounds like "Elektrogroßhandel" still trip "großhandel"); RegExps are used
 * only where a substring would produce a false positive.
 */
export const ROLE_TERMS_MULTILANG: Record<string, Array<string | RegExp>> = {
  wholesaler: [
    // FR / IT / ES / PT
    "grossiste", "vente en gros", "commerce de gros",
    "grossista", "ingrosso",
    "mayorista", "venta al por mayor",
    "atacadista", "atacado",
    // NL / PL / Nordic / CZ
    "groothandel", "groothandelaar",
    "hurtownia", "hurtownik", "sprzedaż hurtowa", "sprzedaz hurtowa",
    "grossist", "partihandel", "engroshandel", "tukkukauppa", "tukkuliike",
    "velkoobchod",
    // TR
    "toptan satış", "toptan satis", "toptancı", "toptanci",
  ],
  distributor: [
    "distributeur", "distributore", "distribuidor", "dystrybutor", "distributör", "distributor",
  ],
  // The existing /import(?!an)/ rule already covers importateur / importatore /
  // importador / importeur, because every Romance false friend ("important",
  // "importante", "importanza", "importancia") begins "importan".
  manufacturer: [
    "fabricant", "fabbricante", "fabricante", "fabrikant",
    "produttore", "productor", "producent", "producteur",
    "üretici", "uretici", "imalatçı", "imalatci",
  ],
  retailer: [
    "commerce de détail", "commerce de detail", "détaillant", "detaillant",
    "dettagliante", "vendita al dettaglio",
    "minorista", "venta al por menor",
    "detailhandel", "sprzedaż detaliczna", "sprzedaz detaliczna",
    "detaljhandel", "maloobchod",
  ],
  ecommerce: [
    "ajouter au panier", "boutique en ligne",
    "aggiungi al carrello", "negozio online",
    "añadir al carrito", "anadir al carrito", "tienda online",
    "adicionar ao carrinho",
    "winkelwagen", "dodaj do koszyka", "sepete ekle",
  ],
  retail_chain: [
    "points de vente", "nos magasins",
    "punti vendita", "i nostri negozi",
    "puntos de venta", "nuestras tiendas",
    "vestigingen", "onze winkels", "nasze sklepy", "butiker", "mağazalarımız", "magazalarimiz",
  ],
  department_store: ["grand magasin", "grande magazzino", "grandes almacenes", "warenhuis"],
  sourcing: ["centrale d'achat", "bureau d'achat", "centrale acquisti", "central de compras", "inkooporganisatie"],
};

/** Unambiguous B2B / wholesale channel markers, all languages (§3/§8). */
export const B2B_TERMS_MULTILANG = [
  // FR
  "vente en gros", "revendeur", "revendeurs", "grossiste", "espace professionnel",
  "réservé aux professionnels", "reserve aux professionnels", "tarifs professionnels",
  // IT
  "rivenditori", "rivenditore", "vendita all'ingrosso", "area rivenditori", "ingrosso",
  // ES / PT
  "mayorista", "venta al por mayor", "zona profesional", "precios profesionales",
  "revendedores", "atacado",
  // NL
  "groothandel", "wederverkopers", "zakelijke klanten",
  // PL / CZ — the stem, never bare "hurt", which is an English word.
  "hurtow", "dla firm", "velkoobchod",
  // Nordic
  "partihandel", "engroshandel", "tukkukauppa",
  // TR
  "toptan satış", "toptan satis", "bayilik",
];

/** Unambiguous B2C / consumer-checkout markers, all languages. */
export const B2C_TERMS_MULTILANG = [
  "ajouter au panier", "mon panier", "clients particuliers",
  "aggiungi al carrello", "clienti privati",
  "añadir al carrito", "anadir al carrito", "clientes particulares",
  "adicionar ao carrinho",
  "winkelwagen", "particulieren",
  "dodaj do koszyka", "koszyk",
  "sepete ekle", "sepetim",
  "lägg i varukorgen", "varukorg", "ostoskori",
];

// ---------------------------------------------------------------------------
// Decision-maker titles
// ---------------------------------------------------------------------------

/**
 * Officer / buyer / commercial titles across the markets we search, to be appended
 * to the German-English set in website.ts.
 *
 * Order still matters: a more specific multi-word title must precede any shorter
 * form of the same word, so "Directeur Général" is not consumed by a bare
 * "Directeur". Every one of these is still gated by the legal/company-info page
 * check, a strict Firstname-Lastname capture and the stopword filter, so widening
 * the vocabulary does not widen false positives.
 */
export const DM_ROLE_PATTERNS_MULTILANG: Array<{ label: string; re: RegExp }> = [
  // French
  { label: "Directeur Général", re: /directeur g[ée]n[ée]ral(?:e)?\s*:?\s*/i },
  { label: "Directeur des Achats", re: /(?:directeur|responsable|chef)\s+(?:des?\s+)?achats\s*:?\s*/i },
  { label: "Directeur Commercial", re: /directeur commercial(?:e)?\s*:?\s*/i },
  { label: "Gérant", re: /g[ée]rant(?:e)?\s*:?\s*/i },
  { label: "Président", re: /pr[ée]sident(?:e)?\s*:?\s*/i },
  { label: "PDG", re: /\bpdg\b\s*:?\s*/i },
  { label: "Propriétaire", re: /propri[ée]taire\s*:?\s*/i },
  { label: "Fondateur", re: /fondat(?:eur|rice)\s*:?\s*/i },
  // Italian
  { label: "Amministratore Delegato", re: /amministratore delegato\s*:?\s*/i },
  { label: "Amministratore Unico", re: /amministratore unico\s*:?\s*/i },
  { label: "Legale Rappresentante", re: /legale rappresentante\s*:?\s*/i },
  { label: "Direttore Acquisti", re: /(?:direttore|responsabile)\s+(?:degli\s+)?acquisti\s*:?\s*/i },
  { label: "Direttore Commerciale", re: /direttore commerciale\s*:?\s*/i },
  { label: "Titolare", re: /titolare\s*:?\s*/i },
  // Spanish / Portuguese
  { label: "Administrador Único", re: /administrador(?:a)?\s+[úu]nic[oa]\s*:?\s*/i },
  { label: "Director General", re: /director(?:a)?\s+general\s*:?\s*/i },
  { label: "Director de Compras", re: /(?:director(?:a)?|responsable|jefe)\s+de\s+compras\s*:?\s*/i },
  { label: "Director Comercial", re: /d[ii]rector(?:a)?\s+comercial\s*:?\s*/i },
  { label: "Sócio-Gerente", re: /s[óo]cio[-\s]gerente\s*:?\s*/i },
  { label: "Gerente", re: /gerente\s*:?\s*/i },
  { label: "Administrador", re: /administrador(?:a)?\s*:?\s*/i },
  { label: "Propietario", re: /propietari[oa]\s*:?\s*/i },
  { label: "Fundador", re: /fundador(?:a)?\s*:?\s*/i },
  // Dutch
  { label: "Inkoopmanager", re: /(?:inkoopmanager|hoofd inkoop|inkoper)\s*:?\s*/i },
  { label: "Bestuurder", re: /bestuurder\s*:?\s*/i },
  { label: "Eigenaar", re: /eigenaar\s*:?\s*/i },
  { label: "Oprichter", re: /oprichter\s*:?\s*/i },
  // Shared FR/NL — must come after the specific "Directeur …" forms above.
  { label: "Directeur", re: /directeur\s*:?\s*/i },
  // Polish
  { label: "Prezes Zarządu", re: /prezes zarz[ąa]du\s*:?\s*/i },
  { label: "Dyrektor Zakupów", re: /(?:dyrektor|kierownik)\s+(?:ds\.?\s+)?zakup[óo]w\s*:?\s*/i },
  { label: "Dyrektor Handlowy", re: /dyrektor handlowy\s*:?\s*/i },
  { label: "Właściciel", re: /w[łl]a[śs]ciciel(?:ka)?\s*:?\s*/i },
  // Nordic / Finnish
  { label: "Administrerende Direktør", re: /adm(?:inistrerende)?\.?\s*direkt[øo]r\s*:?\s*/i },
  { label: "Verkställande Direktör", re: /verkst[äa]llande direkt[öo]r\s*:?\s*/i },
  { label: "Toimitusjohtaja", re: /toimitusjohtaja\s*:?\s*/i },
  // Turkish
  { label: "Genel Müdür", re: /genel m[üu]d[üu]r(?:[üu])?\s*:?\s*/i },
  { label: "Şirket Sahibi", re: /[şs]irket sahibi\s*:?\s*/i },
  { label: "Satın Alma Müdürü", re: /sat[ıi]n alma m[üu]d[üu]r[üu]\s*:?\s*/i },
];

/** Honorifics that may sit between a title and the name, all languages. Stripped
 *  before name capture so an honorific is never stored as a first name (§6). */
export const NAME_TITLE_MULTILANG_RE =
  /^(?:herr|frau|mr|mrs|ms|dr|prof|dipl\.?-?ing|dipl|ing|monsieur|madame|mme|mlle|sig|sig\.ra|sigra|dott|dott\.ssa|geom|arch|sr|sra|srta|dhr|mevr|drs|ir|bay|bayan|sayın|sayin)\.?\s+/i;

/**
 * A person's name in Latin-script Europe.
 *
 * The original capture was `[A-ZÄÖÜ][a-zäöüß]+`, which is German and nothing else:
 * it cannot see François, Müller-Lüdenscheidt, D'Angelo, Łukasz or Öztürk. Unicode
 * property escapes cover every Latin alphabet at once, and the optional
 * hyphen/apostrophe segment keeps compound and elided surnames whole.
 */
const NAME_TOKEN = "\\p{Lu}(?:['\u2019]\\p{Lu}?\\p{Ll}+|\\p{Ll}+)(?:[-'\u2019]\\p{Lu}?\\p{Ll}+)*";
export const PERSON_NAME_RE = new RegExp(`(${NAME_TOKEN})\\s+(${NAME_TOKEN}(?:\\s+${NAME_TOKEN})?)`, "u");

/** Words that must never be accepted as a person's name — geography, org forms and
 *  common legal-page furniture, in every language we read. Particles that are
 *  genuinely part of European surnames ("van", "de", "von", "di") are deliberately
 *  ABSENT: excluding them would reject Van Dijk and De Luca. */
export const NAME_STOPWORDS_MULTILANG = [
  // Cities / countries
  "paris", "lyon", "marseille", "milano", "roma", "napoli", "torino", "madrid",
  "barcelona", "valencia", "lisboa", "porto", "amsterdam", "rotterdam", "utrecht",
  "bruxelles", "brussel", "antwerpen", "warszawa", "krakow", "kraków", "praha",
  "wien", "zürich", "zurich", "stockholm", "oslo", "helsinki", "kobenhavn",
  "istanbul", "ankara", "izmir", "france", "italia", "italy", "espana", "españa",
  "portugal", "nederland", "belgique", "belgie", "polska", "sverige", "norge",
  "danmark", "suomi", "türkiye", "turkiye", "europe", "europa",
  // Street / address words
  "rue", "avenue", "boulevard", "via", "viale", "piazza", "calle", "avenida",
  "straat", "laan", "ulica", "gatan", "cadde", "sokak", "mahalle",
  // Org forms
  "sarl", "sas", "sasu", "eurl", "srl", "spa", "snc", "sprl", "bvba",
  "lda", "unipessoal", "kft", "zrt", "aps", "oyj",
  // Legal-page furniture
  "mentions", "légales", "legales", "legali", "aviso", "informacion", "información",
  "societe", "société", "societa", "società", "empresa", "azienda", "bedrijf",
  "firma", "sirket", "şirket", "contact", "contacto", "contatti", "kontakt",
  "iletisim", "iletişim", "privacy", "cookie", "cookies", "politique", "politica",
  "polityka", "gizlilik", "siege", "siège", "sede", "sedile", "zetel",
  "telefono", "téléphone", "telefoon", "correo", "courriel",
  "nous", "vous", "notre", "votre", "nostro", "nuestra", "nuestro", "onze",
  "sobre", "quienes", "quem", "chi", "siamo", "propos", "sommes",
];

/**
 * Legal entity forms across the markets we search, for pulling a registered name
 * out of a legal page.
 *
 * The trailing guard is not decoration: without it the German-only original
 * matched "AG" inside "AGB" (the standard German word for terms and conditions),
 * which appears on nearly every commercial site. Two-letter forms like SA, AS and
 * AB are safe here only because the match is case-SENSITIVE — the French
 * possessive "sa" and the English "as" are lowercase in prose.
 */
/**
 * The legal-form alternation ALONE, without the preceding-name window.
 *
 * Single source of truth for both regexes below: `LEGAL_FORM_RE` (name + form,
 * for the old flat-text scan and for the "does this page look like a legal
 * notice at all?" boolean) and `LEGAL_FORM_ONLY_RE`, which the block-aware
 * extractor uses to locate the form and then decide for itself how far left the
 * name reaches. Keeping one string means a newly supported entity form can
 * never be added to one path and forgotten in the other.
 */
export const LEGAL_FORM_ALT =
  "(?:GmbH(?: & Co\\.? KG)?|AG|KG|OHG|e\\.K\\.|UG(?: \\(haftungsbeschränkt\\))?|GbR" +
  "|S\\.?A\\.?R\\.?L\\.?|SASU|SAS|EURL|SCI" +
  "|S\\.?r\\.?l\\.?s?|S\\.?p\\.?A\\.?|S\\.?n\\.?c\\.?|S\\.?a\\.?s\\.?" +
  "|S\\.?L\\.?U\\.?|S\\.?L\\.?|S\\.?A\\.?U\\.?" +
  "|B\\.?V\\.?|N\\.?V\\.?|V\\.?O\\.?F\\.?|BVBA|SPRL" +
  "|Sp\\. z o\\.?o\\.?|Sp\\.j\\.|S\\.?K\\.?A\\.?" +
  "|s\\.r\\.o\\.|a\\.s\\.|d\\.o\\.o\\." +
  "|Lda\\.?|Unipessoal Lda\\.?" +
  "|A/S|ApS|AB|Oy|Oyj|AS" +
  "|Kft\\.?|Zrt\\.?" +
  "|A\\.?Ş\\.?|Ltd\\.? Şti\\.?" +
  "|Ltd\\.?|Inc\\.?|PLC|LLC" +
  ")";

/** The form on its own, with the same trailing guard that keeps "AG" out of "AGB". */
export const LEGAL_FORM_ONLY_RE = new RegExp(
  `(?<![A-Za-zÀ-ÖØ-öø-ÿ])${LEGAL_FORM_ALT}(?![A-Za-zÀ-ÖØ-öø-ÿ])`,
);

export const LEGAL_FORM_RE = new RegExp(
  "((?:[A-Za-zÀ-ÖØ-öø-ÿ0-9][\\wÀ-ÖØ-öø-ÿ.&'-]+\\s+){1,3}" +
    "(?:GmbH(?: & Co\\.? KG)?|AG|KG|OHG|e\\.K\\.|UG(?: \\(haftungsbeschränkt\\))?|GbR" +
    "|S\\.?A\\.?R\\.?L\\.?|SASU|SAS|EURL|SCI" +
    "|S\\.?r\\.?l\\.?s?|S\\.?p\\.?A\\.?|S\\.?n\\.?c\\.?|S\\.?a\\.?s\\.?" +
    "|S\\.?L\\.?U\\.?|S\\.?L\\.?|S\\.?A\\.?U\\.?" +
    "|B\\.?V\\.?|N\\.?V\\.?|V\\.?O\\.?F\\.?|BVBA|SPRL" +
    "|Sp\\. z o\\.?o\\.?|Sp\\.j\\.|S\\.?K\\.?A\\.?" +
    "|s\\.r\\.o\\.|a\\.s\\.|d\\.o\\.o\\." +
    "|Lda\\.?|Unipessoal Lda\\.?" +
    "|A/S|ApS|AB|Oy|Oyj|AS" +
    "|Kft\\.?|Zrt\\.?" +
    "|A\\.?Ş\\.?|Ltd\\.? Şti\\.?" +
    "|Ltd\\.?|Inc\\.?|PLC|LLC" +
    "))(?![A-Za-zÀ-ÖØ-öø-ÿ])",
);

// ---------------------------------------------------------------------------
// Scale vocabulary
// ---------------------------------------------------------------------------

/** "12 Filialen" in every language — only ever read when the site states it. */
export const STORE_TERMS_MULTILANG = [
  "magasins", "points de vente", "boutiques",
  "negozi", "punti vendita",
  "tiendas", "puntos de venta",
  "lojas", "winkels", "vestigingen",
  "sklepy", "sklepów", "prodejen",
  "butiker", "myymälää",
  "mağaza", "magaza", "şube",
];

/** "50 Mitarbeiter" in every language. */
export const EMPLOYEE_TERMS_MULTILANG = [
  "salariés", "salaries", "employés", "employes", "collaborateurs",
  "dipendenti", "collaboratori",
  "empleados", "trabajadores", "funcionários", "funcionarios",
  "medewerkers", "werknemers",
  "pracowników", "pracownikow", "zaměstnanců",
  "anställda", "ansatte", "työntekijää",
  "çalışan", "calisan", "personel",
];

/**
 * Lowercase page text for matching.
 *
 * `toLocaleLowerCase("de")` maps Turkish "İ" to "i" plus a COMBINING DOT ABOVE
 * (U+0307), so "İLETİŞİM" lowercases to a string that no longer contains
 * "iletişim" and every Turkish term silently fails to match. Removing the
 * combining dot restores it and is a no-op for every other language we read.
 */
export function normalizeForMatch(text: string): string {
  return text.toLocaleLowerCase("de").replace(/\u0307/g, "");
}

/**
 * Right-bounded substring test for raw (non-tokenized) page text.
 *
 * `String.includes` matches ANYWHERE \u2014 a 4-letter product term like "slip"
 * (underwear) also fires inside "slippers", "slipway", etc. This is not
 * hypothetical: this exact match feeds `strongFound`/`mediumFound` in
 * `website.ts`, and a single strong-term hit is the ONE thing that can set
 * `productFit = "VERIFIED"` \u2014 the highest-trust tier a lead can reach on
 * product evidence. A false hit here is not cosmetic, it is a false claim of
 * verification.
 *
 * The LEFT side is deliberately left unguarded, matching the same reasoning
 * `ROLE_TERMS_MULTILANG` above already documents: German (and Dutch, Nordic\u2026)
 * builds real compounds by prefixing a modifier directly onto the head noun
 * with no space \u2014 "Damenunterw\u00e4sche", "Sportbikini" \u2014 so a term is expected
 * to appear as the TAIL of a longer word, and that is a genuine match, not a
 * false one. A live regression against 1,361 cached crawled pages confirmed
 * this: requiring a left boundary too silently lost real matches like
 * "Brautunterw\u00e4sche", "Sportbikinis" (583 of 881 medium-term hits flipped \u2014
 * almost all legitimate compounds/plurals, not noise).
 *
 * The RIGHT side allows up to two more letters \u2014 covering ordinary
 * inflections (plural "-s"/"-es", German "-e"/"-en", genitive "-'s") \u2014 but not
 * an unrelated longer stem: "slip" + "pers" (4 letters) is rejected, "slip" +
 * "s" (1 letter, a real plural) is accepted. This was tuned against the same
 * live sample: it kept "slips", "bralettes", "sportbikinis" while dropping
 * the "slip"-in-"slippers"-style false positive the two-sided version had
 * been added to catch.
 */
export function includesTermBoundary(haystack: string, term: string): boolean {
  if (!term) return false;
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`${escaped}\\p{L}{0,2}(?!\\p{L})`, "u").test(haystack);
}
