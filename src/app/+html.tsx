import { ScrollViewStyleReset } from 'expo-router/html';
import type { PropsWithChildren } from 'react';

/** GitHub Pages 처럼 하위 경로에 올릴 때를 위해 앞에 붙일 경로. 루트 배포면 빈 문자열이다. */
const base = (process.env.EXPO_BASE_URL ?? '').replace(/\/$/, '');

/**
 * 웹 빌드의 HTML 껍데기. 네이티브에는 영향이 없다.
 * 한글 폰트는 여기서만 불러온다 — Google Fonts 가 unicode-range 로 잘라서 주기 때문에
 * 필요한 글자만 내려받는다. 네이티브는 시스템 한글 폰트를 그대로 쓴다(theme.ts 참고).
 */
export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="ko">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, shrink-to-fit=no, viewport-fit=cover"
        />
        <meta name="theme-color" content="#F2F4F6" />
        {/* 앱을 라이트로 고정했으니 스크롤바·기본 폼 같은 브라우저 UI 도 같이 맞춘다. */}
        <meta name="color-scheme" content="light" />
        {/* 홈 화면에 추가했을 때 주소창 없이 앱처럼 뜨게 한다. */}
        <link rel="manifest" href={`${base}/manifest.json`} />
        <link rel="apple-touch-icon" href={`${base}/icon.png`} />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="우리팀" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700&family=JetBrains+Mono:wght@400;500&display=swap"
        />
        <ScrollViewStyleReset />
        <style dangerouslySetInnerHTML={{ __html: `
          html, body { background: #F2F4F6; color-scheme: light; }

          /*
           * 모바일 브라우저는 아래 주소창·툴바가 덮은 만큼까지 height:100% 에 넣어서 잰다.
           * body 가 overflow:hidden 이라 넘친 만큼은 스크롤도 안 되고 그냥 잘린다 - 탭바가
           * 그렇게 사라진다. dvh 는 지금 실제로 보이는 높이만 준다.
           */
          @supports (height: 100dvh) {
            html, body, #root { height: 100dvh; }
          }
        ` }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
