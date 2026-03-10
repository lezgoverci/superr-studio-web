import fs from "node:fs/promises";
import path from "node:path";

export async function writeAgentBrowserStub({ directory, baseUrl }) {
  const stateDirectory = path.join(directory, ".agent-browser-state");
  await fs.mkdir(stateDirectory, { recursive: true });

  const scriptPath = path.join(directory, "agent-browser");
  const script = `#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";

const baseUrl = ${JSON.stringify(baseUrl)};
const stateRoot = ${JSON.stringify(stateDirectory)};
const shopifyScripts = ["https://cdn.shopify.com/shopify.js"];

const pages = {
  "/": {
    title: "Public Store",
    text: "Public Store Premium widgets for deterministic tests.",
    snapshot: [
      "Website Snapshot",
      "[Home]",
      "- ref=nav-1 link \\"Collections\\" -> /collections/widgets",
      "- ref=card-1 link \\"Widget One\\" -> /products/widget-one",
      "- ref=card-2 link \\"Widget Two\\" -> /products/widget-two"
    ].join("\\n"),
    domMetadata: {
      title: "Public Store",
      url: baseUrl + "/",
      pathname: "/",
      generator: "Shopify",
      headings: [{ level: "h1", text: "Public Store" }],
      navLinks: [
        {
          text: "Collections",
          href: baseUrl + "/collections/widgets",
          pathname: "/collections/widgets",
          search: "",
          inNav: true
        }
      ],
      internalLinks: [
        {
          text: "Collections",
          href: baseUrl + "/collections/widgets",
          pathname: "/collections/widgets",
          search: "",
          inNav: true
        },
        {
          text: "Widget One",
          href: baseUrl + "/products/widget-one",
          pathname: "/products/widget-one",
          search: "",
          inNav: false
        },
        {
          text: "Widget Two",
          href: baseUrl + "/products/widget-two",
          pathname: "/products/widget-two",
          search: "",
          inNav: false
        }
      ],
      platformHints: {
        shopify: true,
        generator: "Shopify",
        hasWindowShopify: true,
        scriptSrcs: shopifyScripts
      }
    },
    requests: []
  },
  "/collections/widgets": {
    title: "Widgets Collection",
    text: "Widgets Widget One Widget Two",
    snapshot: [
      "Website Snapshot",
      "[Widgets]",
      "- ref=item-1 link \\"Widget One\\" -> /products/widget-one",
      "- ref=item-2 link \\"Widget Two\\" -> /products/widget-two"
    ].join("\\n"),
    domMetadata: {
      title: "Widgets Collection",
      url: baseUrl + "/collections/widgets",
      pathname: "/collections/widgets",
      generator: "Shopify",
      headings: [{ level: "h1", text: "Widgets" }],
      navLinks: [],
      internalLinks: [
        {
          text: "Widget One",
          href: baseUrl + "/products/widget-one",
          pathname: "/products/widget-one",
          search: "",
          inNav: false
        },
        {
          text: "Widget Two",
          href: baseUrl + "/products/widget-two",
          pathname: "/products/widget-two",
          search: "",
          inNav: false
        }
      ],
      platformHints: {
        shopify: true,
        generator: "Shopify",
        hasWindowShopify: true,
        scriptSrcs: shopifyScripts
      }
    },
    requests: []
  },
  "/products/widget-one": {
    title: "Widget One",
    text: "Widget One The first deterministic widget.",
    snapshot: [
      "Website Snapshot",
      "[Widget One]",
      "- ref=title-1 heading \\"Widget One\\""
    ].join("\\n"),
    domMetadata: {
      title: "Widget One",
      url: baseUrl + "/products/widget-one",
      pathname: "/products/widget-one",
      generator: "Shopify",
      headings: [{ level: "h1", text: "Widget One" }],
      navLinks: [],
      internalLinks: [],
      platformHints: {
        shopify: true,
        generator: "Shopify",
        hasWindowShopify: true,
        scriptSrcs: shopifyScripts
      }
    },
    requests: []
  },
  "/products/widget-two": {
    title: "Widget Two",
    text: "Widget Two The second deterministic widget.",
    snapshot: [
      "Website Snapshot",
      "[Widget Two]",
      "- ref=title-1 heading \\"Widget Two\\""
    ].join("\\n"),
    domMetadata: {
      title: "Widget Two",
      url: baseUrl + "/products/widget-two",
      pathname: "/products/widget-two",
      generator: "Shopify",
      headings: [{ level: "h1", text: "Widget Two" }],
      navLinks: [],
      internalLinks: [],
      platformHints: {
        shopify: true,
        generator: "Shopify",
        hasWindowShopify: true,
        scriptSrcs: shopifyScripts
      }
    },
    requests: []
  }
};

function parseArgs(argv) {
  let json = false;
  let session = "default";
  const rest = [];

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--json") {
      json = true;
      continue;
    }
    if (token === "--session") {
      session = argv[index + 1] || session;
      index += 1;
      continue;
    }
    if (token === "--headed") {
      continue;
    }
    rest.push(token);
  }

  return { json, session, rest };
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

function getStatePath(session) {
  return path.join(stateRoot, session + ".json");
}

async function loadState(session) {
  try {
    return JSON.parse(await fs.readFile(getStatePath(session), "utf8"));
  } catch {
    return {
      currentUrl: baseUrl + "/",
      networkEnabled: false,
      requests: []
    };
  }
}

async function saveState(session, state) {
  await fs.writeFile(getStatePath(session), JSON.stringify(state, null, 2) + "\\n");
}

function getPage(currentUrl) {
  const url = new URL(currentUrl, baseUrl);
  const known = pages[url.pathname];
  if (known) {
    return known;
  }
  if (url.pathname.startsWith("/products/")) {
    return {
      title: "404 | Public Store",
      text: "Not found",
      snapshot: [
        "Website Snapshot",
        "[Not found]",
        "- ref=missing-1 text \\"Not found\\""
      ].join("\\n"),
      domMetadata: {
        title: "404 | Public Store",
        url: url.toString(),
        pathname: url.pathname,
        generator: "Shopify",
        headings: [{ level: "h1", text: "Not found" }],
        navLinks: [],
        internalLinks: [],
        platformHints: {
          shopify: true,
          generator: "Shopify",
          hasWindowShopify: true,
          scriptSrcs: shopifyScripts
        }
      },
      requests: []
    };
  }
  return {
    title: "Public Store",
    text: "Public Store",
    snapshot: "Website Snapshot\\n[Public Store]",
    domMetadata: {
      title: "Public Store",
      url: url.toString(),
      pathname: url.pathname,
      generator: "Shopify",
      headings: [{ level: "h1", text: "Public Store" }],
      navLinks: [],
      internalLinks: [],
      platformHints: {
        shopify: true,
        generator: "Shopify",
        hasWindowShopify: true,
        scriptSrcs: shopifyScripts
      }
    },
    requests: []
  };
}

function emit(value, json) {
  if (json) {
    process.stdout.write(JSON.stringify({ success: true, data: value, error: null }) + "\\n");
    return;
  }

  if (typeof value === "string") {
    process.stdout.write(value + "\\n");
    return;
  }

  process.stdout.write(JSON.stringify(value, null, 2) + "\\n");
}

function fail(message) {
  process.stderr.write(message + "\\n");
  process.exitCode = 1;
}

const { json, session, rest } = parseArgs(process.argv.slice(2));
const state = await loadState(session);
const command = rest[0];

if (!command) {
  fail("Missing command.");
} else if (command === "open") {
  state.currentUrl = new URL(rest[1] || "/", baseUrl).toString();
  await saveState(session, state);
  emit("opened", json);
} else if (command === "wait") {
  emit("waited", json);
} else if (command === "reload") {
  const page = getPage(state.currentUrl);
  state.requests = state.networkEnabled ? page.requests : [];
  await saveState(session, state);
  emit("reloaded", json);
} else if (command === "screenshot") {
  const outputPath = rest.at(-1);
  if (!outputPath) {
    fail("Missing screenshot output path.");
  } else {
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, "stub screenshot\\n");
    emit(outputPath, json);
  }
} else if (command === "snapshot") {
  const interactive = rest.includes("-i");
  const page = getPage(state.currentUrl);
  if (json) {
    emit(
      {
        origin: state.currentUrl,
        refs: {},
        snapshot: page.snapshot
      },
      true
    );
  } else {
    emit(page.snapshot, false);
  }
} else if (command === "get") {
  const subcommand = rest[1];
  const subsubcommand = rest[2];
  const page = getPage(state.currentUrl);
  if (subcommand === "title") {
    emit(page.title, json);
  } else if (subcommand === "url") {
    emit(state.currentUrl, json);
  } else if (subcommand === "text") {
    emit(page.text, json);
  } else {
    fail("Unsupported get command.");
  }
} else if (command === "eval") {
  await readStdin();
  const page = getPage(state.currentUrl);
  emit(
    {
      origin: state.currentUrl,
      result: JSON.stringify(page.domMetadata)
    },
    true
  );
} else if (command === "network" && rest[1] === "requests" && rest[2] === "--clear") {
  state.networkEnabled = true;
  state.requests = [];
  await saveState(session, state);
  emit({ cleared: true }, json);
} else if (command === "network" && rest[1] === "requests") {
  emit({ requests: state.requests || [] }, true);
} else if (command === "close") {
  emit({ closed: true }, json);
} else {
  fail("Unsupported command: " + rest.join(" "));
}
`;

  await fs.writeFile(scriptPath, script, { mode: 0o755 });
  return scriptPath;
}
