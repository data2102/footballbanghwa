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
  Hero,
  Progress,
  Row,
  Screen,
  SectionHeader,
  Segmented,
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
  const outstandingTotal = unpaid.reduce((sum, row) => sum + row.outstanding, 0);
  const monthly = balance(data.ledger, period);
  const ledgerRows = [...data.ledger].sort((a, b) => b.occurredOn.localeCompare(a.occurredOn));

  return (
    <View style={{ flex: 1 }}>
      <Screen>
        <Card>
          <Hero
            label="아직 못 걷은 회비"
            value={won(outstandingTotal)}
            tone={outstandingTotal > 0 ? p.danger : p.ok}
            caption={`${dues.length - unpaid.length} / ${dues.length}명이 냈어요 · 팀 잔고 ${wonShort(
              treasury(data.ledger),
            )}원`}
          />
          <Progress value={dues.length ? (dues.length - unpaid.length) / dues.length : 0} />
          <Row justify="space-between">
            <Txt variant="tiny" muted tabular>
              {formatPeriod(period)} 수입 {wonShort(monthly.income)}원
            </Txt>
            <Txt variant="tiny" muted tabular>
              지출 {wonShort(monthly.expense)}원
            </Txt>
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
            { value: 'dues', label: `회비 · 미납 ${unpaid.length}` },
            { value: 'ledger', label: '장부' },
          ]}
        />

        {tab === 'dues' ? (
          <>
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
                      <Txt variant="tiny" muted tabular>
                        {done ? `${won(row.paid)} 냈어요` : `${won(row.outstanding)} 아직이에요`}
                      </Txt>
                    </View>
                    {done ? (
                      <Chip label="완납" tone={{ fg: p.ok, bg: p.okSoft }} />
                    ) : (
                      <Button
                        label="입금 처리"
                        tone="neutral"
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
            {dues.length === 0 ? <Empty text="아직 회원이 없어요." /> : null}
            </Card>
          </>
        ) : (
          <Card style={{ padding: space.sm, gap: 0 }}>
            {ledgerRows.length === 0 ? (
              <Empty text={'장부가 비어 있어요.\n입금 문자를 붙여넣으면 바로 채워져요.'} />
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
                      <Txt variant="h3" tabular color={row.kind === 'expense' ? p.danger : p.ok}>
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

        <SectionHeader title="빠르게 넣기" />
        <Card>
          <Txt variant="small" muted>
            은행 입금 문자를 통째로 붙여넣으면 이름과 금액만 뽑아 회비로 넣어요. 은행 앱 화면을 찍어서
            올려도 되고, 구장비·조끼값 같은 지출은 &ldquo;구장비 12만원 결제&rdquo; 한 줄이면 돼요.
          </Txt>
        </Card>
      </Screen>
      <QuickInputFab hint="payment" />
    </View>
  );
}
