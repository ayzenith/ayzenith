/**
 * Legal content — professional, structured, and ready for legal review.
 *
 * Kept as typed content (not i18n JSON) because it is long-form, review-bound,
 * and English-first at launch. Rendered by <LegalPage>. The `disclaimer` on each
 * document makes explicit that this is a starting point pending counsel review —
 * substitute reviewed copy without touching any component.
 */

export type LegalSection = {
  readonly heading: string;
  readonly body: readonly string[];
};

export type LegalDocument = {
  readonly slug: "privacy" | "cookies" | "terms";
  readonly title: string;
  readonly intro: string;
  readonly updated: string;
  readonly disclaimer: string;
  readonly sections: readonly LegalSection[];
};

const REVIEW_DISCLAIMER =
  "This document is provided as a professional starting point and is pending review by qualified legal counsel before AYZENITH relies on it. It does not yet constitute legal advice.";

const UPDATED = "July 2026";

export const privacyPolicy: LegalDocument = {
  slug: "privacy",
  title: "Privacy Policy",
  intro:
    "This policy explains what information AYZENITH collects through this website, how it is used, and the choices available to you.",
  updated: UPDATED,
  disclaimer: REVIEW_DISCLAIMER,
  sections: [
    {
      heading: "Information we collect",
      body: [
        "When you submit a partnership inquiry, we collect the details you provide — your name, company, work email, region, area of interest and message — solely to respond to your request.",
        "We may collect limited technical information (such as aggregated, anonymized usage data) to operate and improve the website. We do not sell personal information.",
      ],
    },
    {
      heading: "How we use information",
      body: [
        "We use the information you submit to evaluate and respond to inquiries, to communicate with you about a potential partnership, and to maintain records of our correspondence.",
        "Where analytics are enabled, aggregated data helps us understand how the website is used. Analytics are configured to minimize the collection of personal data.",
      ],
    },
    {
      heading: "Legal bases and retention",
      body: [
        "We process inquiry data on the basis of taking steps at your request prior to entering into a business relationship, and our legitimate interest in operating the website.",
        "We retain inquiry data only as long as necessary for the purposes described here or as required by applicable law.",
      ],
    },
    {
      heading: "Sharing and international transfers",
      body: [
        "We share information only with service providers who help us operate the website and communicate with you, under appropriate safeguards, and where required by law.",
        "As an international business, data may be processed in jurisdictions outside your own; we take steps intended to ensure an appropriate level of protection.",
      ],
    },
    {
      heading: "Your rights",
      body: [
        "Subject to applicable law, you may request access to, correction of, or deletion of your personal information, and object to certain processing.",
        "To exercise any right, contact us at info@ayzenith.com.",
      ],
    },
    {
      heading: "Contact",
      body: [
        "Questions about this policy can be directed to info@ayzenith.com.",
      ],
    },
  ],
};

export const cookiePolicy: LegalDocument = {
  slug: "cookies",
  title: "Cookie Policy",
  intro:
    "This policy explains how AYZENITH uses cookies and similar technologies on this website.",
  updated: UPDATED,
  disclaimer: REVIEW_DISCLAIMER,
  sections: [
    {
      heading: "What cookies are",
      body: [
        "Cookies are small files stored on your device that help websites function and understand how they are used. Similar technologies include local storage and pixels.",
      ],
    },
    {
      heading: "How we use them",
      body: [
        "This website is designed to operate with minimal cookies. Strictly necessary technologies support core functionality and security.",
        "If and when analytics are enabled, they may set cookies to measure aggregated, anonymized usage. These are not used to identify you personally.",
      ],
    },
    {
      heading: "Managing cookies",
      body: [
        "You can control and delete cookies through your browser settings. Blocking some cookies may affect how parts of the website function.",
        "Where required, we will present a consent mechanism before setting non-essential cookies.",
      ],
    },
    {
      heading: "Contact",
      body: [
        "Questions about our use of cookies can be directed to info@ayzenith.com.",
      ],
    },
  ],
};

export const termsConditions: LegalDocument = {
  slug: "terms",
  title: "Terms & Conditions",
  intro:
    "These terms govern your use of the AYZENITH website. By using the website, you agree to them.",
  updated: UPDATED,
  disclaimer: REVIEW_DISCLAIMER,
  sections: [
    {
      heading: "Use of this website",
      body: [
        "This website is provided for general information about AYZENITH and to allow you to contact us. You agree to use it lawfully and not to misuse or disrupt it.",
      ],
    },
    {
      heading: "No offer or commitment",
      body: [
        "Content on this website is informational and does not constitute an offer, a binding commitment, or professional advice. Any partnership is subject to a separate written agreement.",
      ],
    },
    {
      heading: "Intellectual property",
      body: [
        "The AYZENITH name, logo, content and design are the property of AYZENITH and are protected by applicable laws. You may not use them without prior written permission.",
      ],
    },
    {
      heading: "Limitation of liability",
      body: [
        "The website is provided on an “as is” basis. To the extent permitted by law, AYZENITH is not liable for any loss arising from your use of, or inability to use, the website.",
      ],
    },
    {
      heading: "Governing law",
      body: [
        "These terms are governed by the laws of the Republic of Türkiye, without prejudice to mandatory consumer protections that may apply in your jurisdiction.",
      ],
    },
    {
      heading: "Contact",
      body: [
        "Questions about these terms can be directed to info@ayzenith.com.",
      ],
    },
  ],
};

export const legalDocuments = {
  privacy: privacyPolicy,
  cookies: cookiePolicy,
  terms: termsConditions,
} as const;
