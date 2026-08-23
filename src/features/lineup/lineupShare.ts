import { Platform } from 'react-native';
import { formatDate } from '@/lib/format';
import { findFormation } from '@/features/lineup/formations';
import type { LineupSide, LineupSlot, Match, Member, PositionGroup } from '@/lib/types';
import type { Palette } from '@/theme';

/**
 * 라인업을 앱 밖으로 내보내는 두 가지 모양.
 *
 * 카톡에 붙는 건 결국 이미지 아니면 글이다. 이미지는 한눈에 들어오고,
 * 글은 어디서나 붙고 검색도 된다. 둘 다 만들어 두고 상황에 맞는 걸 쓴다.
 */

export type LineupShareInput = {
  teamName: string;
  /** 자체경기라 한 판에 두 팀이 선다. 어느 팀 라인업인지 글머리에 적는다. */
  side?: LineupSide;
  match: Match;
  formationId: string;
  slots: LineupSlot[];
  members: Map<string, Member>;
  bench: Member[];
};

const GROUP_LABEL: Record<PositionGroup, string> = {
  GK: 'GK',
  DF: '수비',
  MF: '미드',
  FW: '공격',
};

/** 포지션 줄별로 묶는다. 사람은 "수비 누구누구" 로 읽지 슬롯 키로 읽지 않는다. */
function byGroup(slots: LineupSlot[], members: Map<string, Member>) {
  const order: PositionGroup[] = ['GK', 'DF', 'MF', 'FW'];
  return order
    .map((group) => ({
      group,
      names: slots
        .filter((slot) => slot.group === group && (slot.memberId || slot.guestName))
        // 용병은 명단에 없어서 이름만 있다. 단톡방에도 N 을 붙여 보낸다 —
        // 빼고 보내면 판에 선 사람이 공지에서 사라진다.
        .map((slot) =>
          slot.memberId ? members.get(slot.memberId)?.name : `N ${slot.guestName}`,
        )
        .filter((name): name is string => Boolean(name)),
    }))
    .filter((line) => line.names.length > 0);
}

/** 단톡방에 그대로 붙여넣는 글. */
export function lineupText(input: LineupShareInput): string {
  const { teamName, match, formationId, slots, members, bench } = input;
  const formation = findFormation(formationId);
  const lines = byGroup(slots, members);
  const filled = slots.filter((slot) => slot.memberId || slot.guestName).length;

  const head = [
    `[${teamName}${input.side ? ` ${input.side}팀` : ''}] ${formatDate(match.date)} ${match.kickoff}`,
    `${match.venue}${match.opponent ? ` · vs ${match.opponent}` : ''}`,
    `${formation.label} (${filled}/${formation.size})`,
  ];

  const body = lines.map((line) => `${GROUP_LABEL[line.group]} ${line.names.join(', ')}`);
  const tail = bench.length ? [`대기 ${bench.map((member) => member.name).join(', ')}`] : [];

  return [...head, '', ...body, ...tail].join('\n');
}

/**
 * 전술판을 PNG 로 그린다. 웹에서만 된다(네이티브에는 canvas 가 없다).
 *
 * 화면을 캡처하지 않고 다시 그리는 이유는, 캡처를 쓰려면
 * 라이브러리를 하나 더 붙여야 하고 그마저 웹에서 한글 폰트가 자주 깨지기 때문이다.
 * 좌표는 같은 값을 쓰므로 화면과 그림이 어긋나지 않는다.
 */
export async function lineupImage(
  input: LineupShareInput,
  palette: Palette,
): Promise<string | null> {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return null;

  const { match, formationId, slots, members, bench, teamName } = input;
  const formation = findFormation(formationId);

  const W = 760;
  // 머리말 높이는 상대팀 줄 유무로 달라지고, 아래는 대기 명단이 있을 때만 자리를 잡는다.
  // 고정 높이로 두면 단톡방에서 아래가 빈 채로 올라간다.
  const top = match.opponent ? 160 : 130;
  const fieldH = 860;
  const H = top + fieldH + (bench.length ? 96 : 40);

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  // 한글이 네모로 나오지 않게 웹폰트를 먼저 기다린다.
  try {
    await document.fonts?.ready;
  } catch {
    // 폰트 API 가 없어도 시스템 한글 폰트로 그려진다.
  }
  const face = '"Noto Sans KR", -apple-system, sans-serif';

  ctx.fillStyle = palette.surface;
  ctx.fillRect(0, 0, W, H);

  // ---------------------------------------------------------------- 머리말
  ctx.fillStyle = palette.text;
  ctx.font = `700 34px ${face}`;
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(teamName, 40, 66);

  ctx.fillStyle = palette.textMuted;
  ctx.font = `400 22px ${face}`;
  ctx.fillText(
    `${formatDate(match.date)} ${match.kickoff} · ${match.venue}`,
    40,
    100,
  );
  if (match.opponent) {
    ctx.fillText(`vs ${match.opponent}`, 40, 130);
  }

  ctx.fillStyle = palette.primaryStrong;
  ctx.font = `700 24px ${face}`;
  ctx.textAlign = 'right';
  ctx.fillText(formation.label, W - 40, 66);
  ctx.textAlign = 'left';

  // ---------------------------------------------------------------- 필드
  const pad = 40;
  const fieldW = W - pad * 2;

  ctx.fillStyle = palette.surfaceAlt;
  roundRect(ctx, pad, top, fieldW, fieldH, 12);
  ctx.fill();

  ctx.strokeStyle = palette.borderStrong;
  ctx.lineWidth = 2;

  const inset = fieldW * 0.04;
  const lineTop = top + fieldH * 0.03;
  const lineH = fieldH * 0.94;
  ctx.strokeRect(pad + inset, lineTop, fieldW - inset * 2, lineH);

  // 하프라인
  ctx.beginPath();
  ctx.moveTo(pad + inset, top + fieldH / 2);
  ctx.lineTo(pad + fieldW - inset, top + fieldH / 2);
  ctx.stroke();

  // 센터서클 — 화면과 달리 캔버스는 원을 그대로 그릴 수 있다.
  ctx.beginPath();
  ctx.arc(pad + fieldW / 2, top + fieldH / 2, fieldW * 0.16, 0, Math.PI * 2);
  ctx.stroke();

  // 페널티 박스 두 곳
  const boxW = fieldW * 0.5;
  const boxH = fieldH * 0.11;
  ctx.strokeRect(pad + (fieldW - boxW) / 2, lineTop, boxW, boxH);
  ctx.strokeRect(pad + (fieldW - boxW) / 2, lineTop + lineH - boxH, boxW, boxH);

  // ---------------------------------------------------------------- 선수
  for (const slot of slots) {
    const member = slot.memberId ? members.get(slot.memberId) : undefined;
    const guest = !member && slot.guestName ? slot.guestName : null;
    const filledSlot = Boolean(member || guest);
    const cx = pad + slot.x * fieldW;
    // y=1 이 상대 골문이라 화면 좌표와 반대다.
    const cy = top + (1 - slot.y) * fieldH;

    ctx.beginPath();
    ctx.arc(cx, cy, 26, 0, Math.PI * 2);
    ctx.fillStyle = filledSlot ? palette.surface : 'transparent';
    if (filledSlot) ctx.fill();
    ctx.strokeStyle = guest ? palette.warnLine : palette.borderStrong;
    ctx.lineWidth = filledSlot ? 2 : 1.5;
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.fillStyle = guest ? palette.warn : member ? palette.textMuted : palette.textDisabled;
    ctx.font = `500 18px ${face}`;
    ctx.fillText(guest ? 'N' : String(member ? (member.backNumber ?? slot.key) : slot.key), cx, cy + 6);

    if (member || guest) {
      ctx.fillStyle = palette.text;
      ctx.font = `500 19px ${face}`;
      ctx.fillText(guest ? `N ${guest}` : (member as Member).name, cx, cy + 50);
    }
    ctx.textAlign = 'left';
  }

  // ---------------------------------------------------------------- 대기
  if (bench.length) {
    ctx.fillStyle = palette.textFaint;
    ctx.font = `500 19px ${face}`;
    ctx.fillText(`대기  ${bench.map((member) => member.name).join('  ')}`, 40, top + fieldH + 62);
  }

  return canvas.toDataURL('image/png');
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
