import { existsSync } from "node:fs";
import puppeteer from "puppeteer-core";
import env from "../config/env.config.js";
import { serviceUnavailable } from "../http/errors.js";
import { logger } from "../logging/logger.js";

/* HTML -> PDF with a headless Chrome/Chromium (PDF_BROWSER_PATH, else a usual install path).
   The HTML may be written by a school, so every page renders with JavaScript off and no
   network: only data: URLs load (embed images and fonts as data URIs). Pages honour CSS
   @page (size, margins); A4 when the CSS sets none.

   One browser is shared by the process, launched on first use and closed when idle;
   at most PDF_MAX_PAGES documents render at once. */

const CANDIDATES = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable"
];
const IDLE_CLOSE_MS = 5 * 60 * 1000;

const executablePath = () => env.pdf.browserPath ?? CANDIDATES.find(path => existsSync(path));

let browserPromise = null;
let idleTimer = null;
let running = 0;
const waiting = [];

const launch = () => {
  const path = executablePath();
  if (!path) {
    throw serviceUnavailable(
      "PDF printing is not set up on this server: install Chrome or Chromium, or set PDF_BROWSER_PATH"
    );
  }
  browserPromise ??= puppeteer
    .launch({
      executablePath: path,
      headless: true,
      args: [
        "--disable-gpu",
        "--disable-dev-shm-usage",
        "--no-first-run",
        ...(env.pdf.noSandbox ? ["--no-sandbox"] : [])
      ]
    })
    .then(browser => {
      browser.on("disconnected", () => {
        browserPromise = null;
      });
      return browser;
    })
    .catch(error => {
      browserPromise = null;
      logger.error({ err: error }, "PDF browser failed to start");
      throw serviceUnavailable("PDF printing is unavailable: the browser could not start");
    });
  return browserPromise;
};

const acquire = async () => {
  clearTimeout(idleTimer);
  if (running >= env.pdf.maxPages) await new Promise(resolve => waiting.push(resolve));
  running++;
};

const release = () => {
  running--;
  waiting.shift()?.();
  if (!running && browserPromise) {
    idleTimer = setTimeout(closeHtmlPdf, IDLE_CLOSE_MS);
    idleTimer.unref();
  }
};

/* html: a complete document -> PDF Buffer */
export const htmlToPdf = async html => {
  await acquire();
  let context;
  try {
    const browser = await launch();
    /* Its own context per document: no cookies, cache or storage shared between them */
    context = await browser.createBrowserContext();
    const page = await context.newPage();
    await page.setJavaScriptEnabled(false);
    await page.setRequestInterception(true);
    page.on("request", request => {
      const url = request.url();
      if (url.startsWith("data:") || url === "about:blank") request.continue();
      else request.abort("blockedbyclient");
    });
    await page.setContent(html, { waitUntil: "load", timeout: env.pdf.timeoutMs });
    const pdf = await page.pdf({
      format: "A4",
      preferCSSPageSize: true,
      printBackground: true,
      timeout: env.pdf.timeoutMs
    });
    return Buffer.from(pdf);
  } finally {
    await context?.close().catch(() => {});
    release();
  }
};

/* Close the shared browser (idle, or the process is stopping) */
export const closeHtmlPdf = async () => {
  const pending = browserPromise;
  browserPromise = null;
  const browser = await pending?.catch(() => null);
  await browser?.close().catch(() => {});
};
