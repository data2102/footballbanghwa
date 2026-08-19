import AsyncStorage from '@react-native-async-storage/async-storage';
import { uid } from '@/lib/format';

const KEY = 'footballbanghwa:ballot:v1';

/**
 * 이 기기의 투표 표식.
 *
 * MVP 투표에서 누가 누구를 찍었는지는 남기지 않는다 — 동호회에서 그게 드러나면
 * 다음 주 분위기가 달라진다. 대신 기기마다 무작위 값을 하나 만들어 두고,
 * 같은 기기가 두 번 넣거나 표를 옮기는 것만 가려낸다. 이 값으로는 사람을 되짚을 수 없다.
 */
let cached: string | null = null;

export async function ballotId(): Promise<string> {
  if (cached) return cached;
  try {
    const saved = await AsyncStorage.getItem(KEY);
    if (saved) {
      cached = saved;
      return saved;
    }
  } catch {
    // 저장소를 못 쓰는 환경(사파리 프라이빗 등)에서는 이번 세션만 쓰는 값을 만든다.
  }
  const next = uid();
  cached = next;
  try {
    await AsyncStorage.setItem(KEY, next);
  } catch {
    // 저장 실패는 넘긴다. 앱을 다시 열면 표를 한 번 더 넣을 수 있을 뿐이다.
  }
  return next;
}
