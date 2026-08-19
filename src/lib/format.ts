import { randomUUID } from 'expo-crypto';

/** 화면 표기용 포맷터 모음. 통화·날짜는 전부 여기서만 만든다. */

export function won(amount: number): string {
  return `${amount.toLocaleString('ko-KR')}원`;
}

/** 큰 금액은 대시보드에서 "12.4만" 처럼 줄여 쓴다. */
export function wonShort(amount: number): string {
  if (Math.abs(amount) >= 10000) {
    const man = amount / 10000;
    return `${Number.isInteger(man) ? man : man.toFixed(1)}만`;
  }
  return amount.toLocaleString('ko-KR');
}

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

export function todayISO(): string {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

export function thisPeriod(): string {
  return todayISO().slice(0, 7);
}

/** '2026-08-19' -> '8월 19일 (수)' */
export function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  const weekday = WEEKDAYS[new Date(y, m - 1, d).getDay()];
  return `${m}월 ${d}일 (${weekday})`;
}

/** '2026-08' -> '2026년 8월' */
export function formatPeriod(period: string): string {
  const [y, m] = period.split('-');
  return `${y}년 ${Number(m)}월`;
}

export function daysUntil(iso: string): number {
  const today = new Date(`${todayISO()}T00:00:00`);
  const target = new Date(`${iso}T00:00:00`);
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

/** 'D-3' / '오늘' / '3일 전' */
export function relativeDay(iso: string): string {
  const diff = daysUntil(iso);
  if (diff === 0) return '오늘';
  if (diff === 1) return '내일';
  if (diff > 0) return `D-${diff}`;
  return `${-diff}일 전`;
}

export function shiftPeriod(period: string, months: number): string {
  const [y, m] = period.split('-').map(Number);
  const date = new Date(y, m - 1 + months, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * 새 레코드의 id.
 *
 * 반드시 UUID 여야 한다 — Supabase 테이블의 id 컬럼이 전부 uuid 라서,
 * 아무 문자열이나 넣으면 insert 가 "invalid input syntax for type uuid" 로 막힌다.
 * 서버가 만들게 두지 않는 이유는 낙관적 갱신 때문이다. 저장 응답을 기다리지 않고
 * 화면을 먼저 바꾸려면 클라이언트가 id 를 알고 있어야 한다.
 */
export function uid(): string {
  return randomUUID();
}
