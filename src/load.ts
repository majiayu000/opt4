import { readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { Glob } from "bun";
import { validateApp, validateRecord, type App, type LoadedRecord, type RecordData } from "./schema";

export interface Dataset {
  apps: App[];
  records: LoadedRecord[];
  errors: string[]; // 每条形如 “文件: 原因”
}

export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function parseYaml(path: string): unknown {
  return Bun.YAML.parse(readFileSync(path, "utf8"));
}

export function loadDataset(root: string, opts: { today?: string } = {}): Dataset {
  const errors: string[] = [];
  const appsFile = join(root, "data", "apps.yaml");
  let rawApps: unknown;
  try {
    rawApps = parseYaml(appsFile);
  } catch (e) {
    return { apps: [], records: [], errors: [`data/apps.yaml: YAML 解析失败：${(e as Error).message}`] };
  }
  if (!Array.isArray(rawApps)) return { apps: [], records: [], errors: ["data/apps.yaml: 必须是列表"] };

  const apps: App[] = [];
  const seen = new Set<string>();
  rawApps.forEach((a, i) => {
    const errs = validateApp(a, i);
    errors.push(...errs);
    if (errs.length === 0) {
      const app = a as App;
      if (seen.has(app.id)) errors.push(`data/apps.yaml: id ${app.id} 重复`);
      seen.add(app.id);
      apps.push(app);
    }
  });

  const ctxBase = { root, appIds: seen, today: opts.today ?? today() };
  const records: LoadedRecord[] = [];
  const files = [...new Glob("data/records/**/*.{yaml,yml}").scanSync({ cwd: root })].sort();
  for (const file of files) {
    const rel = relative(root, join(root, file));
    let raw: unknown;
    try {
      raw = parseYaml(join(root, file));
    } catch (e) {
      errors.push(`${rel}: YAML 解析失败：${(e as Error).message}`);
      continue;
    }
    const errs = validateRecord(raw, { ...ctxBase, file: rel });
    if (errs.length) errors.push(...errs.map((m) => `${rel}: ${m}`));
    else records.push({ file: rel, data: raw as RecordData });
  }
  return { apps, records, errors };
}
