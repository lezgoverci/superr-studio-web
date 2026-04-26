import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const FIXTURE_ROOT = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "fixtures/site"
);

const ROUTE_MAP = new Map([
  ["/", "index.html"],
  ["/collections/widgets", "collections/widgets.html"],
  ["/products/widget-one", "products/widget-one.html"],
  ["/products/widget-two", "products/widget-two.html"],
  ["/products/widget-one.js", "products/widget-one.js.json"],
  ["/products/widget-two.js", "products/widget-two.js.json"],
]);

function getContentType(pathname) {
  if (pathname.endsWith(".js")) {
    return "application/json; charset=utf-8";
  }
  return "text/html; charset=utf-8";
}

export async function startFixtureServer() {
  const server = http.createServer(async (request, response) => {
    const url = new URL(request.url || "/", "http://127.0.0.1");
    const relativePath = ROUTE_MAP.get(url.pathname);

    if (!relativePath) {
      response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      response.end("Not found");
      return;
    }

    const absolutePath = path.join(FIXTURE_ROOT, relativePath);
    const body = await fs.readFile(absolutePath);
    response.writeHead(200, {
      "content-type": getContentType(url.pathname),
      "cache-control": "no-store",
    });
    response.end(body);
  });

  await new Promise((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Failed to determine fixture server address.");
  }

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: async () =>
      await new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      }),
  };
}
