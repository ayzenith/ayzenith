import "server-only";

/**
 * PDF rendering strategy:
 *
 * - Development: local Puppeteer + Chrome/Edge installed on system
 * - Production (Vercel): PDFShift API (no Chromium binary needed)
 * - Fallback: retry with alternative method if primary fails
 *
 * All render the same /doc/[id]/print page (see src/components/trade-docs/document-template.tsx)
 */

import type { Browser } from "puppeteer-core";
import PDFShift from "pdfshift";

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
      throw new Error(
        `PDF rendering requires Chromium binary. Install @sparticuz/chromium or configure a different PDF service. Error: ${msg}`
      );
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

/** Render one URL (already authorized — see document-token.ts) to a PDF buffer. */
export async function renderUrlToPdf(url: string, opts: PdfOptions): Promise<Buffer> {
  const isDev = process.env.NODE_ENV === "development";
  const usePdfShift = !isDev && process.env.PDFSHIFT_API_KEY;

  if (usePdfShift) {
    return renderWithPdfShift(url, opts);
  }

  return renderWithPuppeteer(url, opts);
}

async function renderWithPdfShift(url: string, opts: PdfOptions): Promise<Buffer> {
  try {
    console.log(`[PDF] Using PDFShift for ${url}`);
    const client = new PDFShift(process.env.PDFSHIFT_API_KEY!);

    const response = await client.convert({
      source: url,
      landscape: opts.orientation === "landscape",
    });

    console.log(`[PDF] PDFShift generated PDF, size: ${response.length} bytes`);
    return response;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[PDF] PDFShift failed: ${msg}`);
    throw new Error(`PDF generation with PDFShift failed: ${msg}`);
  }
}

async function renderWithPuppeteer(url: string, opts: PdfOptions): Promise<Buffer> {
  let browser: Browser | null = null;
  try {
    console.log(`[PDF] Starting Puppeteer render for ${url}`);
    browser = await launchBrowser();
    console.log(`[PDF] Browser launched`);

    const page = await browser.newPage();
    console.log(`[PDF] Page created`);

    try {
      console.log(`[PDF] Loading URL: ${url}`);
      await page.goto(url, { waitUntil: "networkidle0", timeout: 60_000 });
      console.log(`[PDF] URL loaded successfully`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[PDF] Failed to load ${url}: ${msg}`);
      throw new Error(`Failed to load ${url}: ${msg}`);
    }

    try {
      await Promise.race([
        page.evaluateHandle("document.fonts.ready"),
        new Promise((_, reject) => setTimeout(() => reject(new Error("fonts timeout")), 5_000)),
      ]);
      console.log(`[PDF] Fonts ready`);
    } catch (err) {
      console.warn(`[PDF] Font loading failed (continuing with defaults): ${err instanceof Error ? err.message : String(err)}`);
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
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[PDF] Puppeteer render failed: ${msg}`);
    throw err;
  } finally {
    if (browser) {
      console.log(`[PDF] Closing browser`);
      await browser.close();
    }
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
