import { MessageComposer } from '@/features/messaging/MessageComposer';
import { SavedDrafts } from '@/features/messaging/SavedDrafts';
import { Card, SectionHeader, Txt } from '@/components/ui';
import { usePalette } from '@/theme';
import type { Match, Member } from '@/lib/types';

/**
 * 아직 답이 없는 사람을 이름으로 보여 주고, 그대로 찌를 문구를 만든다.
 *
 * "아직 6명"까지만 알려 주면 총무는 결국 명단을 눈으로 훑어야 한다.
 * 알고 싶은 건 숫자가 아니라 누구인지다.
 */
export function AttendanceNudge({
  teamName,
  match,
  pending,
  attending,
}: {
  teamName: string;
  match: Match;
  pending: Member[];
  attending: number;
}) {
  const p = usePalette();

  if (pending.length === 0) {
    return (
      <Card>
        <Txt variant="small" color={p.ok}>
          전원이 답했어요. 찌를 사람이 없어요.
        </Txt>
      </Card>
    );
  }

  /*
   * 저장해 둔 초안이 먼저다. 매주 같은 글을 보내는 사람에게는 고르고 보내기가 전부라,
   * 문구를 새로 짓는 자리(아래)보다 위에 둔다.
   */
  // 누가 안 했는지는 위 요약 카드가 이미 이름으로 보여 준다. 여기서 또 나열하지 않는다.
  return (
    <>
      <SavedDrafts kind="attendance" match={match} />
      <SectionHeader title="새로 짓기" />
      <MessageComposer
      openLabel={`답 없는 ${pending.length}명에게 보낼 문구 만들기`}
      title="단톡방에 붙여넣을 참석 확인"
      namesOnHelp="누가 답을 안 했는지 단톡방에 그대로 보여요."
      namesOffHelp="인원수만 적어요. 이름이 도는 게 부담스러울 때."
      notePlaceholder="덧붙일 말 (예: 오늘 저녁까지만 알려 주세요)"
      templateKind="attendance"
      match={match}
      build={({ includeNames, note }) => ({
        kind: 'attendance_nudge',
        teamName,
        match: {
          date: match.date,
          kickoff: match.kickoff,
          venue: match.venue,
          opponent: match.opponent,
        },
        pending: pending.map((member) => ({ name: member.name })),
        attending,
        includeNames,
        note,
      })}
      />
    </>
  );
}
