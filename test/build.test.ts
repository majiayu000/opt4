import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Glob } from "bun";
import { build } from "../src/build";
import { loadDataset } from "../src/load";

const root = join(import.meta.dir, "..");
const BANNED = ["违法", "违规", "不合规", "违反", "不符合"];

function buildTo(includeExamples: boolean) {
  const out = mkdtempSync(join(tmpdir(), "opt4-dist-"));
  const pages = build({ root, outDir: out, includeExamples });
  const read = (p: string) => readFileSync(join(out, p), "utf8");
  return { out, pages, read };
}

describe("仓库里的真实数据", () => {
  test("全部通过校验", () => {
    expect(loadDataset(root).errors).toEqual([]);
  });

  test("目前没有实测记录，所有真实 App 都是待实测", () => {
    const { records } = loadDataset(root);
    expect(records.filter((r) => r.data.source === "measured")).toHaveLength(0);
  });
});

describe("站点", () => {
  const { out, pages, read } = buildTo(false);

  test("生成榜单、方法、更新记录和每个 App 的路径卡", () => {
    const { apps } = loadDataset(root);
    expect(pages).toContain("index.html");
    expect(pages).toContain("method.html");
    expect(pages).toContain("changelog.html");
    for (const a of apps) expect(pages).toContain(`app/${a.id}.html`);
  });

  test("每页都有 title、description 和 OG 标签", () => {
    for (const p of pages) {
      const h = read(p);
      expect(h).toMatch(/<title>[^<]+<\/title>/);
      for (const tag of ['name="description"', 'property="og:title"', 'property="og:description"', 'property="og:url"', 'rel="canonical"']) {
        expect(h).toContain(tag);
      }
    }
  });

  test("sitemap 列出所有页面，robots 指向 sitemap", () => {
    const cfg = JSON.parse(readFileSync(join(root, "site.config.json"), "utf8"));
    const sitemap = read("sitemap.xml");
    for (const p of pages) expect(sitemap).toContain(`${cfg.siteUrl}/${p === "index.html" ? "" : p}<`);
    expect(read("robots.txt")).toContain(`${cfg.siteUrl}/sitemap.xml`);
  });

  test("输出中不出现法律定性用语", () => {
    const files = [...new Glob("**/*.html").scanSync({ cwd: out })];
    for (const f of files) {
      const h = read(f);
      for (const w of BANNED) expect(h.includes(w), `${f} 含有“${w}”`).toBe(false);
    }
  });

  test("文档声称路径只出现在未实测栏，没有点击数", () => {
    const h = read("app/deepseek.html");
    expect(h).toContain("官方文档怎么说（未实测）");
    expect(h).toContain("文档声称 · 未实测");
    expect(h).toContain("尚未实测");
    expect(h).not.toContain("次点击到达");
    expect(read("index.html")).toContain("还没有实测数据");
    expect(read("index.html")).not.toContain('<table class="rank">');
  });

  test("每个 App 页都有更正渠道", () => {
    const { apps } = loadDataset(root);
    for (const a of apps) expect(read(`app/${a.id}.html`)).toContain("issues/new?template=correction.yml");
  });

  test("正式构建不包含示例数据", () => {
    expect(pages.some((p) => p.includes("example-"))).toBe(false);
    expect(read("index.html")).not.toContain("example-demo");
    expect(read("index.html")).not.toContain("badge ex");
  });
});

describe("开启示例数据时", () => {
  const { pages, read } = buildTo(true);
  test("示例卡片明确标为虚构", () => {
    expect(pages).toContain("app/example-demo.html");
    expect(read("app/example-demo.html")).toContain("示例（虚构数据）");
    expect(read("index.html")).toContain("badge ex");
  });
});
