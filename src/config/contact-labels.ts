/**
 * Turkish display labels for contact inquiry fields — client-safe (used by the
 * admin inbox UI). Keys mirror the enum values in the validation schema.
 */

export type ContactStatusValue = "NEW" | "READ" | "ARCHIVED";

export const REGION_LABEL: Record<string, string> = {
  europe: "Avrupa",
  turkiye: "Türkiye",
  mena: "Orta Doğu & Kuzey Afrika",
  asia: "Asya",
  americas: "Amerika",
  other: "Diğer",
};

export const INTEREST_LABEL: Record<string, string> = {
  sourcing: "Tedarik",
  distribution: "Dağıtım",
  privateLabel: "Özel Marka",
  partnership: "İş Ortaklığı",
  other: "Diğer",
};

export const CONTACT_STATUS_LABEL: Record<ContactStatusValue, string> = {
  NEW: "Yeni",
  READ: "Okundu",
  ARCHIVED: "Arşiv",
};

export const regionLabel = (v: string) => REGION_LABEL[v] ?? v;
export const interestLabel = (v: string) => INTEREST_LABEL[v] ?? v;
