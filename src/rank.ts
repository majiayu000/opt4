// 档位计算。只用实测记录（以及显式开启时的示例记录），见 docs/design.md 第 4 节。
import type { App, LoadedRecord, MeasuredRecord, Platform } from "./schema";

export type Tier = "A" | "B" | "C" | "D";

export const TIER_LABEL: Record<Tier, string> = {
  A: "4 次以内可到达",
  B: "超过 4 次",
  C: "App 内未找到开关，需联系厂商",
  D: "未找到关闭方式",
};

export const RANKED_PLATFORMS: Platform[] = ["ios", "android", "harmonyos"];

export interface Row {
  app: App;
  platform: Platform;
  record: MeasuredRecord;
  file: string;
  tier: Tier;
  verified: boolean; // 另一位测试人在同一版本得到相同结果
  conflict: boolean; // 同一版本有人测出不同结果
}

export function tierOf(r: MeasuredRecord): Tier {
  if (r.outcome === "in_app_toggle") return (r.clicks ?? Infinity) <= 4 ? "A" : "B";
  return r.outcome === "contact_only" ? "C" : "D";
}

function sameResult(a: MeasuredRecord, b: MeasuredRecord): boolean {
  return a.outcome === b.outcome && a.clicks === b.clicks;
}

export function measuredRecords(records: LoadedRecord[], includeExamples: boolean) {
  return records.filter(
    (r) => r.data.source === "measured" || (includeExamples && r.data.source === "example"),
  ) as (LoadedRecord & { data: MeasuredRecord })[];
}

export function rank(apps: App[], records: LoadedRecord[], includeExamples = false) {
  const measured = measuredRecords(records, includeExamples).filter((r) => r.data.scope === "main");
  const rows: Row[] = [];
  const allApps = [...apps];
  for (const r of measured) {
    if (!allApps.some((a) => a.id === r.data.app)) {
      // 示例 App 不在名单里，用记录本身生成一个占位
      allApps.push({ id: r.data.app, name: `示例 App（${r.data.app}）`, vendor: "虚构", policy_url: "https://example.invalid/" });
    }
  }

  for (const app of allApps) {
    for (const platform of RANKED_PLATFORMS) {
      const group = measured.filter((r) => r.data.app === app.id && r.data.platform === platform);
      if (group.length === 0) continue;
      const latest = group.reduce((a, b) => (b.data.tested_on > a.data.tested_on ? b : a));
      const peers = group.filter(
        (r) => r !== latest && r.data.app_version === latest.data.app_version && r.data.tester !== latest.data.tester,
      );
      rows.push({
        app,
        platform,
        record: latest.data,
        file: latest.file,
        tier: tierOf(latest.data),
        verified: peers.some((p) => sameResult(p.data, latest.data)),
        conflict: peers.some((p) => !sameResult(p.data, latest.data)),
      });
    }
  }

  rows.sort(
    (a, b) =>
      a.tier.localeCompare(b.tier) ||
      (a.record.clicks ?? 0) - (b.record.clicks ?? 0) ||
      a.app.name.localeCompare(b.app.name, "zh") ||
      a.platform.localeCompare(b.platform),
  );
  const rankedIds = new Set(rows.map((r) => r.app.id));
  const pending = apps.filter((a) => !rankedIds.has(a.id));
  return { rows, pending, apps: allApps };
}
