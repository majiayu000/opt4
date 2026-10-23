// bun run serve：本地预览 dist/。
import { existsSync, statSync } from "node:fs";
import { join, normalize } from "node:path";

const dist = join(process.cwd(), "dist");
const port = Number(process.env.PORT ?? 4173);

Bun.serve({
  port,
  fetch(req) {
    let path = normalize(decodeURIComponent(new URL(req.url).pathname));
    if (path.endsWith("/")) path += "index.html";
    const file = join(dist, path);
    if (!file.startsWith(dist) || !existsSync(file) || !statSync(file).isFile()) {
      return new Response("Not found", { status: 404 });
    }
    return new Response(Bun.file(file));
  },
});
console.log(`http://localhost:${port}/`);
