import { buildManifestSkeleton, validateManifest } from "./manifest-utils.mjs";

const READABLE_WAIT_MS = 1000;
const HANDLE_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)+$/i;

function singularize(value) {
  if (value.endsWith("ies")) {
    return `${value.slice(0, -3)}y`;
  }
  if (value.endsWith("ses")) {
    return value.slice(0, -2);
  }
  if (value.endsWith("s") && value.length > 1) {
    return value.slice(0, -1);
  }
  return value;
}

function normalizeDescription(value, fallback) {
  const normalized = String(value || "")
    .replace(/\s+/g, " ")
    .trim();
  return normalized || fallback;
}

function isLikelyHandle(value) {
  return HANDLE_REGEX.test(String(value || ""));
}

function findHomePage(captureSummary) {
  return (
    captureSummary.pages.find((page) => page.kind === "home") ||
    captureSummary.pages[0]
  );
}

function findPrimaryListPage(captureSummary) {
  return captureSummary.pages.find((page) => page.kind === "list");
}

function groupDetailPagesByPrefix(captureSummary) {
  const groups = new Map();

  for (const page of captureSummary.pages.filter(
    (entry) => entry.kind === "detail"
  )) {
    const prefix = page.primaryPrefix;
    if (!prefix) {
      continue;
    }

    if (!groups.has(prefix)) {
      groups.set(prefix, []);
    }

    groups.get(prefix).push(page);
  }

  return groups;
}

function findRecipeFromNetworkLog(detailPages, inputName) {
  const networkRequests = detailPages.flatMap(
    (page) => page.networkRequests || []
  );
  for (const page of detailPages) {
    const slug = page.pathSegments.at(-1) || "";
    const recipe = tryBuildRecipeFromRequests(
      page.primaryPrefix,
      slug,
      inputName,
      networkRequests
    );
    if (recipe) {
      return recipe;
    }
  }
  return null;
}

function tryBuildRecipeFromRequests(prefix, slug, inputName, networkRequests) {
  for (const request of networkRequests) {
    if (!(request.url && request.method)) {
      continue;
    }

    if (!request.url.includes(`/${slug}`)) {
      continue;
    }

    if (
      request.url.endsWith(`/${slug}.js`) ||
      request.url.endsWith(`/${slug}.json`)
    ) {
      const suffix = request.url.endsWith(".json") ? ".json" : ".js";
      return {
        id: `${prefix}-get-api`,
        method: request.method,
        url: `/${prefix}/{{args.${inputName}}}${suffix}`,
        headers: {
          accept: request.headers?.accept || "application/json",
        },
        query: {},
        responseType: "json",
        useCookies: false,
        source: "network-log",
      };
    }
  }
  return null;
}

function findShopifyRecipe(detailPages, inputName) {
  const shopifyDetected = detailPages.some(
    (page) => page.platformHints.shopify
  );
  const prefix = detailPages[0]?.primaryPrefix;
  if (shopifyDetected && prefix === "products") {
    return {
      id: `${prefix}-get-api`,
      method: "GET",
      url: `/${prefix}/{{args.${inputName}}}.js`,
      headers: {
        accept: "application/json",
      },
      query: {},
      responseType: "json",
      useCookies: false,
      source: "shopify-heuristic",
    };
  }
  return null;
}

function findRequestRecipe(detailPages, inputName) {
  const networkRecipe = findRecipeFromNetworkLog(detailPages, inputName);
  if (networkRecipe) {
    return networkRecipe;
  }
  return findShopifyRecipe(detailPages, inputName);
}

function buildHomeTitleFlow() {
  return {
    id: "home-title-ui",
    description: "Open the home page and read its title.",
    steps: [
      {
        action: "open",
        url: "{{app.baseUrl}}",
      },
      {
        action: "wait",
        ms: READABLE_WAIT_MS,
      },
      {
        action: "getTitle",
        saveAs: "pageTitle",
      },
    ],
    result: {
      capture: "pageTitle",
    },
  };
}

function buildListFlow(listPage) {
  return {
    id: `${listPage.primaryPrefix}-list-ui`,
    description: `Open the captured ${listPage.primaryPrefix} page and extract visible text.`,
    steps: [
      {
        action: "open",
        url: listPage.url,
      },
      {
        action: "wait",
        ms: READABLE_WAIT_MS,
      },
      {
        action: "getText",
        target: "body",
        saveAs: "pageText",
      },
    ],
    result: {
      capture: "pageText",
    },
  };
}

function buildDetailFlow(prefix, inputName) {
  return {
    id: `${prefix}-get-ui`,
    description: `Open a ${singularize(prefix)} detail page and capture the title and URL.`,
    steps: [
      {
        action: "open",
        url: `{{app.baseUrl}}/${prefix}/{{args.${inputName}}}`,
      },
      {
        action: "wait",
        ms: READABLE_WAIT_MS,
      },
      {
        action: "getTitle",
        saveAs: "pageTitle",
      },
      {
        action: "getUrl",
        saveAs: "pageUrl",
      },
    ],
    result: {
      template: {
        title: "{{captures.pageTitle}}",
        url: "{{captures.pageUrl}}",
      },
    },
  };
}

export function synthesizeWebManifest({
  appName,
  targetUrl,
  captureSummary,
  authStrategy = "none",
  loginUrl,
}) {
  const manifest = buildManifestSkeleton({
    appName,
    platform: "web",
    target: targetUrl,
    authStrategy,
    loginUrl,
  });

  const homePage = findHomePage(captureSummary);
  const listPage = findPrimaryListPage(captureSummary);
  const detailGroups = groupDetailPagesByPrefix(captureSummary);

  manifest.entities = [];
  manifest.commands = [];
  manifest.requestRecipes = [];
  manifest.flows = manifest.flows.filter((flow) => flow.id === "auth-login");
  manifest.selectors = [];

  manifest.flows.push(buildHomeTitleFlow());
  manifest.commands.push({
    id: "home-title",
    path: ["home", "title"],
    description: "Read the home page title.",
    mode: "ui",
    flowId: "home-title-ui",
    inputs: [],
    output: {
      type: "text",
    },
  });

  if (listPage) {
    manifest.flows.push(buildListFlow(listPage));
    manifest.commands.push({
      id: `${listPage.primaryPrefix}-list`,
      path: [listPage.primaryPrefix, "list"],
      description: normalizeDescription(
        listPage.title,
        `List ${listPage.primaryPrefix} from the captured example page.`
      ),
      mode: "ui",
      flowId: `${listPage.primaryPrefix}-list-ui`,
      inputs: [],
      output: {
        type: "text",
      },
    });
  }

  for (const [prefix, detailPages] of detailGroups.entries()) {
    const samplePage = detailPages[0];
    const sampleIdentifier = samplePage.pathSegments.at(-1) || "";
    const inputName = isLikelyHandle(sampleIdentifier) ? "handle" : "id";
    const requestRecipe = findRequestRecipe(detailPages, inputName);

    manifest.entities.push({
      name: singularize(prefix),
      plural: prefix,
      description: `Observed ${prefix} inferred from runtime capture.`,
    });
    manifest.flows.push(buildDetailFlow(prefix, inputName));
    if (requestRecipe) {
      manifest.requestRecipes.push({
        id: requestRecipe.id,
        method: requestRecipe.method,
        url: requestRecipe.url,
        headers: requestRecipe.headers,
        query: requestRecipe.query,
        responseType: requestRecipe.responseType,
        useCookies: requestRecipe.useCookies,
      });
    }
    manifest.commands.push({
      id: `${prefix}-get`,
      path: [prefix, "get"],
      description: `Get ${singularize(prefix)} data by ${inputName}.`,
      mode: requestRecipe ? "auto" : "ui",
      ...(requestRecipe ? { requestRecipeId: requestRecipe.id } : {}),
      flowId: `${prefix}-get-ui`,
      inputs: [
        {
          name: inputName,
          flag: `--${inputName}`,
          type: "string",
          description: `${singularize(prefix)} ${inputName}`,
          required: true,
        },
      ],
      output: {
        type: requestRecipe ? "json" : "text",
      },
    });
  }

  manifest.regeneration = {
    capturedAt: captureSummary.capturedAt,
    source: "runtime-observation",
    sourceNotes: [
      `Captured ${captureSummary.pages.length} page(s) with agent-browser.`,
      homePage?.platformHints.shopify ||
      captureSummary.pages.some((page) => page.platformHints.shopify)
        ? "Applied Shopify request heuristic for product detail endpoints."
        : "Generated UI-first commands from observed routes and links.",
    ],
    fingerprints: {
      target: targetUrl,
      totalPages: captureSummary.pages.length,
      detailPrefixes: [...detailGroups.keys()],
      shopifyDetected: captureSummary.pages.some(
        (page) => page.platformHints.shopify
      ),
    },
  };

  return validateManifest(manifest);
}
