import { formatPeriod } from '@/lib/format';
import { MessageComposer } from '@/features/messaging/MessageComposer';
import { Card, Txt } from '@/components/ui';
import { usePalette } from '@/theme';
import type { DueStatus } from '@/lib/selectors';

/**
 * 미납자에게 보낼 안내 문구.
 *
 * 총무가 매달 같은 문장을 새로 고민하는 일을 없애는 게 목적이다.
 * 문구를 만들고 고치는 흐름은 참석 독촉과 똑같아서 MessageComposer 로 모아 두고,
 * 여기서는 회비에만 있는 값(달, 금액, 미납자)을 채운다.
 */
export function ReminderComposer({
  teamName,
  period,
  monthlyDue,
  unpaid,
}: {
  teamName: string;
  period: string;
  monthlyDue: number;
  unpaid: DueStatus[];
}) {
  const p = usePalette();

  if (unpaid.length === 0) {
    return (
      <Card>
        <Txt variant="small" color={p.ok}>
          {formatPeriod(period)} 회비는 다 걷혔어요. 보낼 안내가 없어요.
        </Txt>
      </Card>
    );
  }

  return (
    <MessageComposer
      openLabel={`미납 ${unpaid.length}명에게 보낼 문구 만들기`}
      title="단톡방에 붙여넣을 안내 문구"
      namesOnHelp="누가 안 냈는지 단톡방에 그대로 보여요."
      namesOffHelp="인원수만 적어요. 공개적으로 이름이 도는 게 부담스러울 때."
      notePlaceholder="덧붙일 말 (예: 이번 주까지 부탁드려요)"
      build={({ includeNames, note }) => ({
        kind: 'dues_reminder',
        teamName,
        period,
        monthlyDue,
        unpaid: unpaid.map((row) => ({ name: row.member.name, amount: row.outstanding })),
        includeNames,
        note,
      })}
    />
  );
}
