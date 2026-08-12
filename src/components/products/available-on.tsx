import { ExternalLink } from "lucide-react";
import { getTranslations } from "next-intl/server";
import {
  marketplaces,
  marketplaceOrder,
  type MarketplaceId,
} from "@/config/marketplaces";

/**
 * AvailableOn — the premium replacement for a "Buy Now" button. Renders outbound
 * links to the official marketplaces a product is configured on. External links
 * open in a new tab with rel="noopener noreferrer". Only configured channels
 * appear; with none configured the section renders nothing. Server Component.
 *
 * B2C buyers purchase on marketplaces here; B2B buyers use the wholesale CTA.
 */

type AvailableOnProps = {
  urls: Partial<Record<MarketplaceId, string>>;
};

export async function AvailableOn({ urls }: AvailableOnProps) {
  const t = await getTranslations("products.detail");
  const available = marketplaceOrder.filter((id) => urls[id]);

  if (available.length === 0) return null;

  return (
    <div>
      <p className="eyebrow text-subtle">{t("availableOn")}</p>
      <ul className="mt-4 flex flex-wrap gap-3">
        {available.map((id) => {
          const m = marketplaces[id];
          return (
            <li key={id}>
              <a
                href={urls[id]}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`${t("buyOn")} ${m.label}`}
                className="inline-flex h-11 items-center gap-2 rounded-md border border-border bg-surface px-4 text-small font-semibold text-foreground transition-colors duration-200 hover:border-accent hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-ring)]"
              >
                <span
                  aria-hidden="true"
                  className="size-2 rounded-full"
                  style={{ backgroundColor: m.accent }}
                />
                {m.label}
                <ExternalLink className="size-4 opacity-50" aria-hidden="true" />
              </a>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
