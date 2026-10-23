import { describe, expect, test } from "bun:test";
import { rank, tierOf } from "../src/rank";
import type { App, LoadedRecord, MeasuredRecord } from "../src/schema";
import { documented, measured } from "./helpers";

const apps: App[] = [
  { id: "alpha", name: "甲", vendor: "甲公司", policy_url: "https://example.com/a" },
  { id: "beta", name: "乙", vendor: "乙公司", policy_url: "https://example.com/b" },
];
const rec = (over: Record<string, unknown>, file = `f${Math.random()}`): LoadedRecord => ({
  file,
  data: measured(over) as unknown as MeasuredRecord,
});

describe("档位", () => {
  test("A/B/C/D", () => {
    const m = (o: Record<string, unknown>) => measured(o) as unknown as MeasuredRecord;
    expect(tierOf(m({ clicks: 4 }))).toBe("A");
    expect(tierOf(m({ clicks: 5 }))).toBe("B");
    expect(tierOf(m({ outcome: "contact_only" }))).toBe("C");
    expect(tierOf(m({ outcome: "none_found" }))).toBe("D");
  });

  test("只有文档声称记录的 App 进入待实测，不进榜单", () => {
    const { rows, pending } = rank(apps, [{ file: "d", data: documented() as never }, rec({ app: "beta", clicks: 2 })]);
    expect(rows.map((r) => r.app.id)).toEqual(["beta"]);
    expect(pending.map((a) => a.id)).toEqual(["alpha"]);
  });

  test("同一平台取最新一条，语音开关和网页版不进榜单", () => {
    const { rows } = rank(apps, [
      rec({ tested_on: "2026-10-01", clicks: 6 }),
      rec({ tested_on: "2026-10-20", clicks: 3 }),
      rec({ tested_on: "2026-10-22", clicks: 1, scope: "voice" }),
      rec({ tested_on: "2026-10-22", clicks: 1, platform: "web" }),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.record.clicks).toBe(3);
  });

  test("同版本另一测试人结果相同标已复核，不同标待复核", () => {
    const same = rank(apps, [rec({ tester: "a", tested_on: "2026-10-20" }), rec({ tester: "b", tested_on: "2026-10-21" })]);
    expect(same.rows[0]!.verified).toBe(true);
    expect(same.rows[0]!.conflict).toBe(false);
    const diff = rank(apps, [
      rec({ tester: "a", tested_on: "2026-10-20" }),
      rec({ tester: "b", tested_on: "2026-10-21", clicks: 1, steps: [{ action: "tap", target: "设置" }] }),
    ]);
    expect(diff.rows[0]!.conflict).toBe(true);
  });

  test("示例记录默认不参与", () => {
    const ex = rec({ app: "example-x", source: "example" });
    expect(rank(apps, [ex]).rows).toHaveLength(0);
    expect(rank(apps, [ex], true).rows).toHaveLength(1);
  });
});
