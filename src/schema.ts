// 记录校验。规则见 docs/design.md 第 2、3 节。
import { existsSync, readFileSync } from "node:fs";
import { basename, join, normalize } from "node:path";

export type Source = "measured" | "documented" | "example";
export type Platform = "ios" | "android" | "harmonyos" | "web";
export type Scope = "main" | "voice" | "other";

export interface App {
  id: string;
  name: string;
  vendor: string;
  policy_url: string;
  privacy_contact?: string;
}

export interface Step {
  action: "tap" | "swipe";
  target: string;
}

export interface Screenshot {
  file: string;
  sha256: string;
}

interface Base {
  app: string;
  scope: Scope;
  option_label: string;
  note?: string;
  contact?: string;
}

export interface MeasuredRecord extends Base {
  source: "measured" | "example";
  outcome: "in_app_toggle" | "contact_only" | "none_found";
  platform: Platform;
  app_version: string;
  os_version: string;
  device: string;
  tested_on: string;
  tester: string;
  default_state: "on" | "off" | "unknown";
  steps?: Step[];
  clicks?: number;
  screenshots: Screenshot[];
}

export interface DocumentedRecord extends Base {
  source: "documented";
  outcome: "in_app_toggle" | "contact_only" | "not_stated";
  doc_url: string;
  doc_quote: string;
  doc_updated: string;
  retrieved_on: string;
  doc_path?: string[];
}

export type RecordData = MeasuredRecord | DocumentedRecord;

export interface LoadedRecord {
  file: string; // 相对仓库根目录
  data: RecordData;
}

const SOURCES = ["measured", "documented", "example"];
const SCOPES = ["main", "voice", "other"];
const PLATFORMS = ["ios", "android", "harmonyos", "web"];
const MEASURED_OUTCOMES = ["in_app_toggle", "contact_only", "none_found"];
const DOC_OUTCOMES = ["in_app_toggle", "contact_only", "not_stated"];
const DEFAULT_STATES = ["on", "off", "unknown"];

const COMMON_KEYS = ["app", "source", "scope", "option_label", "outcome", "note", "contact"];
const MEASURED_KEYS = [
  "platform",
  "app_version",
  "os_version",
  "device",
  "tested_on",
  "tester",
  "default_state",
  "steps",
  "clicks",
  "screenshots",
];
const DOC_KEYS = ["doc_url", "doc_quote", "doc_updated", "retrieved_on", "doc_path"];

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const GITHUB_USER_RE = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
const SHA256_RE = /^[0-9a-f]{64}$/;

export interface Context {
  root: string; // 仓库根目录，用于检查截图
  file: string; // 记录文件相对路径
  appIds: Set<string>;
  today: string; // YYYY-MM-DD，日期不得晚于这一天
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function checkDate(errors: string[], key: string, v: unknown, today: string) {
  if (typeof v !== "string" || !DATE_RE.test(v) || Number.isNaN(Date.parse(v))) {
    errors.push(`${key} 必须是 YYYY-MM-DD 日期（字符串）`);
  } else if (v > today) {
    errors.push(`${key} ${v} 晚于今天 ${today}`);
  }
}

function requireString(errors: string[], obj: Record<string, unknown>, key: string) {
  const v = obj[key];
  if (typeof v === "number") {
    errors.push(`${key} 被 YAML 解析成了数字 ${v}，请加引号`);
  } else if (!isNonEmptyString(v)) {
    errors.push(`缺少 ${key}`);
  }
}

export function sha256File(path: string): string {
  return new Bun.CryptoHasher("sha256").update(readFileSync(path)).digest("hex");
}

export function validateApp(raw: unknown, index: number): string[] {
  const errors: string[] = [];
  const where = `apps.yaml 第 ${index + 1} 项`;
  if (!raw || typeof raw !== "object") return [`${where}: 不是对象`];
  const a = raw as Record<string, unknown>;
  for (const key of ["id", "name", "vendor", "policy_url"]) {
    if (!isNonEmptyString(a[key])) errors.push(`${where}: 缺少 ${key}`);
  }
  if (isNonEmptyString(a.id) && !/^[a-z0-9-]+$/.test(a.id)) errors.push(`${where}: id 只能用小写字母、数字和 -`);
  if (isNonEmptyString(a.policy_url) && !a.policy_url.startsWith("https://")) {
    errors.push(`${where}: policy_url 必须是 https 链接`);
  }
  return errors;
}

export function validateRecord(raw: unknown, ctx: Context): string[] {
  const errors: string[] = [];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return ["记录必须是 YAML 对象"];
  const r = raw as Record<string, unknown>;
  const source = r.source;

  if (typeof source !== "string" || !SOURCES.includes(source)) {
    return [`source 必须是 ${SOURCES.join(" / ")}`];
  }

  // 文件名里的来源标记必须和内容一致，避免把文档路径放进实测文件
  const name = basename(ctx.file);
  const tokens = SOURCES.filter((s) => name.includes(`-${s}-`));
  if (tokens.length !== 1 || tokens[0] !== source) {
    errors.push(`文件名 ${name} 必须包含 -${source}-，且不能包含其他来源标记`);
  }

  const isMeasured = source === "measured" || source === "example";
  const allowed = new Set([...COMMON_KEYS, ...(isMeasured ? MEASURED_KEYS : DOC_KEYS)]);
  const forbidden = isMeasured ? DOC_KEYS : MEASURED_KEYS;
  for (const key of Object.keys(r)) {
    if (forbidden.includes(key)) {
      errors.push(`${source} 记录不得包含 ${key}（实测与文档声称不得混用）`);
    } else if (!allowed.has(key)) {
      errors.push(`未知字段 ${key}`);
    }
  }

  if (!isNonEmptyString(r.app) || !ctx.appIds.has(r.app)) {
    if (!(source === "example" && isNonEmptyString(r.app))) errors.push(`app ${String(r.app)} 不在 data/apps.yaml 里`);
  }
  if (isNonEmptyString(r.app)) {
    const exampleApp = r.app.startsWith("example-");
    if (source === "example" && !exampleApp) errors.push("example 记录的 app 必须以 example- 开头");
    if (source !== "example" && exampleApp) errors.push("example- 开头的虚构 App 只能用 source: example");
    if (!ctx.file.split("/").includes(r.app)) errors.push(`记录应放在 data/records/${r.app}/ 下`);
  }

  if (typeof r.scope !== "string" || !SCOPES.includes(r.scope)) errors.push(`scope 必须是 ${SCOPES.join(" / ")}`);
  requireString(errors, r, "option_label");
  if (r.note !== undefined && !isNonEmptyString(r.note)) errors.push("note 必须是非空字符串");

  const outcomes = isMeasured ? MEASURED_OUTCOMES : DOC_OUTCOMES;
  if (typeof r.outcome !== "string" || !outcomes.includes(r.outcome)) {
    errors.push(`${source} 记录的 outcome 必须是 ${outcomes.join(" / ")}`);
  }
  if (r.outcome === "contact_only") {
    if (!isNonEmptyString(r.contact)) errors.push("outcome 为 contact_only 时必须填写 contact");
  } else if (r.contact !== undefined) {
    errors.push("只有 contact_only 记录才填写 contact");
  }

  if (isMeasured) validateMeasured(r, ctx, errors);
  else validateDocumented(r, ctx, errors);
  return errors;
}

function validateMeasured(r: Record<string, unknown>, ctx: Context, errors: string[]) {
  if (typeof r.platform !== "string" || !PLATFORMS.includes(r.platform)) {
    errors.push(`platform 必须是 ${PLATFORMS.join(" / ")}`);
  }
  for (const key of ["app_version", "os_version", "device"]) requireString(errors, r, key);
  checkDate(errors, "tested_on", r.tested_on, ctx.today);
  if (typeof r.tester !== "string" || !GITHUB_USER_RE.test(r.tester)) errors.push("tester 必须是 GitHub 用户名");
  if (typeof r.default_state !== "string" || !DEFAULT_STATES.includes(r.default_state)) {
    errors.push(`default_state 必须是 ${DEFAULT_STATES.join(" / ")}`);
  }

  if (r.outcome === "in_app_toggle") {
    if (!Array.isArray(r.steps) || r.steps.length === 0) {
      errors.push("in_app_toggle 记录必须有 steps");
    } else {
      let taps = 0;
      r.steps.forEach((s, i) => {
        const step = s as Record<string, unknown>;
        if (!step || (step.action !== "tap" && step.action !== "swipe")) {
          errors.push(`steps[${i}].action 必须是 tap 或 swipe`);
        }
        if (!isNonEmptyString(step?.target)) errors.push(`steps[${i}].target 不能为空`);
        if (step?.action === "tap") taps++;
      });
      if (!Number.isInteger(r.clicks) || (r.clicks as number) < 0) {
        errors.push("clicks 必须是非负整数");
      } else if (r.clicks !== taps) {
        errors.push(`clicks 为 ${r.clicks}，但 steps 里有 ${taps} 个 tap`);
      }
    }
  } else if (r.steps !== undefined || r.clicks !== undefined) {
    errors.push("只有 in_app_toggle 记录才填写 steps 和 clicks");
  }

  const shots = r.screenshots;
  if (r.source === "example" && shots === undefined) return; // 示例数据没有真实截图
  if (!Array.isArray(shots) || shots.length === 0) {
    errors.push("实测记录至少要有 1 张截图");
    return;
  }
  const appDir = normalize(join("evidence", String(r.app)));
  shots.forEach((s, i) => {
    const shot = s as Record<string, unknown>;
    if (!isNonEmptyString(shot?.file)) {
      errors.push(`screenshots[${i}].file 不能为空`);
      return;
    }
    const rel = normalize(shot.file);
    if (!rel.startsWith(appDir + "/") || !/\.(png|jpe?g|webp)$/i.test(rel)) {
      errors.push(`screenshots[${i}].file 必须是 ${appDir}/ 下的 png/jpg/webp`);
      return;
    }
    if (typeof shot.sha256 !== "string" || !SHA256_RE.test(shot.sha256)) {
      errors.push(`screenshots[${i}].sha256 必须是 64 位小写十六进制`);
      return;
    }
    const abs = join(ctx.root, rel);
    if (!existsSync(abs)) {
      errors.push(`截图 ${rel} 不存在`);
    } else if (sha256File(abs) !== shot.sha256) {
      errors.push(`截图 ${rel} 的 sha256 与记录不一致`);
    }
  });
}

function validateDocumented(r: Record<string, unknown>, ctx: Context, errors: string[]) {
  if (!isNonEmptyString(r.doc_url) || !r.doc_url.startsWith("https://")) errors.push("doc_url 必须是 https 链接");
  requireString(errors, r, "doc_quote");
  checkDate(errors, "doc_updated", r.doc_updated, ctx.today);
  checkDate(errors, "retrieved_on", r.retrieved_on, ctx.today);
  if (r.outcome === "in_app_toggle") {
    if (!Array.isArray(r.doc_path) || r.doc_path.length === 0 || !r.doc_path.every(isNonEmptyString)) {
      errors.push("文档声称的 in_app_toggle 记录必须有 doc_path（字符串列表）");
    }
  } else if (r.doc_path !== undefined) {
    errors.push("只有 in_app_toggle 记录才填写 doc_path");
  }
}
