import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useStore } from '@/lib/store';
import { balance, duesForPeriod, memberName, recentPeriods, treasury } from '@/lib/selectors';
import { formatDate, formatPeriod, todayISO, won, wonShort } from '@/lib/format';
import {
  Button,
  Card,
  Chip,
  Divider,
  Empty,
  Row,
  Screen,
  SectionHeader,
  Segmented,
  Stat,
  Txt,
  space,
} from '@/components/ui';
import { QuickInputFab } from '@/components/QuickInputFab';
import { usePalette } from '@/theme';

type Tab = 'dues' | 'ledger';

export default function FinanceScreen() {
  const p = usePalette();
  const data = useStore((state) => state.data);
  const addLedger = useStore((state) => state.addLedger);
  const removeLedger = useStore((state) => state.removeLedger);

  const periods = recentPeriods();
  const [period, setPeriod] = useState(periods[0]);
  const [tab, setTab] = useState<Tab>('dues');

  if (!data) return null;

  const dues = duesForPeriod(data, period);
  const unpaid = dues.filter((row) => row.outstanding > 0);
  const monthly = balance(data.ledger, period);
  const ledgerRows = [...data.ledger].sort((a, b) => b.occurredOn.localeCompare(a.occurredOn));

  return (
    <View style={{ flex: 1 }}>
      <Screen>
        <Card>
          <Row gap={space.sm} wrap>
            <Stat label="팀 잔고" value={`${wonShort(treasury(data.ledger))}원`} />
            <Stat label={`${formatPeriod(period)} 수입`} value={`${wonShort(monthly.income)}원`} tone={p.ok} />
            <Stat label={`${formatPeriod(period)} 지출`} value={`${wonShort(monthly.expense)}원`} tone={p.danger} />
          </Row>
        </Card>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }}>
          {periods.map((item) => (
            <Chip
              key={item}
              label={formatPeriod(item)}
              selected={item === period}
              onPress={() => setPeriod(item)}
            />
          ))}
        </ScrollView>

        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: 'dues', label: `회비 (미납 ${unpaid.length})` },
            { value: 'ledger', label: '장부' },
          ]}
        />

        {tab === 'dues' ? (
          <Card style={{ padding: space.sm, gap: 0 }}>
            {dues.map((row, index) => {
              const done = row.outstanding === 0;
              return (
                <View key={row.member.id}>
                  {index > 0 ? <Divider /> : null}
                  <Row justify="space-between" style={{ padding: space.sm }}>
                    <View style={{ flexShrink: 1 }}>
                      <Txt variant="h3" color={done ? p.textMuted : p.text}>
                        {row.member.name}
                      </Txt>
                      <Txt variant="tiny" muted>
                        {done ? `완납 · ${won(row.paid)}` : `미납 ${won(row.outstanding)}`}
                      </Txt>
                    </View>
                    {done ? (
                      <Chip label="완납" tone={{ fg: p.ok, bg: p.okSoft }} />
                    ) : (
                      <Button
                        label={`${wonShort(row.outstanding)}원 입금`}
                        small
                        onPress={() =>
                          addLedger({
                            memberId: row.member.id,
                            kind: 'due',
                            amount: row.outstanding,
                            period,
                            occurredOn: todayISO(),
                            memo: null,
                            source: 'manual',
                          })
                        }
                      />
                    )}
                  </Row>
                </View>
              );
            })}
            {dues.length === 0 ? <Empty text="회원이 없습니다." /> : null}
          </Card>
        ) : (
          <Card style={{ padding: space.sm, gap: 0 }}>
            {ledgerRows.length === 0 ? (
              <Empty text="장부가 비어 있습니다." />
            ) : (
              ledgerRows.map((row, index) => (
                <View key={row.id}>
                  {index > 0 ? <Divider /> : null}
                  <Row justify="space-between" style={{ padding: space.sm }}>
                    <View style={{ flexShrink: 1 }}>
                      <Txt variant="body">
                        {row.kind === 'due'
                          ? `${memberName(data.members, row.memberId)} 회비`
                          : row.memo || (row.kind === 'expense' ? '지출' : '수입')}
                      </Txt>
                      <Txt variant="tiny" muted>
                        {formatDate(row.occurredOn)}
                        {row.period ? ` · ${formatPeriod(row.period)}분` : ''}
                        {row.source === 'ai' ? ' · AI' : ''}
                      </Txt>
                    </View>
                    <Row gap={space.sm}>
                      <Txt variant="h3" color={row.kind === 'expense' ? p.danger : p.ok}>
                        {row.kind === 'expense' ? '-' : '+'}
                        {won(row.amount)}
                      </Txt>
                      <Button label="삭제" tone="danger" small onPress={() => removeLedger(row.id)} />
                    </Row>
                  </Row>
                </View>
              ))
            )}
          </Card>
        )}

        <SectionHeader title="빠른 입력" />
        <Card>
          <Txt variant="small" muted>
            은행 입금 문자를 통째로 붙여넣으면 이름과 금액을 뽑아 회비로 처리합니다. 구장비·조끼값
            같은 지출도 &ldquo;구장비 12만원 결제&rdquo; 한 줄이면 됩니다.
          </Txt>
        </Card>
      </Screen>
      <QuickInputFab hint="payment" />
    </View>
  );
}
