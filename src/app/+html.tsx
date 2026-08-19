import { ScrollViewStyleReset } from 'expo-router/html';
import type { PropsWithChildren } from 'react';

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
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700&family=JetBrains+Mono:wght@400;500&display=swap"
        />
        <ScrollViewStyleReset />
        <style dangerouslySetInnerHTML={{ __html: `
          html, body { background: #F2F4F6; }
          @media (prefers-color-scheme: dark) { html, body { background: #0F1117; } }
        ` }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
