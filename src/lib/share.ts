import { Platform, Share } from 'react-native';
import * as Clipboard from 'expo-clipboard';

/**
 * 만든 것을 앱 밖으로 내보내는 통로.
 *
 * 조기축구에서 라인업과 공지가 실제로 도는 곳은 단톡방이다. 앱 안에서만 볼 수 있으면
 * 아무리 잘 만들어도 총무가 결국 손으로 옮겨 적는다.
 *
 * 플랫폼마다 되는 게 달라서 한 단계씩 내려간다:
 *   웹  : 공유 시트(navigator.share) → 없으면 클립보드
 *   네이티브: OS 공유 시트(Share) → 실패하면 클립보드
 * 어느 쪽이든 마지막에는 복사가 되므로 "아무 일도 안 일어남"은 없다.
 */
export type ShareOutcome = 'shared' | 'copied' | 'downloaded' | 'canceled' | 'failed';

export async function shareText(message: string, title?: string): Promise<ShareOutcome> {
  if (Platform.OS === 'web') {
    const nav = globalThis.navigator as Navigator | undefined;
    if (nav?.share) {
      try {
        await nav.share({ text: message, title });
        return 'shared';
      } catch (error) {
        // 사용자가 공유 시트를 닫은 것과 진짜 실패를 구분한다.
        if (isAbort(error)) return 'canceled';
      }
    }
    return copy(message);
  }

  try {
    const result = await Share.share({ message });
    return result.action === Share.dismissedAction ? 'canceled' : 'shared';
  } catch {
    return copy(message);
  }
}

/**
 * 이미지를 내보낸다. 웹에서만 실제 이미지가 나가고, 네이티브에서는 호출부가
 * 텍스트로 대신하도록 'failed' 를 돌려준다 — 이미지 저장 라이브러리를 더 붙이지 않았다.
 */
export async function shareImage(
  dataUrl: string,
  filename: string,
  message?: string,
): Promise<ShareOutcome> {
  if (Platform.OS !== 'web') return 'failed';

  const nav = globalThis.navigator as Navigator | undefined;
  try {
    const blob = await (await fetch(dataUrl)).blob();
    const file = new File([blob], filename, { type: 'image/png' });

    if (nav?.canShare?.({ files: [file] }) && nav.share) {
      try {
        await nav.share({ files: [file], text: message });
        return 'shared';
      } catch (error) {
        if (isAbort(error)) return 'canceled';
        // 공유가 막히면 아래 내려받기로 넘어간다.
      }
    }

    // 공유 시트가 없는 브라우저(데스크톱 크롬 등)에서는 파일로 떨군다.
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    // 링크를 눌러 놓고 바로 지우면 사파리가 내려받기를 취소한다.
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    return 'downloaded';
  } catch {
    return 'failed';
  }
}

async function copy(message: string): Promise<ShareOutcome> {
  try {
    await Clipboard.setStringAsync(message);
    return 'copied';
  } catch {
    return 'failed';
  }
}

function isAbort(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

/** 공유 결과를 사람이 읽는 한 줄로. 화면마다 다시 쓰지 않게 모아 둔다. */
export function shareMessage(outcome: ShareOutcome): string | null {
  switch (outcome) {
    case 'shared':
      return '보냈어요.';
    case 'copied':
      return '복사했어요. 단톡방에 붙여넣으세요.';
    case 'downloaded':
      return '이미지를 내려받았어요. 단톡방에 올려 주세요.';
    case 'canceled':
      return null;
    case 'failed':
      return '공유하지 못했어요. 아래 글을 길게 눌러 복사해 주세요.';
  }
}
