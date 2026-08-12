import Script from "next/script";
import { getSiteSettings } from "@/server/settings";

/**
 * Analytics — prepared integration points for GA4 and Microsoft Clarity.
 *
 * NOTHING loads unless the corresponding id is set, so tracking is OFF by
 * default. Ids now come from the CMS Site Settings (with the env vars as a
 * fallback), so the owner can enable/disable analytics without a redeploy.
 * Scripts use next/script `afterInteractive` so they never block first paint or
 * compete with LCP. (The CSP already allow-lists the required hosts; see
 * next.config.ts.)
 */
export async function Analytics() {
  const { ga4Id, clarityId } = await getSiteSettings();

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
