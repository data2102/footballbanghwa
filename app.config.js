/**
 * app.json 을 그대로 쓰되, 배포 형태에 따라 두 가지만 갈아 끼운다.
 *
 * - EXPO_WEB_OUTPUT=single : 라우트별 HTML 대신 단일 페이지(SPA). 파일 하나로 묶어 공유하는 데모 빌드용.
 * - EXPO_BASE_URL=/저장소이름 : GitHub Pages 처럼 하위 경로에서 서비스할 때 필요하다.
 *   이게 없으면 /_expo/... 를 도메인 루트에서 찾다가 흰 화면이 뜬다.
 *
 * 평소 개발(npm run web)에서는 둘 다 비어 있어서 app.json 이 그대로 쓰인다.
 */
module.exports = ({ config }) => {
  const next = { ...config };

  if (process.env.EXPO_WEB_OUTPUT) {
    next.web = { ...next.web, output: process.env.EXPO_WEB_OUTPUT };
  }
  if (process.env.EXPO_BASE_URL) {
    next.experiments = { ...next.experiments, baseUrl: process.env.EXPO_BASE_URL };
  }
  return next;
};
