import { Redirect } from 'expo-router';

/**
 * 없는 주소로 들어오면 홈으로 보낸다.
 *
 * 링크를 잘못 눌렀을 때만 쓰는 게 아니다. 웹 빌드를 한 파일로 묶어 공유하면
 * 앱이 뜨는 주소가 라우트와 안 맞아서 첫 화면부터 404 가 되는데, 이 리다이렉트가
 * 그 경우도 같이 받아 준다.
 */
export default function NotFound() {
  return <Redirect href="/" />;
}
