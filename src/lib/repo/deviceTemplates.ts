import AsyncStorage from '@react-native-async-storage/async-storage';
import type { MessageTemplate } from '@/lib/types';

/**
 * 문구 초안을 기기에 담아 두는 자리.
 *
 * `message_templates` 표가 아직 없는 팀을 위한 대비책이다. 표를 만들려면 맥북에서
 * `db push` 를 해야 하는데, 문구 하나 적자고 터미널을 열게 하면 아무도 안 쓴다.
 * 그래서 표가 없으면 여기에 담고, 나중에 표가 생기면 그때부터 DB 를 쓴다.
 *
 * **이 자리에 있는 동안에는 그 기기에서만 보인다.** 폰과 맥이 따로 논다.
 * 화면이 그 사실을 알려 준다 — 조용히 두면 폰에서 안 보인다고 앱을 의심하게 된다.
 */
const KEY = 'footballbanghwa:templates:v1';

function keyFor(teamId: string): string {
  return `${KEY}:${teamId}`;
}

export async function readDeviceTemplates(teamId: string): Promise<MessageTemplate[]> {
  try {
    const raw = await AsyncStorage.getItem(keyFor(teamId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as MessageTemplate[]) : [];
  } catch {
    // 저장소를 못 읽는 환경(사파리 프라이빗 등)에서도 앱은 그대로 떠야 한다.
    return [];
  }
}

async function write(teamId: string, rows: MessageTemplate[]): Promise<void> {
  try {
    await AsyncStorage.setItem(keyFor(teamId), JSON.stringify(rows));
  } catch {
    // 담아 두지 못해도 화면에는 이미 떠 있다. 다음에 열면 사라지는 건 어쩔 수 없다.
  }
}

export async function saveDeviceTemplate(template: MessageTemplate): Promise<void> {
  const rows = await readDeviceTemplates(template.teamId);
  await write(template.teamId, [...rows.filter((row) => row.id !== template.id), template]);
}

export async function removeDeviceTemplate(teamId: string, id: string): Promise<void> {
  const rows = await readDeviceTemplates(teamId);
  await write(teamId, rows.filter((row) => row.id !== id));
}

/**
 * 표가 생긴 뒤 기기에 있던 것을 옮긴다. 옮기고 나면 기기 쪽은 비운다 —
 * 두 곳에 같은 문구가 남으면 어느 쪽을 고쳤는지 아무도 모른다.
 */
export async function drainDeviceTemplates(teamId: string): Promise<MessageTemplate[]> {
  const rows = await readDeviceTemplates(teamId);
  if (rows.length) await write(teamId, []);
  return rows;
}

/**
 * PostgREST 가 "그런 표 없다"고 할 때만 대비책으로 넘어간다.
 * 권한 오류(RLS)나 네트워크 오류까지 여기로 흘리면 진짜 문제가 조용히 묻힌다.
 */
export function isMissingTable(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const code = (error as { code?: string }).code;
  const message = String((error as { message?: string }).message ?? '');
  return (
    code === '42P01' || // undefined_table
    code === 'PGRST205' || // 스키마 캐시에 없음
    /message_templates/.test(message) && /(does not exist|schema cache)/i.test(message)
  );
}
