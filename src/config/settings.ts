/**
 * Site-settings shapes + field metadata — client-safe (used by the admin form).
 * The server repository resolves these against the compiled defaults.
 */

/** Fully-resolved settings (defaults applied); every value is a string. */
export type ResolvedSettings = {
  companyEmail: string;
  companyPhone: string;
  companyPhoneHref: string;
  companyLocation: string;
  hoursShort: string;
  hoursLong: string;
  linkedin: string;
  instagram: string;
  x: string;
  youtube: string;
  facebook: string;
  ga4Id: string;
  clarityId: string;
};

/** The editable fields (what the form submits). phoneHref is derived, not set. */
export type SettingsInput = Omit<ResolvedSettings, "companyPhoneHref">;

export const SOCIAL_FIELDS: { key: keyof SettingsInput; label: string; placeholder: string }[] = [
  { key: "linkedin", label: "LinkedIn", placeholder: "https://linkedin.com/company/…" },
  { key: "instagram", label: "Instagram", placeholder: "https://instagram.com/…" },
  { key: "x", label: "X (Twitter)", placeholder: "https://x.com/…" },
  { key: "youtube", label: "YouTube", placeholder: "https://youtube.com/@…" },
  { key: "facebook", label: "Facebook", placeholder: "https://facebook.com/…" },
];
