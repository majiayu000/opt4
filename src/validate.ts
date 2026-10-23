// bun run validate：校验全部数据，有错误时退出码为 1。
import { loadDataset } from "./load";

const root = process.argv[2] ?? process.cwd();
const { apps, records, errors } = loadDataset(root);
if (errors.length) {
  for (const e of errors) console.error(`✗ ${e}`);
  console.error(`\n${errors.length} 个错误`);
  process.exit(1);
}
const count = (s: string) => records.filter((r) => r.data.source === s).length;
console.log(`✓ ${apps.length} 个 App，${records.length} 条记录（实测 ${count("measured")}，文档声称 ${count("documented")}，示例 ${count("example")}）`);
