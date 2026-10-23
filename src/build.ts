// bun run build：把 data/ 生成静态站到 dist/。OPT4_EXAMPLES=1 时才渲染示例数据。
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { html, raw, type Raw } from "./html";
import { loadDataset } from "./load";
import { measuredRecords, rank, tierOf, TIER_LABEL, type Row, type Tier } from "./rank";
import type { App, DocumentedRecord, LoadedRecord, MeasuredRecord } from "./schema";

export interface SiteConfig {
  siteName: string;
  siteUrl: string;
  repoUrl: string;
  description: string;
}

interface Page {
  path: string; // 相对站点根目录，如 app/deepseek.html
  title: string;
  description: string;
  body: Raw;
}

const PLATFORM_LABEL: Record<string, string> = { ios: "iOS", android: "Android", harmonyos: "HarmonyOS", web: "网页版" };
const SCOPE_LABEL: Record<string, string> = { main: "对话内容", voice: "语音 / 音视频", other: "其他" };
const DEFAULT_LABEL: Record<string, string> = { on: "默认开启", off: "默认关闭", unknown: "默认状态未知" };
const DOC_OUTCOME_LABEL: Record<string, string> = {
  in_app_toggle: "App 内开关",
  contact_only: "需联系厂商",
  not_stated: "文档未写明关闭方式",
};
const STANDARD_QUOTE =
  "应为使用者提供关闭其输入信息用于训练的方式，例如为使用者提供选项或语音控制指令；关闭方式应便捷，例如采用选项方式时使用者从服务主界面开始到达该选项所需操作不超过 4 次点击。";

function prefix(path: string): string {
  return "../".repeat(path.split("/").length - 1);
}

function layout(page: Page, cfg: SiteConfig): string {
  const p = prefix(page.path);
  const url = `${cfg.siteUrl}/${page.path === "index.html" ? "" : page.path}`;
  const title = page.path === "index.html" ? page.title : `${page.title} · ${cfg.siteName}`;
  return `<!doctype html>${html`<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<meta name="description" content="${page.description}">
<link rel="canonical" href="${url}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${cfg.siteName}">
<meta property="og:locale" content="zh_CN">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${page.description}">
<meta property="og:url" content="${url}">
<meta name="twitter:card" content="summary">
<link rel="stylesheet" href="${p}style.css">
</head>
<body>
<header class="top"><div class="wrap">
<a class="brand" href="${p}index.html">${cfg.siteName}</a>
<nav><a href="${p}index.html">榜单</a><a href="${p}method.html">方法</a><a href="${p}changelog.html">更新记录</a><a href="${cfg.repoUrl}">GitHub</a></nav>
</div></header>
<main class="wrap">${page.body}</main>
<footer class="wrap foot">
<p>本站只记录可复现的事实（路径、点击数、版本、日期、截图）及其与 GB/T 45654—2025 示例的对照，不作法律判断，也不评价关闭后是否真的停止训练。GB/T 45654—2025 为推荐性国家标准。</p>
<p>数据以 <a href="${cfg.repoUrl}">GitHub 仓库</a> 为准，欢迎提交实测或更正。</p>
</footer>
</body>
</html>`}\n`;
}

function issueUrl(cfg: SiteConfig, template: string, title: string): string {
  return `${cfg.repoUrl}/issues/new?template=${template}&title=${encodeURIComponent(title)}`;
}

function docPath(r: DocumentedRecord): Raw {
  return html`<span class="path">${(r.doc_path ?? []).map((s, i) => html`${i ? raw(" → ") : ""}<b>${s}</b>`)}</span>`;
}

function mainDoc(app: App, records: LoadedRecord[]): DocumentedRecord | undefined {
  return records
    .map((r) => r.data)
    .filter((d): d is DocumentedRecord => d.source === "documented" && d.app === app.id && d.scope === "main")
    .sort((a, b) => b.retrieved_on.localeCompare(a.retrieved_on))[0];
}

function tierBadge(tier: Tier): Raw {
  return html`<span class="tier tier-${tier}">${TIER_LABEL[tier]}</span>`;
}

function indexPage(cfg: SiteConfig, rows: Row[], pending: App[], records: LoadedRecord[]): Page {
  const table = rows.length
    ? html`<table class="rank">
<thead><tr><th>App</th><th>平台</th><th>点击数</th><th>档位</th><th>版本 / 测试日期</th></tr></thead>
<tbody>${rows.map(
        (r) => html`<tr${r.record.source === "example" ? raw(' class="example"') : ""}>
<td><a href="app/${r.app.id}.html">${r.app.name}</a>${r.record.source === "example" ? html` <span class="badge ex">示例</span>` : ""}</td>
<td>${PLATFORM_LABEL[r.platform]}</td>
<td class="num">${r.record.clicks ?? "—"}</td>
<td>${tierBadge(r.tier)}${r.verified ? html` <span class="badge ok">已复核</span>` : ""}${r.conflict ? html` <span class="badge warn">结果不一致，待复核</span>` : ""}</td>
<td>${r.record.app_version} · ${r.record.tested_on}</td>
</tr>`,
      )}</tbody></table>`
    : html`<p class="notice">还没有实测数据。下面的“官方文档怎么说”只是厂商隐私政策里的写法，<b>未经实测</b>，也没有点击数。<a href="${issueUrl(cfg, "measurement.yml", "[实测] ")}">帮忙测一款 →</a></p>`;

  const pendingList = pending.length
    ? html`<h2>待实测</h2>
<table class="pending">
<thead><tr><th>App</th><th>官方文档怎么说（未实测）</th></tr></thead>
<tbody>${pending.map((app) => {
        const d = mainDoc(app, records);
        return html`<tr><td><a href="app/${app.id}.html">${app.name}</a></td><td>${
          d
            ? html`${DOC_OUTCOME_LABEL[d.outcome]}${d.outcome === "in_app_toggle" ? html`：${docPath(d)}` : ""}`
            : "暂无"
        }</td></tr>`;
      })}</tbody></table>`
    : "";

  return {
    path: "index.html",
    title: `${cfg.siteName}：国产 AI App 关闭“数据用于训练”要点几下`,
    description: cfg.description,
    body: html`<section class="hero">
<h1>${cfg.siteName}</h1>
<p class="lead">国产 AI App 里，从主界面出发要点几下，才能找到关闭“数据用于训练 / 改进”的选项？每一条都写明版本、日期和截图，照着点就能关。</p>
<blockquote class="std"><p>${STANDARD_QUOTE}</p><cite>GB/T 45654—2025 第 6.3 条 a)，推荐性国家标准。“4 次点击”是标准对“便捷”的举例。<a href="method.html">计数方法 →</a></cite></blockquote>
</section>
<h2>实测榜单</h2>
${table}
${pendingList}`,
  };
}

function measuredCard(cfg: SiteConfig, row: { record: MeasuredRecord; file: string; tier: Tier; verified?: boolean; conflict?: boolean }, p: string): Raw {
  const r = row.record;
  let n = 0;
  const steps = (r.steps ?? []).map((s) =>
    s.action === "tap"
      ? html`<li><span class="click">${++n}</span>点击 <b>${s.target}</b></li>`
      : html`<li><span class="click swipe">滑</span>滑动：${s.target}（不计数）</li>`,
  );
  return html`<article class="card${r.source === "example" ? " example" : ""}">
${r.source === "example" ? html`<p class="exbar">示例（虚构数据），不是任何真实 App 的实测结果</p>` : ""}
<header><h3>${PLATFORM_LABEL[r.platform]} · ${SCOPE_LABEL[r.scope]}</h3>${tierBadge(row.tier)}${row.verified ? html` <span class="badge ok">已复核</span>` : ""}${row.conflict ? html` <span class="badge warn">结果不一致，待复核</span>` : ""}</header>
${r.outcome === "in_app_toggle"
    ? html`<p class="big"><span class="num">${r.clicks}</span> 次点击到达 <b>“${r.option_label}”</b>（${DEFAULT_LABEL[r.default_state]}）</p>
<ol class="steps"><li><span class="click start">起</span>冷启动后的主界面</li>${steps}<li><span class="click end">关</span>关闭 <b>“${r.option_label}”</b>（这一下不计数）</li></ol>`
    : r.outcome === "contact_only"
      ? html`<p class="big">App 内未找到开关。App 内看到的渠道：${r.contact}</p>`
      : html`<p class="big">App 内未找到关闭方式。</p>`}
${r.screenshots?.length ? html`<div class="shots">${r.screenshots.map((s) => html`<a href="${p}${s.file}"><img src="${p}${s.file}" alt="截图" loading="lazy"></a>`)}</div>` : ""}
${r.note ? html`<p class="note">${r.note}</p>` : ""}
<p class="meta">版本 ${r.app_version} · ${r.os_version} · ${r.device} · ${r.tested_on} · 测试人 ${r.tester} · <a href="${cfg.repoUrl}/blob/main/${row.file}">原始记录</a></p>
</article>`;
}

function docCard(cfg: SiteConfig, rec: LoadedRecord & { data: DocumentedRecord }): Raw {
  const d = rec.data;
  return html`<article class="card doc">
<header><h3>${SCOPE_LABEL[d.scope]}</h3><span class="badge muted">文档声称 · 未实测</span></header>
<p>${DOC_OUTCOME_LABEL[d.outcome]}${d.outcome === "in_app_toggle" ? html`：${docPath(d)}` : ""}${d.contact ? html`：${d.contact}` : ""}</p>
<blockquote><p>${d.doc_quote}</p><cite><a href="${d.doc_url}">官方文档</a>，文档更新日期 ${d.doc_updated}，本站查阅于 ${d.retrieved_on}</cite></blockquote>
${d.note ? html`<p class="note">${d.note}</p>` : ""}
<p class="meta"><a href="${cfg.repoUrl}/blob/main/${rec.file}">原始记录</a></p>
</article>`;
}

function appPage(cfg: SiteConfig, app: App, rows: Row[], records: LoadedRecord[], includeExamples: boolean): Page {
  const path = `app/${app.id}.html`;
  const p = prefix(path);
  const mine = rows.filter((r) => r.app.id === app.id);
  const shown = new Set(mine.map((r) => r.file));
  const otherMeasured = measuredRecords(records, includeExamples).filter((r) => r.data.app === app.id && !shown.has(r.file));
  const docs = records.filter((r) => r.data.source === "documented" && r.data.app === app.id) as (LoadedRecord & { data: DocumentedRecord })[];
  const isExample = app.id.startsWith("example-");

  return {
    path,
    title: `${app.name} 怎么关闭数据用于训练`,
    description: `${app.name} 关闭“数据用于训练 / 改进”的路径卡：从主界面开始要点几下、开关叫什么、版本和截图，以及官方隐私政策原文。`,
    body: html`<h1>${app.name}：怎么关闭“数据用于训练 / 改进”</h1>
<p class="sub">${app.vendor}${isExample ? "" : html` · <a href="${app.policy_url}">官方隐私政策</a>`}</p>
<h2>实测路径卡</h2>
${mine.length ? mine.map((r) => measuredCard(cfg, r, p)) : html`<p class="notice">尚未实测。<a href="${issueUrl(cfg, "measurement.yml", `[实测] ${app.name}`)}">提交一条实测 →</a></p>`}
${otherMeasured.length ? html`<h2>其他实测记录</h2>${otherMeasured.map((r) => measuredCard(cfg, { record: r.data, file: r.file, tier: tierOf(r.data) }, p))}` : ""}
${docs.length ? html`<h2>官方文档怎么说（未实测）</h2><p class="hint">以下内容摘自厂商官方文档，本站没有实测，不计入榜单，也不给点击数。</p>${docs.map((d) => docCard(cfg, d))}` : ""}
<h2>更正</h2>
<ul class="fix">
<li>发现记录有误、App 已改版，或你是厂商代表：<a href="${issueUrl(cfg, "correction.yml", `[更正] ${app.name}`)}">在 GitHub 提交更正</a>，请附截图和版本号。</li>
${app.privacy_contact ? html`<li>向厂商行使个人信息权利（政策中公布的渠道）：${app.privacy_contact}</li>` : ""}
</ul>`,
  };
}

function methodPage(cfg: SiteConfig): Page {
  return {
    path: "method.html",
    title: "计数方法",
    description: "四步关训练如何计数：从冷启动主界面开始，每次点击计 1 次，到关闭选项出现在屏幕上为止；以及档位定义、标准原文和措辞规范。",
    body: html`<h1>计数方法</h1>
<h2>标准原文</h2>
<p>GB/T 45654—2025《网络安全技术 生成式人工智能服务安全基本要求》，2025-04-25 发布，2025-11-01 实施，推荐性国家标准。</p>
<blockquote class="std"><p>6.3 a) ${STANDARD_QUOTE}</p><p>6.3 b) 应将收集使用者输入信息用于训练的状态，以及 a）中的关闭方式显著告知使用者。</p><cite>正文第 5 页</cite></blockquote>
<blockquote class="std"><p>B.2.3.3.2 a) ……关闭方式便捷，例如采用选项方式时从服务主界面开始到达该选项所需的点击次数不超过 4 次。</p><cite>附录 B（资料性），第 19 页</cite></blockquote>
<h2>怎么数</h2>
<table>
<tr><th>起点</th><td>已登录的个人账号，杀掉进程后冷启动，关掉启动弹窗（不计数），停在 App 默认落地的那一屏</td></tr>
<tr><th>终点</th><td>关闭选项出现在屏幕上。拨动开关这一下不计，因为原文是“到达该选项所需操作”</td></tr>
<tr><th>计入</th><td>每一次单击或长按计 1 次，包括点头像、图标、菜单项、返回</td></tr>
<tr><th>不计</th><td>滚动、滑动、系统权限弹窗、登录、输入文字</td></tr>
<tr><th>只能滑动</th><td>某一步只能靠滑动打开时，记为“滑动”步骤，不计数，并在备注说明</td></tr>
<tr><th>最短路径</th><td>记录找到的最短点击路径，不使用 App 内搜索</td></tr>
<tr><th>平台与版本</th><td>iOS、Android、HarmonyOS 分开记录，只测手机。每条带 App 版本、系统版本、机型和日期；同一平台以最新一条为准</td></tr>
<tr><th>复核</th><td>另一位测试人在同一版本得到相同点击数，标“已复核”；结果不同则两条都保留，标“结果不一致，待复核”</td></tr>
<tr><th>多个开关</th><td>对话内容、语音 / 音视频分开记录，榜单只看对话内容</td></tr>
</table>
<h2>档位</h2>
<table>
<tr><th>${TIER_LABEL.A}</th><td>有 App 内选项，点击数 ≤ 4</td></tr>
<tr><th>${TIER_LABEL.B}</th><td>有 App 内选项，点击数 &gt; 4</td></tr>
<tr><th>${TIER_LABEL.C}</th><td>App 内没找到选项，只有邮件、客服等渠道</td></tr>
<tr><th>${TIER_LABEL.D}</th><td>App 内没找到选项，也没看到渠道</td></tr>
<tr><th>待实测</th><td>只有官方文档的写法，或者没有任何记录</td></tr>
</table>
<h2>实测与文档声称</h2>
<p>“实测”是有人在真机上按上面的口径点出来的，带截图和截图哈希。“文档声称”是厂商隐私政策或帮助文档里写的路径，原文照录，不带点击数，因为文档通常从“设置”写起，看不出从主界面要点几下。两类数据分开存放、分开展示，榜单只用实测。</p>
<h2>我们不做的判断</h2>
<ul>
<li>不作法律判断。GB/T 45654—2025 是推荐性国家标准，“4 次点击”是其中对“便捷”的举例。</li>
<li>不评价关闭后是否真的停止训练，这无法从外部验证。</li>
<li>不引用无法复现的二手结论。</li>
</ul>
<h2>贡献与更正</h2>
<p>实测流程、截图要求和 PR 模板见 <a href="${cfg.repoUrl}#贡献实测数据">仓库 README</a>。发现错误请 <a href="${issueUrl(cfg, "correction.yml", "[更正] ")}">提交更正</a>。</p>`,
  };
}

function changelogPage(records: LoadedRecord[], apps: App[]): Page {
  const name = (id: string) => apps.find((a) => a.id === id)?.name ?? id;
  const items = records
    .map((r) => {
      const d = r.data;
      const date = d.source === "documented" ? d.retrieved_on : d.tested_on;
      const what =
        d.source === "documented"
          ? `录入官方文档声称路径（${SCOPE_LABEL[d.scope]}）`
          : `${d.source === "example" ? "示例数据" : "实测"}：${PLATFORM_LABEL[d.platform]} ${d.app_version}（${SCOPE_LABEL[d.scope]}）`;
      return { date, app: d.app, what };
    })
    .sort((a, b) => b.date.localeCompare(a.date) || a.app.localeCompare(b.app));
  return {
    path: "changelog.html",
    title: "更新记录",
    description: "四步关训练的数据更新记录：每条实测和文档声称记录的录入日期。",
    body: html`<h1>更新记录</h1>
<table><thead><tr><th>日期</th><th>App</th><th>内容</th></tr></thead><tbody>${items.map(
      (i) => html`<tr><td>${i.date}</td><td><a href="app/${i.app}.html">${name(i.app)}</a></td><td>${i.what}</td></tr>`,
    )}</tbody></table>`,
  };
}

export function build(opts: { root: string; outDir: string; includeExamples?: boolean; config?: SiteConfig }): string[] {
  const { root, outDir } = opts;
  const includeExamples = opts.includeExamples ?? false;
  const cfg: SiteConfig = opts.config ?? JSON.parse(readFileSync(join(root, "site.config.json"), "utf8"));
  const ds = loadDataset(root);
  if (ds.errors.length) throw new Error(`数据校验失败：\n${ds.errors.join("\n")}`);
  const records = includeExamples ? ds.records : ds.records.filter((r) => r.data.source !== "example");
  const { rows, pending, apps } = rank(ds.apps, records, includeExamples);

  const pages: Page[] = [
    indexPage(cfg, rows, pending, records),
    ...apps.map((a) => appPage(cfg, a, rows, records, includeExamples)),
    methodPage(cfg),
    changelogPage(records, apps),
  ];

  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  for (const page of pages) {
    const file = join(outDir, page.path);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, layout(page, cfg));
  }
  copyFileSync(join(root, "src", "style.css"), join(outDir, "style.css"));
  for (const r of measuredRecords(records, includeExamples)) {
    for (const s of r.data.screenshots ?? []) {
      mkdirSync(dirname(join(outDir, s.file)), { recursive: true });
      copyFileSync(join(root, s.file), join(outDir, s.file));
    }
  }

  const urls = pages.map((p) => `${cfg.siteUrl}/${p.path === "index.html" ? "" : p.path}`);
  writeFileSync(
    join(outDir, "sitemap.xml"),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls
      .map((u) => `  <url><loc>${u}</loc></url>`)
      .join("\n")}\n</urlset>\n`,
  );
  writeFileSync(join(outDir, "robots.txt"), `User-agent: *\nAllow: /\nSitemap: ${cfg.siteUrl}/sitemap.xml\n`);
  return pages.map((p) => p.path);
}

if (import.meta.main) {
  const root = process.cwd();
  const pages = build({ root, outDir: join(root, "dist"), includeExamples: process.env.OPT4_EXAMPLES === "1" });
  console.log(`✓ 生成 ${pages.length} 个页面到 dist/`);
}
