import { access, cp, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const appDirectory = process.cwd();
const outputDirectory = path.join(appDirectory, "dist");
const nextDirectory = path.join(appDirectory, ".next");

if (path.basename(outputDirectory) !== "dist" || path.dirname(outputDirectory) !== appDirectory) {
  throw new Error("Ongeldige preview-outputmap.");
}

await access(path.join(nextDirectory, "server", "app", "index.html"));
await rm(outputDirectory, { recursive: true, force: true });
await mkdir(path.join(outputDirectory, "assets", "_next"), { recursive: true });
await mkdir(path.join(outputDirectory, "server"), { recursive: true });
await mkdir(path.join(outputDirectory, ".openai"), { recursive: true });

await cp(
  path.join(nextDirectory, "server", "app", "index.html"),
  path.join(outputDirectory, "assets", "index.html"),
);
await cp(
  path.join(nextDirectory, "server", "app", "_not-found.html"),
  path.join(outputDirectory, "assets", "404.html"),
);
await cp(
  path.join(nextDirectory, "server", "app", "favicon.ico.body"),
  path.join(outputDirectory, "assets", "favicon.ico"),
);
await cp(
  path.join(nextDirectory, "static"),
  path.join(outputDirectory, "assets", "_next", "static"),
  { recursive: true },
);
await cp(
  path.join(appDirectory, "public"),
  path.join(outputDirectory, "assets"),
  { recursive: true },
);
await cp(
  path.join(appDirectory, ".openai", "hosting.json"),
  path.join(outputDirectory, ".openai", "hosting.json"),
);
await writeFile(
  path.join(outputDirectory, "server", "index.js"),
  `export default {
  async fetch(request, env) {
    const response = await env.ASSETS.fetch(request);
    if (response.status !== 404 || request.method !== "GET") return response;
    const fallbackUrl = new URL("/index.html", request.url);
    return env.ASSETS.fetch(new Request(fallbackUrl, request));
  },
};
`,
  "utf8",
);

console.log("Statische Sites-preview voorbereid in dist/.");
