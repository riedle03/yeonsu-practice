/* content/*.json 을 content/bundle.js 한 파일로 묶는다.
 *
 * 왜 fetch를 안 쓰는가 — 연수장에서 사이트가 뜨지 않는 사고를 줄이려고.
 * <script>로 읽으면 file://로 열어도, 오프라인 사본을 USB로 나눠 줘도 그대로 뜬다.
 * 산출물(bundle.js)은 저장소에 커밋하므로 배포에 빌드 단계가 필요 없다.
 *
 * 진실의 원천은 어디까지나 content/*.json 이다. bundle.js를 직접 고치지 말 것.
 *
 *   node tools/bundle.mjs
 */
import { readFile, writeFile, readdir } from "node:fs/promises";
import { join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const contentDir = join(root, "content");

const files = (await readdir(contentDir))
  .filter((f) => f.endsWith(".json"))
  .sort();

if (files.length === 0) {
  console.error("content/ 에 JSON이 없습니다. 먼저 실습 카드를 만드세요.");
  process.exit(1);
}

const parts = {};
let cardCount = 0;
let promptCount = 0;

for (const f of files) {
  const key = basename(f, ".json");
  const data = JSON.parse(await readFile(join(contentDir, f), "utf8"));
  parts[key] = data;
  const cards = data.cards ?? [];
  cardCount += cards.length;
  for (const c of cards) {
    if (c.prompt?.text) promptCount++;
    promptCount += (c.prompts ?? []).filter((p) => p?.text).length;
  }
}

const out = `/* 자동 생성 파일 — 직접 고치지 마세요.
 * content/*.json 을 고친 뒤 \`node tools/bundle.mjs\` 를 다시 실행하세요.
 */
window.YEONSU = ${JSON.stringify(parts, null, 1)};
`;

await writeFile(join(root, "content", "bundle.js"), out, "utf8");

console.log(
  `bundle.js 생성 — 파트 ${files.length}개, 카드 ${cardCount}장, 프롬프트 ${promptCount}개 ` +
  `(${(Buffer.byteLength(out) / 1024).toFixed(0)}KB)`
);
