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
    const chromium = (await import("@sparticuz/chromium")).default;
    return puppeteer.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: true,
    });
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

/** Render one URL (already authorized — see document-token.ts) to a PDF buffer. */
export async function renderUrlToPdf(url: string, opts: PdfOptions): Promise<Buffer> {
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: "networkidle0", timeout: 30_000 });
    await page.evaluateHandle("document.fonts.ready");

    const footerTemplate = opts.footerLeft
      ? `<div style="width:100%;font-size:8px;color:#8B98A4;font-family:Helvetica,Arial,sans-serif;padding:0 22mm;display:flex;justify-content:space-between;">
          <span>${escapeHtml(opts.footerLeft)}</span>
          <span>${escapeHtml(opts.pageOfLabel ?? "Page")} <span class="pageNumber"></span> / <span class="totalPages"></span></span>
        </div>`
      : `<div></div>`;

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
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Base URL this server can reach itself at — used to build the print URL
 *  Puppeteer navigates to. */
export function selfBaseUrl(): string {
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  if (process.env.NEXT_PUBLIC_SITE_URL && process.env.VERCEL) return process.env.NEXT_PUBLIC_SITE_URL;
  const port = process.env.PORT ?? "3000";
  return `http://127.0.0.1:${port}`;
}
