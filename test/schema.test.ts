import { describe, expect, test } from "bun:test";
import { loadDataset } from "../src/load";
import { documented, makeRepo, measured, TODAY } from "./helpers";

function errorsFor(file: string, record: Record<string, unknown>) {
  return loadDataset(makeRepo({ [file]: record }), { today: TODAY }).errors;
}

const M = "data/records/alpha/ios-measured-2026-10-20.yaml";
const D = "data/records/alpha/doc-documented-2026-10-23.yaml";

describe("实测记录", () => {
  test("合法记录通过", () => {
    expect(errorsFor(M, measured())).toEqual([]);
  });

  test("clicks 必须等于 tap 步骤数，滑动不计", () => {
    const errs = errorsFor(M, measured({ clicks: 3 }));
    expect(errs.join()).toContain("clicks 为 3，但 steps 里有 2 个 tap");
  });

  test("缺少版本、平台、测试人时失败", () => {
    const r = measured();
    delete r.app_version;
    delete r.tester;
    r.platform = "ipad";
    const errs = errorsFor(M, r).join("\n");
    expect(errs).toContain("缺少 app_version");
    expect(errs).toContain("tester 必须是 GitHub 用户名");
    expect(errs).toContain("platform 必须是");
  });

  test("版本号被 YAML 解析成数字时提示加引号", () => {
    const repo = makeRepo({});
    const { writeFileSync } = require("node:fs");
    const { join } = require("node:path");
    const yaml = Object.entries(measured())
      .filter(([k]) => k !== "app_version")
      .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
      .join("\n");
    require("node:fs").mkdirSync(join(repo, "data/records/alpha"), { recursive: true });
    writeFileSync(join(repo, M), `${yaml}\napp_version: 1.10\n`);
    expect(loadDataset(repo, { today: TODAY }).errors.join()).toContain("解析成了数字");
  });

  test("没有截图时失败", () => {
    expect(errorsFor(M, measured({ screenshots: [] })).join()).toContain("至少要有 1 张截图");
  });

  test("截图哈希不一致时失败", () => {
    const errs = errorsFor(M, measured({ screenshots: [{ file: "evidence/alpha/1.png", sha256: "0".repeat(64) }] }));
    expect(errs.join()).toContain("sha256 与记录不一致");
  });

  test("截图不存在或不在本 App 目录时失败", () => {
    expect(errorsFor(M, measured({ screenshots: [{ file: "evidence/alpha/x.png", sha256: "0".repeat(64) }] })).join()).toContain("不存在");
    expect(errorsFor(M, measured({ screenshots: [{ file: "evidence/beta/1.png", sha256: "0".repeat(64) }] })).join()).toContain("必须是 evidence/alpha/");
  });

  test("测试日期不能晚于今天", () => {
    expect(errorsFor(M, measured({ tested_on: "2026-12-01" })).join()).toContain("晚于今天");
  });

  test("contact_only 必须写渠道，且不能带 clicks", () => {
    const r = measured({ outcome: "contact_only" });
    const errs = errorsFor(M, r).join("\n");
    expect(errs).toContain("必须填写 contact");
    expect(errs).toContain("只有 in_app_toggle 记录才填写 steps 和 clicks");
  });

  test("未知字段失败", () => {
    expect(errorsFor(M, measured({ clickz: 2 })).join()).toContain("未知字段 clickz");
  });

  test("app 必须在名单里，且放在对应目录", () => {
    expect(errorsFor(M, measured({ app: "nope" })).join()).toContain("不在 data/apps.yaml 里");
    expect(errorsFor(M, measured({ app: "beta" })).join()).toContain("应放在 data/records/beta/");
  });
});

describe("文档声称记录", () => {
  test("合法记录通过", () => {
    expect(errorsFor(D, documented())).toEqual([]);
  });

  test("in_app_toggle 必须有 doc_path", () => {
    const r = documented();
    delete r.doc_path;
    expect(errorsFor(D, r).join()).toContain("必须有 doc_path");
  });

  test("doc_url 必须是 https", () => {
    expect(errorsFor(D, documented({ doc_url: "http://example.com" })).join()).toContain("doc_url 必须是 https");
  });
});

describe("实测与文档声称不得混用", () => {
  test("文档声称记录不能带点击数、步骤、截图或测试人", () => {
    const errs = errorsFor(
      D,
      documented({ clicks: 3, steps: [{ action: "tap", target: "设置" }], screenshots: [], tester: "x", default_state: "on" }),
    ).join("\n");
    for (const key of ["clicks", "steps", "screenshots", "tester", "default_state"]) {
      expect(errs).toContain(`documented 记录不得包含 ${key}`);
    }
  });

  test("实测记录不能带文档字段", () => {
    const errs = errorsFor(M, measured({ doc_url: "https://example.com", doc_quote: "x", doc_path: ["设置"] })).join("\n");
    for (const key of ["doc_url", "doc_quote", "doc_path"]) {
      expect(errs).toContain(`measured 记录不得包含 ${key}`);
    }
  });

  test("文件名的来源标记必须和 source 一致", () => {
    expect(errorsFor("data/records/alpha/ios-measured-2026-10-20.yaml", documented()).join()).toContain("必须包含 -documented-");
    expect(errorsFor("data/records/alpha/doc-documented-2026-10-23.yaml", measured()).join()).toContain("必须包含 -measured-");
    expect(errorsFor("data/records/alpha/ios-2026-10-20.yaml", measured()).join()).toContain("必须包含 -measured-");
  });

  test("示例数据只能用于 example- 虚构 App，真实 App 不能用 example", () => {
    expect(errorsFor("data/records/alpha/ios-example-2026-10-20.yaml", measured({ source: "example" })).join()).toContain(
      "example 记录的 app 必须以 example- 开头",
    );
    expect(
      errorsFor("data/records/example-x/ios-measured-2026-10-20.yaml", measured({ app: "example-x" })).join(),
    ).toContain("只能用 source: example");
  });
});
