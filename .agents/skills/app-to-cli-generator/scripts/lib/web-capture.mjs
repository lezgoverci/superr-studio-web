import fs from "node:fs/promises";
import path from "node:path";
import { URL } from "node:url";
import {
  runAgentBrowser,
  runAgentBrowserEval,
  runAgentBrowserJson,
} from "./agent-browser-utils.mjs";
import { slugify, writeJsonFile } from "./manifest-utils.mjs";

const CAPTURE_WAIT_MS = 1000;
const DETAIL_BLACKLIST_REGEX = /^[a-z0-9-]+$/i;
const PROTOCOL_REGEX = /^https?:$/;
const TEXT_ONLY_REGEX = /^[\d\s,.₱$]+$/;
const DETAIL_PREFIXES = new Set([
  "article",
  "articles",
  "item",
  "items",
  "post",
  "posts",
  "product",
  "products",
  "workflow",
  "workflows",
]);
const LIST_PREFIXES = new Set([
  "blog",
  "blogs",
  "categories",
  "category",
  "collections",
  "collection",
  "deployments",
  "docs",
  "products",
  "projects",
  "sandboxes",
  "search",
  "workflows",
]);
const SKIP_SEGMENTS = new Set([
  "account",
  "api",
  "apps",
  "auth",
  "billing",
  "cart",
  "checkout",
  "contact",
  "help",
  "legal",
  "login",
  "password",
  "policies",
  "policy",
  "privacy",
  "returns",
  "settings",
  "shipping",
  "signup",
  "terms",
]);
const DETAIL_BLACKLIST = new Set([
  "billing",
  "checkout",
  "create",
  "edit",
  "login",
  "new",
  "settings",
  "signup",
]);

function normalizePathname(pathname) {
  const normalized =
    pathname.endsWith("/") && pathname !== "/"
      ? pathname.slice(0, -1)
      : pathname;
  return normalized || "/";
}

function normalizeWhitespace(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function safeUrl(value, baseUrl) {
  try {
    return new URL(value, baseUrl);
  } catch {
    return null;
  }
}

function normalizedUrlKey(value) {
  const parsed = safeUrl(value, value);
  if (!parsed) {
    return value;
  }
  return `${parsed.origin}${normalizePathname(parsed.pathname)}`;
}

function classifyPathname(pathname) {
  const normalizedPathname = normalizePathname(pathname);
  const segments = normalizedPathname
    .split("/")
    .map((segment) => segment.trim())
    .filter(Boolean);

  if (segments.length === 0) {
    return {
      kind: "home",
      prefix: "home",
      segments,
    };
  }

  const [firstSegment, lastSegment] = segments;
  if (SKIP_SEGMENTS.has(firstSegment)) {
    return {
      kind: "skip",
      prefix: firstSegment,
      segments,
    };
  }

  if (DETAIL_PREFIXES.has(firstSegment) && segments.length >= 2) {
    return {
      kind: "detail",
      prefix: firstSegment,
      segments,
    };
  }

  if (LIST_PREFIXES.has(firstSegment)) {
    return {
      kind: "list",
      prefix: firstSegment,
      segments,
    };
  }

  if (
    segments.length >= 2 &&
    lastSegment &&
    !DETAIL_BLACKLIST.has(lastSegment) &&
    DETAIL_BLACKLIST_REGEX.test(lastSegment)
  ) {
    return {
      kind: "detail",
      prefix: firstSegment,
      segments,
    };
  }

  if (segments.length === 1) {
    return {
      kind: "list",
      prefix: firstSegment,
      segments,
    };
  }

  return {
    kind: "page",
    prefix: firstSegment,
    segments,
  };
}

function shouldIgnoreLink(parsedUrl) {
  if (!parsedUrl) {
    return true;
  }

  if (!PROTOCOL_REGEX.test(parsedUrl.protocol)) {
    return true;
  }

  const normalizedPath = normalizePathname(parsedUrl.pathname);
  if (normalizedPath === "/") {
    return false;
  }

  if (
    parsedUrl.hash ||
    parsedUrl.searchParams.has("variant") ||
    normalizedPath.endsWith(".js") ||
    normalizedPath.endsWith(".json")
  ) {
    return true;
  }

  const classification = classifyPathname(parsedUrl.pathname);
  return classification.kind === "skip";
}

function scoreListCandidate(link) {
  const classification = classifyPathname(link.pathname);
  let score = 0;

  if (classification.kind === "list") {
    score += 8;
  }
  if (link.inNav) {
    score += 6;
  }
  if (classification.segments.length <= 2) {
    score += 3;
  }
  if (link.text) {
    score += 2;
  }

  return score;
}

function scoreDetailCandidate(link) {
  const classification = classifyPathname(link.pathname);
  let score = 0;

  if (classification.kind === "detail") {
    score += 10;
  }
  if (DETAIL_PREFIXES.has(classification.prefix)) {
    score += 5;
  }
  if (link.text && !TEXT_ONLY_REGEX.test(link.text)) {
    score += 3;
  }
  if (classification.segments.length >= 2) {
    score += 2;
  }

  return score;
}

function buildDomMetadataScript() {
  return `
    (() => {
      const normalizeText = (value) => String(value || "").replace(/\\s+/g, " ").trim();
      const baseOrigin = window.location.origin;
      const seen = new Set();
      const generator = document.querySelector('meta[name="generator"]')?.content || "";
      const scriptSrcs = Array.from(document.scripts)
        .map((script) => script.src)
        .filter(Boolean);
      const stylesheetHrefs = Array.from(document.querySelectorAll('link[href]'))
        .map((element) => element.href)
        .filter(Boolean);

      const toLinkRecord = (element) => {
        const href = element.getAttribute("href");
        if (!href) {
          return null;
        }

        let absoluteUrl;
        try {
          absoluteUrl = new URL(href, window.location.href);
        } catch {
          return null;
        }

        if (absoluteUrl.origin !== baseOrigin) {
          return null;
        }

        const key = absoluteUrl.origin + absoluteUrl.pathname + absoluteUrl.search;
        if (seen.has(key)) {
          return null;
        }
        seen.add(key);

        return {
          text:
            normalizeText(element.textContent) ||
            normalizeText(element.getAttribute("aria-label")) ||
            normalizeText(element.getAttribute("title")),
          href: absoluteUrl.toString(),
          pathname: absoluteUrl.pathname,
          search: absoluteUrl.search,
          inNav: Boolean(element.closest("nav, header, [role='navigation']")),
        };
      };

      const internalLinks = Array.from(document.querySelectorAll("a[href]"))
        .map(toLinkRecord)
        .filter(Boolean)
        .slice(0, 250);

      const headings = Array.from(document.querySelectorAll("h1, h2, h3"))
        .map((heading) => ({
          level: heading.tagName.toLowerCase(),
          text: normalizeText(heading.textContent),
        }))
        .filter((heading) => heading.text)
        .slice(0, 20);

      return JSON.stringify({
        title: document.title,
        url: window.location.href,
        pathname: window.location.pathname,
        generator,
        headings,
        navLinks: internalLinks.filter((link) => link.inNav).slice(0, 40),
        internalLinks,
        platformHints: {
          shopify:
            Boolean(window.Shopify) ||
            scriptSrcs.some((src) => src.includes("shopify")) ||
            stylesheetHrefs.some((href) => href.includes("shopify")) ||
            generator.toLowerCase().includes("shopify"),
          generator,
          hasWindowShopify: Boolean(window.Shopify),
          scriptSrcs: scriptSrcs.slice(0, 20),
        },
      });
    })();
  `;
}

async function bestEffortText(args, options = {}) {
  try {
    const result = await runAgentBrowser(args, {
      ...options,
      allowFailure: false,
    });
    return result.stdout;
  } catch {
    return "";
  }
}

async function capturePage({
  url,
  pageId,
  label,
  outputRoot,
  sessionName,
  headed = false,
}) {
  const screenshotsDirectory = path.join(outputRoot, "captures/screenshots");
  const snapshotsDirectory = path.join(outputRoot, "captures/snapshots");
  const pagesDirectory = path.join(outputRoot, "captures/pages");
  const networkDirectory = path.join(outputRoot, "captures/network");

  await runAgentBrowser(["open", url, "--waitUntil", "domcontentloaded"], {
    sessionName,
    headed,
  });
  await runAgentBrowser(["wait", "--load", "domcontentloaded"], {
    sessionName,
  });
  await runAgentBrowser(["wait", String(CAPTURE_WAIT_MS)], {
    sessionName,
  });

  let requestsEnabled = false;
  try {
    await runAgentBrowserJson(["network", "requests", "--clear"], {
      sessionName,
    });
    requestsEnabled = true;
  } catch {
    requestsEnabled = false;
  }

  if (requestsEnabled) {
    await runAgentBrowser(["open", url, "--waitUntil", "domcontentloaded"], {
      sessionName,
      headed,
    });
    await runAgentBrowser(["wait", "--load", "domcontentloaded"], {
      sessionName,
    });
    await runAgentBrowser(["wait", String(CAPTURE_WAIT_MS)], {
      sessionName,
    });
  }

  const screenshotPath = path.join(screenshotsDirectory, `${pageId}.png`);
  await runAgentBrowser(["screenshot", "--annotate", screenshotPath], {
    sessionName,
  });

  const snapshotText = await bestEffortText(["snapshot", "-i"], {
    sessionName,
  });
  const snapshotJson = await runAgentBrowserJson(["snapshot", "-i"], {
    sessionName,
  });
  const title = await bestEffortText(["get", "title"], { sessionName });
  const finalUrl = await bestEffortText(["get", "url"], { sessionName });
  const pageText = await bestEffortText(["get", "text", "body"], {
    sessionName,
  });
  const domMetadataRaw = await runAgentBrowserEval(buildDomMetadataScript(), {
    sessionName,
  });

  let domMetadata = {
    headings: [],
    internalLinks: [],
    navLinks: [],
    platformHints: {
      shopify: false,
    },
  };

  try {
    domMetadata = JSON.parse(String(domMetadataRaw || "{}"));
  } catch {
    domMetadata = {
      headings: [],
      internalLinks: [],
      navLinks: [],
      platformHints: {
        shopify: false,
      },
    };
  }

  let networkData = {
    requests: [],
  };
  if (requestsEnabled) {
    try {
      networkData = await runAgentBrowserJson(["network", "requests"], {
        sessionName,
      });
    } catch {
      networkData = {
        requests: [],
      };
    }
  }

  const finalUrlObject = safeUrl(finalUrl || url, url) || new URL(url);
  const classification = classifyPathname(finalUrlObject.pathname);

  const internalLinks = (domMetadata.internalLinks || [])
    .map((link) => {
      const parsedUrl = safeUrl(link.href, finalUrlObject.toString());
      if (!parsedUrl || shouldIgnoreLink(parsedUrl)) {
        return null;
      }

      return {
        text: normalizeWhitespace(link.text),
        href: parsedUrl.toString(),
        pathname: normalizePathname(parsedUrl.pathname),
        search: parsedUrl.search,
        inNav: Boolean(link.inNav),
      };
    })
    .filter(Boolean);

  const pageCapture = {
    id: pageId,
    label,
    title: normalizeWhitespace(title),
    url: finalUrlObject.toString(),
    pathname: normalizePathname(finalUrlObject.pathname),
    kind: classification.kind,
    primaryPrefix: classification.prefix,
    pathSegments: classification.segments,
    headings: domMetadata.headings || [],
    navLinks: (domMetadata.navLinks || []).map((link) => ({
      text: normalizeWhitespace(link.text),
      href: link.href,
      pathname: normalizePathname(link.pathname || new URL(link.href).pathname),
      inNav: true,
    })),
    internalLinks,
    platformHints: {
      shopify: Boolean(domMetadata.platformHints?.shopify),
      generator:
        domMetadata.platformHints?.generator || domMetadata.generator || "",
      hasWindowShopify: Boolean(domMetadata.platformHints?.hasWindowShopify),
      scriptSrcs: domMetadata.platformHints?.scriptSrcs || [],
    },
    networkRequests: networkData.requests || [],
    artifacts: {
      screenshotPath,
      snapshotTextPath: path.join(snapshotsDirectory, `${pageId}.txt`),
      snapshotJsonPath: path.join(snapshotsDirectory, `${pageId}.json`),
      pageTextPath: path.join(pagesDirectory, `${pageId}.txt`),
      pageJsonPath: path.join(pagesDirectory, `${pageId}.json`),
      networkPath: path.join(networkDirectory, `${pageId}.json`),
    },
  };

  await fs.writeFile(
    pageCapture.artifacts.snapshotTextPath,
    `${snapshotText}\n`
  );
  await writeJsonFile(pageCapture.artifacts.snapshotJsonPath, snapshotJson);
  await fs.writeFile(pageCapture.artifacts.pageTextPath, `${pageText}\n`);
  await writeJsonFile(pageCapture.artifacts.networkPath, networkData);
  await writeJsonFile(pageCapture.artifacts.pageJsonPath, pageCapture);

  return pageCapture;
}

function toCandidate(link, sourcePage, kind) {
  const parsedUrl = safeUrl(link.href, sourcePage.url);
  if (!parsedUrl || shouldIgnoreLink(parsedUrl)) {
    return null;
  }

  const classification = classifyPathname(parsedUrl.pathname);
  if (classification.kind !== kind) {
    return null;
  }

  return {
    url: parsedUrl.toString(),
    pathname: normalizePathname(parsedUrl.pathname),
    text: normalizeWhitespace(link.text),
    inNav: Boolean(link.inNav),
    sourcePageId: sourcePage.id,
    kind,
    score:
      kind === "list" ? scoreListCandidate(link) : scoreDetailCandidate(link),
  };
}

function selectCandidates(pages, kind, limit, visitedUrls) {
  const candidates = pages
    .flatMap((page) =>
      page.internalLinks.map((link) => toCandidate(link, page, kind))
    )
    .filter(Boolean)
    .filter((candidate) => !visitedUrls.has(normalizedUrlKey(candidate.url)));

  const deduped = [];
  const seen = new Set();
  for (const candidate of candidates.sort(
    (left, right) => right.score - left.score
  )) {
    const key = normalizedUrlKey(candidate.url);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(candidate);
  }

  return deduped.slice(0, limit);
}

export async function captureWebTarget({
  appName,
  targetUrl,
  outputRoot,
  sessionName,
  headed = false,
  maxListPages = 3,
  maxDetailPages = 2,
}) {
  const capturesRoot = path.join(outputRoot, "captures");
  await fs.mkdir(path.join(capturesRoot, "screenshots"), { recursive: true });
  await fs.mkdir(path.join(capturesRoot, "snapshots"), { recursive: true });
  await fs.mkdir(path.join(capturesRoot, "pages"), { recursive: true });
  await fs.mkdir(path.join(capturesRoot, "network"), { recursive: true });
  await fs.mkdir(path.join(capturesRoot, "auth"), { recursive: true });

  const pages = [];
  const visitedUrls = new Set();
  const rootUrl = new URL(targetUrl);

  const homePage = await capturePage({
    url: rootUrl.toString(),
    pageId: "00-home",
    label: "home",
    outputRoot,
    sessionName,
    headed,
  });
  pages.push(homePage);
  visitedUrls.add(normalizedUrlKey(homePage.url));

  const listCandidates = selectCandidates(
    [homePage],
    "list",
    maxListPages,
    visitedUrls
  );

  for (const [index, candidate] of listCandidates.entries()) {
    const pageId = `${String(index + 1).padStart(2, "0")}-${slugify(
      candidate.pathname.replaceAll("/", "-") || candidate.text || "list"
    )}`;
    const capturedPage = await capturePage({
      url: candidate.url,
      pageId,
      label: candidate.text || candidate.pathname,
      outputRoot,
      sessionName,
      headed,
    });
    pages.push(capturedPage);
    visitedUrls.add(normalizedUrlKey(capturedPage.url));
  }

  const detailCandidates = selectCandidates(
    pages,
    "detail",
    maxDetailPages,
    visitedUrls
  );

  for (const [index, candidate] of detailCandidates.entries()) {
    const pageId = `${String(index + pages.length).padStart(2, "0")}-${slugify(
      candidate.pathname.replaceAll("/", "-") || candidate.text || "detail"
    )}`;
    const capturedPage = await capturePage({
      url: candidate.url,
      pageId,
      label: candidate.text || candidate.pathname,
      outputRoot,
      sessionName,
      headed,
    });
    pages.push(capturedPage);
    visitedUrls.add(normalizedUrlKey(capturedPage.url));
  }

  const captureSummary = {
    appName,
    targetUrl: rootUrl.toString(),
    capturedAt: new Date().toISOString(),
    sessionName,
    pages,
    stats: {
      totalPages: pages.length,
      listPages: pages.filter((page) => page.kind === "list").length,
      detailPages: pages.filter((page) => page.kind === "detail").length,
      shopifyDetected: pages.some((page) => page.platformHints.shopify),
    },
  };

  await writeJsonFile(
    path.join(capturesRoot, "site-capture.json"),
    captureSummary
  );

  try {
    await runAgentBrowser(["close"], {
      sessionName,
      allowFailure: true,
    });
  } catch {
    // ignore close errors
  }

  return captureSummary;
}
