import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

export const TODAY = "2026-10-23";

export const APPS_YAML = `
- id: alpha
  name: 甲
  vendor: 甲公司
  policy_url: https://example.com/alpha
- id: beta
  name: 乙
  vendor: 乙公司
  policy_url: https://example.com/beta
`;

export const PNG = Buffer.from("fake-png-bytes");
export const PNG_SHA = new Bun.CryptoHasher("sha256").update(PNG).digest("hex");

export function measured(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    app: "alpha",
    source: "measured",
    scope: "main",
    platform: "ios",
    app_version: "1.2.3",
    os_version: "iOS 18.6",
    device: "iPhone 15",
    tested_on: "2026-10-20",
    tester: "someone",
    default_state: "on",
    option_label: "数据用于优化",
    outcome: "in_app_toggle",
    steps: [
      { action: "tap", target: "头像" },
      { action: "swipe", target: "下滑" },
      { action: "tap", target: "设置" },
    ],
    clicks: 2,
    screenshots: [{ file: "evidence/alpha/1.png", sha256: PNG_SHA }],
    ...over,
  };
}

export function documented(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    app: "alpha",
    source: "documented",
    scope: "main",
    option_label: "数据用于优化",
    outcome: "in_app_toggle",
    doc_url: "https://example.com/alpha",
    doc_quote: "原文一句。",
    doc_updated: "2026-01-01",
    retrieved_on: "2026-10-23",
    doc_path: ["设置", "数据管理"],
    ...over,
  };
}

/** 建一个临时仓库：files 的键是相对路径，值是对象（写成 YAML/JSON）或字符串。 */
export function makeRepo(files: Record<string, unknown>): string {
  const root = mkdtempSync(join(tmpdir(), "opt4-"));
  const all: Record<string, unknown> = { "data/apps.yaml": APPS_YAML, ...files };
  for (const [rel, content] of Object.entries(all)) {
    const abs = join(root, rel);
    mkdirSync(dirname(abs), { recursive: true });
    // JSON 是 YAML 的子集，对象直接写 JSON
    writeFileSync(abs, typeof content === "string" || Buffer.isBuffer(content) ? content : JSON.stringify(content));
  }
  mkdirSync(join(root, "evidence", "alpha"), { recursive: true });
  writeFileSync(join(root, "evidence", "alpha", "1.png"), PNG);
  return root;
}
