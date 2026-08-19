/**
 * 공유용 단일 파일 데모를 만든다.
 *
 *   EXPO_WEB_OUTPUT=single npx expo export --platform web --output-dir dist-demo
 *   node scripts/build-demo.mjs
 *
 * 결과: dist-demo/demo.html — 자바스크립트를 안에 품은 HTML 한 장.
 * 링크 하나로 폰에서 열어 눌러볼 수 있게 하려고 쓴다. 실제 배포는 app.json 의
 * static 출력을 그대로 쓰는 게 낫다(라우트별 HTML, 첫 화면이 빠르다).
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const OUT_DIR = 'dist-demo';
const JS_DIR = join(OUT_DIR, '_expo/static/js/web');

const bundleName = readdirSync(JS_DIR).find((f) => f.endsWith('.js'));
if (!bundleName) throw new Error(`${JS_DIR} 에 번들이 없습니다. expo export 를 먼저 돌리세요.`);

const bundle = readFileSync(join(JS_DIR, bundleName), 'utf8')
  // 인라인 <script> 안에서 이 문자열이 나오면 브라우저가 스크립트를 거기서 끊는다.
  // 자바스크립트에서 </script 와 <\/script 는 같은 뜻이라 안전한 치환이다.
  .replace(/<\/script/gi, '<\\/script');

const html = `<title>방화 FC 데모</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700&family=JetBrains+Mono:wght@400;500&display=swap">
<style>
  /* react-native-web 권장 리셋 — 루트가 화면을 꽉 채우고, 스크롤은 ScrollView 가 맡는다. */
  html, body { height: 100%; margin: 0; overflow: hidden; background: #F2F4F6; }
  @media (prefers-color-scheme: dark) { html, body { background: #0F1117; } }
  #root { display: flex; height: 100%; flex: 1; }
</style>
<div id="root"></div>
<script>${bundle}</script>
`;

const outFile = join(OUT_DIR, 'demo.html');
writeFileSync(outFile, html);
console.log(`${outFile} — ${(Buffer.byteLength(html) / 1024 / 1024).toFixed(2)}MB`);
