import Script from "next/script";
import { env } from "@/lib/env";

/**
 * Analytics — prepared integration points for GA4 and Microsoft Clarity.
 *
 * NOTHING loads unless the corresponding env id is set, so tracking is OFF by
 * default (Sprint 3: "prepare the architecture, do not activate"). Scripts use
 * next/script `afterInteractive` so they never block first paint or compete with
 * LCP. Google Search Console verification is handled separately via metadata.
 *
 * Enabling later is purely configuration: set NEXT_PUBLIC_GA4_ID /
 * NEXT_PUBLIC_CLARITY_ID in the environment — no code change. (The CSP already
 * allow-lists the required hosts; see next.config.ts.)
 */
export function Analytics() {
  const { ga4Id, clarityId } = env.analytics;

  return (
    <>
      {ga4Id ? (
        <>
          <Script
            src={`https://www.googletagmanager.com/gtag/js?id=${ga4Id}`}
            strategy="afterInteractive"
          />
          <Script id="ga4-init" strategy="afterInteractive">
            {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${ga4Id}', { anonymize_ip: true });`}
          </Script>
        </>
      ) : null}

      {clarityId ? (
        <Script id="clarity-init" strategy="afterInteractive">
          {`(function(c,l,a,r,i,t,y){
c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
})(window, document, "clarity", "script", "${clarityId}");`}
        </Script>
      ) : null}
    </>
  );
}
