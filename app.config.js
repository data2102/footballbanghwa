/**
 * app.json 을 그대로 쓰되, 데모 빌드에서만 웹 출력 방식을 바꾼다.
 * EXPO_WEB_OUTPUT=single 로 내보내면 라우트별 HTML 대신 단일 페이지(SPA)가 나오고,
 * 그래야 파일 하나로 묶어 공유할 수 있다. 평소 배포는 app.json 의 static 을 쓴다.
 */
module.exports = ({ config }) => {
  if (!process.env.EXPO_WEB_OUTPUT) return config;
  return { ...config, web: { ...config.web, output: process.env.EXPO_WEB_OUTPUT } };
};
