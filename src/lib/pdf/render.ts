import "server-only";

/**
 * Headless-Chromium PDF rendering.
 *
 * On Vercel (serverless, no system Chrome) we run puppeteer-core against the
 * brotli-bundled binary from @sparticuz/chromium. Locally, puppeteer-core
 * drives whatever desktop Chrome/Edge is already installed — no ~300MB
 * Chromium download added to the repo just to develop this feature.
 *
 * Either way it is the SAME puppeteer-core API rendering the SAME
 * /doc/[id]/print page (see src/components/trade-docs/document-template.tsx)
 * — there is exactly one document template, this module only decides which
 * binary drives it.
 */

import type { Browser } from "puppeteer-core";
import { siteConfig } from "@/config/site";

async function resolveLocalExecutable(): Promise<string> {
  if (process.env.PUPPETEER_EXECUTABLE_PATH) return process.env.PUPPETEER_EXECUTABLE_PATH;
  const fs = await import("node:fs");
  const candidates =
    process.platform === "win32"
      ? [
          "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
          "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
          "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
          "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
        ]
      : process.platform === "darwin"
        ? [
            "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
            "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
          ]
        : ["/usr/bin/google-chrome", "/usr/bin/chromium-browser", "/usr/bin/chromium"];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  throw new Error(
    "No local Chrome/Edge found for PDF rendering. Install Chrome, or set PUPPETEER_EXECUTABLE_PATH.",
  );
}

async function launchBrowser(): Promise<Browser> {
  const puppeteer = await import("puppeteer-core");
  const isServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);

  if (isServerless) {
    try {
      const chromium = (await import("@sparticuz/chromium")).default;
      const execPath = await chromium.executablePath();
      console.log(`[PDF] Serverless Chromium executablePath: ${execPath}`);
      return puppeteer.launch({
        args: chromium.args,
        executablePath: execPath,
        headless: true,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[PDF] Serverless Chromium failed: ${msg}`);
      console.error(`[PDF] NODE_ENV: ${process.env.NODE_ENV}`);
      console.error(`[PDF] VERCEL: ${process.env.VERCEL}`);
      console.error(`[PDF] AWS_LAMBDA_FUNCTION_NAME: ${process.env.AWS_LAMBDA_FUNCTION_NAME}`);
      throw new Error(`Serverless Chromium could not start: ${msg}`);
    }
  }

  return puppeteer.launch({
    executablePath: await resolveLocalExecutable(),
    headless: true,
  });
}

export type PdfOptions = {
  orientation: "portrait" | "landscape";
  footerLeft?: string;
  pageOfLabel?: string; // e.g. "Page" / "Sayfa" / "Seite"
};

/**
 * Warm-container browser reuse. Launching Chromium is by far the most expensive
 * step in serverless — the binary has to be decompressed and booted — and it is
 * pure overhead when the same container serves several downloads in a row.
 * Kept ONLY on Vercel: locally the dev server hot-reloads this module on every
 * edit, which would orphan a Chrome process each time.
 */
const reuseBrowser = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
let browserPromise: Promise<Browser> | null = null;

async function acquireBrowser(): Promise<{ browser: Browser; reused: boolean }> {
  if (reuseBrowser && browserPromise) {
    try {
      const existing = await browserPromise;
      if (existing.connected) return { browser: existing, reused: true };
    } catch {
      // Previous launch failed; fall through and start a fresh one.
    }
  }
  const launched = launchBrowser();
  browserPromise = reuseBrowser ? launched : null;
  return { browser: await launched, reused: false };
}

async function releaseBrowser(browser: Browser): Promise<void> {
  if (reuseBrowser && browserPromise) return; // keep it warm for the next request
  await browser.close().catch(() => {});
}

async function discardBrowser(browser: Browser): Promise<void> {
  browserPromise = null;
  await browser.close().catch(() => {});
}

/** Render one URL (already authorized — see document-token.ts) to a PDF buffer. */
export async function renderUrlToPdf(url: string, opts: PdfOptions): Promise<Buffer> {
  const { browser, reused } = await acquireBrowser();
  try {
    return await renderPage(browser, url, opts);
  } catch (err) {
    // A container can be frozen or reaped between invocations, leaving a cached
    // handle whose Chromium is gone. That shows up as a dead browser, not as a
    // bad document — so retry once, but ONLY then. Any other failure is a real
    // one and must surface immediately rather than costing a second render.
    if (reused && !browser.connected) {
      console.warn(`[PDF] Cached browser was dead; relaunching and retrying once`);
      await discardBrowser(browser);
      const fresh = await acquireBrowser();
      try {
        return await renderPage(fresh.browser, url, opts);
      } catch (retryErr) {
        await discardBrowser(fresh.browser);
        throw retryErr;
      }
    }
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[PDF] Puppeteer render failed: ${msg}`);
    throw err;
  } finally {
    await releaseBrowser(browser);
  }
}

/** Requests that never affect the printed sheet. Next.js injects the favicon and
 *  web-manifest links into every page; fetching them only adds round trips the
 *  renderer would otherwise wait on. Matched on exact same-origin paths so a
 *  company logo that happens to be named icon.png is never blocked. */
const IGNORED_PATHS = new Set(["/favicon.ico", "/icon.png", "/manifest.webmanifest"]);

async function renderPage(browser: Browser, url: string, opts: PdfOptions): Promise<Buffer> {
  const origin = new URL(url).origin;
  const page = await browser.newPage();
  try {
    await page.setRequestInterception(true);
    page.on("request", (req) => {
      try {
        const target = new URL(req.url());
        if (target.origin === origin && IGNORED_PATHS.has(target.pathname)) {
          void req.abort();
          return;
        }
      } catch {
        // Not a parseable URL (data:, blob:) — let it through untouched.
      }
      void req.continue();
    });

    let response;
    try {
      console.log(`[PDF] Loading URL: ${url}`);
      // networkidle0 waits for the network to go quiet for half a second — time
      // spent idling rather than rendering. The printed sheet only depends on
      // the document, its fonts and its images, so wait for exactly those below.
      response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
      console.log(`[PDF] URL loaded successfully`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[PDF] Failed to load ${url}: ${msg}`);
      throw new Error(`Failed to load ${url}: ${msg}`);
    }

    // A print page that errored still renders HTML — Next.js's error page — and
    // Chromium prints it happily. That ships a plausible-looking PDF containing
    // an error screen instead of the invoice. Treat any error status as fatal.
    const status = response?.status() ?? 0;
    if (status >= 400) {
      console.error(`[PDF] Print page returned HTTP ${status}`);
      throw new Error(`Print page returned HTTP ${status} — refusing to print an error page.`);
    }

    // Never print a page we did not ask for. If something redirected us — a
    // Vercel Deployment Protection SSO screen, or the app's own login page —
    // the render "succeeds" and the user downloads a PDF of a login form. Fail
    // loudly instead, so the cause is visible rather than shipped as a document.
    const landed = page.url();
    if (!landed.startsWith(new URL(url).origin) || /vercel\.com\/(sso|login)/.test(landed)) {
      console.error(`[PDF] Redirected away from the print page: ${landed}`);
      throw new Error(
        `Print page redirected to ${landed} — the render target is not publicly reachable.`,
      );
    }

    // Wait for what actually lands on paper: webfonts (otherwise the sheet
    // prints in a fallback face) and images (otherwise the company logo is
    // missing). A stuck asset must not hold the document hostage, so this is
    // capped — a slightly imperfect PDF beats a request that never returns.
    try {
      await Promise.race([
        page.evaluate(async () => {
          await document.fonts.ready;
          await Promise.all(
            Array.from(document.images)
              .filter((img) => !img.complete)
              .map(
                (img) =>
                  new Promise<void>((resolve) => {
                    img.addEventListener("load", () => resolve(), { once: true });
                    img.addEventListener("error", () => resolve(), { once: true });
                  }),
              ),
          );
        }),
        new Promise((_, reject) => setTimeout(() => reject(new Error("assets timeout")), 8_000)),
      ]);
      console.log(`[PDF] Fonts and images ready`);
    } catch (err) {
      console.warn(`[PDF] Asset wait cut short (printing anyway): ${err instanceof Error ? err.message : String(err)}`);
    }

    const footerTemplate = opts.footerLeft
      ? `<div style="width:100%;font-size:8px;color:#8B98A4;font-family:Helvetica,Arial,sans-serif;padding:0 22mm;display:flex;justify-content:space-between;">
          <span>${escapeHtml(opts.footerLeft)}</span>
          <span>${escapeHtml(opts.pageOfLabel ?? "Page")} <span class="pageNumber"></span> / <span class="totalPages"></span></span>
        </div>`
      : `<div></div>`;

    console.log(`[PDF] Generating PDF...`);
    const pdf = await page.pdf({
      format: "A4",
      landscape: opts.orientation === "landscape",
      printBackground: true,
      preferCSSPageSize: true,
      displayHeaderFooter: Boolean(opts.footerLeft),
      headerTemplate: "<div></div>",
      footerTemplate,
      margin: opts.footerLeft ? { top: "0", bottom: "10mm", left: "0", right: "0" } : { top: 0, bottom: 0, left: 0, right: 0 },
    });
    console.log(`[PDF] PDF generated successfully, size: ${pdf.length} bytes`);
    return Buffer.from(pdf);
  } finally {
    // Close the tab, not the browser — the browser may be kept warm for the
    // next request. Leaking tabs would grow memory across invocations.
    await page.close().catch(() => {});
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Base URL this server can reach itself at — used to build the print URL
 *  Puppeteer navigates to.
 *
 *  On Vercel this MUST be the public production domain, never VERCEL_URL.
 *  VERCEL_URL is the per-deployment hostname (ayzenith-<hash>.vercel.app), which
 *  Deployment Protection guards with a Vercel SSO login page. Headless Chromium
 *  has no Vercel session, so it would receive that login page and print IT into
 *  the PDF — the document downloads fine but contains a Vercel login screen.
 *  siteConfig.url resolves to NEXT_PUBLIC_SITE_URL, defaulting to the real
 *  public domain, which serves the print page normally. */
export function selfBaseUrl(): string {
  if (process.env.VERCEL) return siteConfig.url;
  const port = process.env.PORT ?? "3000";
  return `http://127.0.0.1:${port}`;
}
