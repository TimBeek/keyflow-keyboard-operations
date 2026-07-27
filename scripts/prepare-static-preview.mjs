import { access, cp, mkdir, rm } from "node:fs/promises";
import path from "node:path";

const appDirectory = process.cwd();
const outputDirectory = path.join(appDirectory, "dist");
const nextDirectory = path.join(appDirectory, ".next");

if (path.basename(outputDirectory) !== "dist" || path.dirname(outputDirectory) !== appDirectory) {
  throw new Error("Ongeldige preview-outputmap.");
}

await access(path.join(nextDirectory, "server", "app", "index.html"));
await rm(outputDirectory, { recursive: true, force: true });
await mkdir(path.join(outputDirectory, "_next"), { recursive: true });

await cp(
  path.join(nextDirectory, "server", "app", "index.html"),
  path.join(outputDirectory, "index.html"),
);
await cp(
  path.join(nextDirectory, "server", "app", "_not-found.html"),
  path.join(outputDirectory, "404.html"),
);
await cp(
  path.join(nextDirectory, "server", "app", "favicon.ico.body"),
  path.join(outputDirectory, "favicon.ico"),
);
await cp(
  path.join(nextDirectory, "static"),
  path.join(outputDirectory, "_next", "static"),
  { recursive: true },
);
await cp(
  path.join(appDirectory, "public"),
  outputDirectory,
  { recursive: true },
);

console.log("Statische Sites-preview voorbereid in dist/.");
