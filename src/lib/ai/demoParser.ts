/**
 * Supabase가 연결되지 않은 데모 모드에서 쓰는 규칙 기반 파서.
 *
 * 실제 운영에서는 parse-text Edge Function(Claude)이 처리한다. 이 파일은
 * 키 없이도 앱 흐름을 끝까지 확인할 수 있게 하는 대역일 뿐이라,
 * 은어나 문맥이 조금만 복잡해져도 놓친다.
 */
import { todayISO, thisPeriod } from '@/lib/format';
import type { ParseRequest, ParseResponse, ParsedItem, RosterEntry } from './contract';
import type { AttendanceStatus } from '@/lib/types';

const ATTEND = /(^|[\s(])(ㅇ+|o+|O+|참석|참여|참|가요|갑니다|출석|콜|ㄱㄱ)([\s).,!]|$)/;
const ABSENT = /(불참|못\s?가|못\s?감|빠집니다|빠져|패스|결석|스킵|담에|ㄴㄴ|^x$|^X$)/;
const LATE = /(늦참|늦게|늦어|지각|후반|하프타임)/;
/** "3쿼터", "풀타임", "벤치만" 처럼 출전량을 말하는 줄. */
const QUARTERS = /(\d)\s*쿼터|풀\s?타임|끝까지|다\s?뛰|벤치만|안\s?뛰/;

/** 이름 뒤 호칭을 떼고 비교한다. */
function stripHonorific(token: string): string {
  return token.replace(/(형님|형|님|씨|선배|감독님|코치님|총무|주장|캡틴)$/u, '');
}

/** "병준이형" 처럼 호칭 앞에 붙는 매개모음 '이'까지 떼어낸 후보들. */
function nameCandidates(token: string): string[] {
  const stripped = stripHonorific(token.trim());
  if (!stripped) return [];
  const candidates = [stripped];
  if (stripped.length > 2 && stripped.endsWith('이')) candidates.push(stripped.slice(0, -1));
  return candidates;
}

function matchMember(token: string, roster: RosterEntry[]): RosterEntry[] {
  for (const cleaned of nameCandidates(token)) {
    const byNumber = cleaned.match(/^(\d{1,2})번$/);
    if (byNumber) {
      const hit = roster.filter((entry) => entry.backNumber === Number(byNumber[1]));
      if (hit.length) return hit;
      continue;
    }
    const exact = roster.filter((entry) => entry.name === cleaned || entry.nickname === cleaned);
    if (exact.length) return exact;
    // "길동" -> "홍길동" 처럼 성이 빠진 경우.
    const partial = roster.filter((entry) => entry.name.endsWith(cleaned) && cleaned.length >= 2);
    if (partial.length) return partial;
  }
  return [];
}

function parseAmount(raw: string): number | null {
  const withComma = raw.match(/([\d,]{2,})\s*원?/);
  const man = raw.match(/(\d+(?:\.\d+)?)\s*만/);
  if (man) return Math.round(Number(man[1]) * 10000);
  const cheon = raw.match(/(\d+(?:\.\d+)?)\s*천/);
  if (cheon) return Math.round(Number(cheon[1]) * 1000);
  if (withComma) {
    const value = Number(withComma[1].replace(/,/g, ''));
    return Number.isFinite(value) ? value : null;
  }
  return null;
}

export function demoParse(request: ParseRequest): ParseResponse {
  const { text, roster, hint } = request;
  const lines = text
    .split(/[\n;]+/)
    .map((line) => line.trim())
    .filter(Boolean);

  const items: ParsedItem[] = [];
  const unmatched = new Set<string>();
  let sawPayment = false;
  let sawAttendance = false;
  let sawAppearance = false;
  const totalQuarters = request.quarters ?? 4;

  for (const line of lines) {
    // 은행 입금 문자: "입금 30,000 홍길동" / "홍길동 3만원 입금"
    const isPayment = /(입금|이체|보냈|납부|회비)/.test(line);
    const amount = isPayment ? parseAmount(line.replace(/잔액[\s\d,]*원?/g, '')) : null;

    // 한 줄에서 사람 후보를 뽑는다. 구분자로 잘라 토큰 단위 매칭.
    const tokens = line.split(/[\s,·/|]+/).filter(Boolean);

    if (isPayment && amount) {
      sawPayment = true;
      const hit = tokens.flatMap((token) => matchMember(token, roster));
      const member = hit.length === 1 ? hit[0] : null;
      if (!member) {
        const candidate = tokens.find((token) => /^[가-힣]{2,4}$/.test(stripHonorific(token)));
        if (candidate) unmatched.add(stripHonorific(candidate));

      }
      items.push({
        kind: 'payment',
        memberId: member?.id ?? null,
        memberName: member?.name ?? '(미확인)',
        confidence: member ? 'medium' : 'low',
        quote: line,
        ledgerKind: /구장|조끼|음료|물|간식|결제|출금/.test(line) ? 'expense' : 'due',
        amount,
        period: thisPeriod(),
        occurredOn: todayISO(),
        memo: null,
      });
      continue;
    }

    // 출전 쿼터: "도현 3쿼터", "병준이형 풀타임", "지호 벤치만"
    const quarterHit = line.match(QUARTERS);
    if (quarterHit && !isPayment) {
      const spoken = quarterHit[1]
        ? Number(quarterHit[1])
        : /벤치만|안\s?뛰/.test(line)
          ? 0
          : totalQuarters;
      let matchedAny = false;
      for (const token of tokens) {
        const hit = matchMember(token, roster);
        if (hit.length !== 1) continue;
        matchedAny = true;
        sawAppearance = true;
        items.push({
          kind: 'appearance',
          memberId: hit[0].id,
          memberName: hit[0].name,
          confidence: 'medium',
          quote: line,
          quarters: Math.max(0, Math.min(6, spoken)),
        });
      }
      // 사람을 못 찾았으면 참석 해석으로 넘어가지 않고 이 줄은 버린다.
      if (matchedAny) continue;
    }

    for (const token of tokens) {
      const hit = matchMember(token, roster);
      if (hit.length !== 1) continue;

      // 이름 뒤쪽 문맥에서 참석 여부를 읽는다.
      const tail = line.slice(line.indexOf(token) + token.length, line.indexOf(token) + token.length + 12);
      let status: AttendanceStatus | null = null;
      if (LATE.test(tail) || LATE.test(line)) status = 'late';
      else if (ABSENT.test(tail)) status = 'absent';
      else if (ATTEND.test(tail) || (hint === 'attendance' && tokens.length <= 3)) status = 'attending';
      if (!status) continue;

      sawAttendance = true;
      items.push({
        kind: 'attendance',
        memberId: hit[0].id,
        memberName: hit[0].name,
        confidence: 'medium',
        quote: line,
        status,
        note: status === 'late' ? tail.trim() || null : null,
      });
    }
  }

  // 같은 사람이 같은 종류로 여러 번 나오면 마지막 것만 남긴다.
  const deduped = items.filter((item, index) => {
    if (item.kind !== 'attendance' && item.kind !== 'appearance') return true;
    return !items.some(
      (other, otherIndex) =>
        otherIndex > index && other.kind === item.kind && other.memberId === item.memberId,
    );
  });

  const kinds = [
    sawPayment ? 'payment' : null,
    sawAttendance ? 'attendance' : null,
    sawAppearance ? 'appearance' : null,
  ].filter((kind): kind is 'payment' | 'attendance' | 'appearance' => kind !== null);
  const intent = kinds.length > 1 ? 'mixed' : (kinds[0] ?? 'unknown');

  return {
    intent,
    formation: null,
    items: deduped,
    unmatched: [...unmatched],
    summary:
      deduped.length === 0
        ? '데모 파서로는 못 읽었어요. Supabase를 연결하면 Claude가 훨씬 자유로운 문장도 읽어요.'
        : `규칙 파서로 ${deduped.length}건 읽었어요. Supabase를 연결하면 Claude가 분석해요.`,
  };
}
