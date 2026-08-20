import { useState } from 'react';
import { Image, ScrollView, View } from 'react-native';
import { useStore } from '@/lib/store';
import {
  balance,
  duesForPeriod,
  memberName,
  paidAnnually,
  recentPeriods,
  treasury,
} from '@/lib/selectors';
import { pickPhoto } from '@/lib/photo';
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
  Stat,
  Txt,
  radius,
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
  const setLedgerPhoto = useStore((state) => state.setLedgerPhoto);

  const periods = recentPeriods();
  const [period, setPeriod] = useState(periods[0]);
  const [tab, setTab] = useState<Tab>('dues');
  const [busyId, setBusyId] = useState<string | null>(null);

  if (!data) return null;

  const year = Number(period.slice(0, 4));
  const dues = duesForPeriod(data, period);
  const unpaid = dues.filter((row) => row.outstanding > 0);
  const outstandingTotal = unpaid.reduce((sum, row) => sum + row.outstanding, 0);
  const monthly = balance(data.ledger, period);
  const ledgerRows = [...data.ledger].sort((a, b) => b.occurredOn.localeCompare(a.occurredOn));

  /** 영수증·찬조 캡처를 장부 한 줄에 붙인다. 나중에 "이 돈이 뭐였지"를 되짚는 유일한 길이다. */
  async function attachReceipt(id: string) {
    setBusyId(id);
    try {
      const photo = await pickPhoto('camera');
      if (photo) await setLedgerPhoto(id, photo);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <View style={{ flex: 1 }}>
      <Screen>
        <Card>
          <Hero
            label="아직 못 걷은 회비"
            value={won(outstandingTotal)}
            tone={outstandingTotal > 0 ? p.danger : p.ok}
            caption={`${dues.length - unpaid.length} / ${dues.length}명이 냈어요`}
          />
          <Progress value={dues.length ? (dues.length - unpaid.length) / dues.length : 0} />

          {/*
            총무가 매달 옮겨 적던 세 숫자. 수입에서 지출을 뺀 게 잔고다.
            달 이름은 아래 칩 줄에 이미 있어서 여기서는 뺀다 — 넣으면 라벨이 두 줄로 접힌다.
          */}
          <Divider />
          <Row justify="space-between">
            <Stat label="이 달 수입" value={`${wonShort(monthly.income)}원`} tone={p.ok} />
            <Stat label="이 달 지출" value={`${wonShort(monthly.expense)}원`} tone={p.danger} />
            <Stat label="팀 잔고" value={`${wonShort(treasury(data.ledger))}원`} />
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
                const annualDone = paidAnnually(data, row.member.id, year);
                return (
                  <View key={row.member.id}>
                    {index > 0 ? <Divider /> : null}
                    <Row justify="space-between" style={{ padding: space.sm }}>
                      <View style={{ flexShrink: 1 }}>
                        <Txt variant="h3" color={done ? p.textMuted : p.text}>
                          {row.member.name}
                        </Txt>
                        <Txt variant="tiny" muted tabular>
                          {row.annual
                            ? `${year}년 연납했어요`
                            : done
                              ? `${won(row.paid)} 냈어요`
                              : `${won(row.outstanding)} 아직이에요`}
                        </Txt>
                      </View>
                      {row.annual ? (
                        <Chip label="연납" tone={{ fg: p.primaryStrong, bg: p.primarySoft }} />
                      ) : done ? (
                        <Chip label="완납" tone={{ fg: p.ok, bg: p.okSoft }} />
                      ) : (
                        <Row gap={space.sm}>
                          {/*
                            연초에 한 번에 내는 사람이 있다. 매달 눌러 주지 않으면 열두 달 내내
                            미납으로 잡혀서 독촉 명단에 남는다.
                          */}
                          {!annualDone ? (
                            <Button
                              label="연납"
                              tone="neutral"
                              small
                              onPress={() =>
                                addLedger({
                                  memberId: row.member.id,
                                  kind: 'due',
                                  amount: data.team.annualDue,
                                  period: `${year}-01`,
                                  months: 12,
                                  occurredOn: todayISO(),
                                  memo: `${year}년 연납`,
                                  source: 'manual',
                                })
                              }
                            />
                          ) : null}
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
                        </Row>
                      )}
                    </Row>
                  </View>
                );
              })}
              {dues.length === 0 ? <Empty text="아직 회원이 없어요." /> : null}
            </Card>

            <Txt variant="tiny" muted>
              월 {won(data.team.monthlyDue)}, 연납 {won(data.team.annualDue)}이에요. 연납을 누르면 그 해
              열두 달이 한 번에 완납으로 잡혀요. 금액은 팀 설정에서 고쳐요.
            </Txt>
          </>
        ) : (
          <Card style={{ padding: space.sm, gap: 0 }}>
            {ledgerRows.length === 0 ? (
              <Empty text={'장부가 비어 있어요.\n입금 문자를 붙여넣으면 바로 채워져요.'} />
            ) : (
              ledgerRows.map((row, index) => (
                <View key={row.id}>
                  {index > 0 ? <Divider /> : null}
                  <View style={{ padding: space.sm, gap: space.sm }}>
                    <Row justify="space-between">
                      <View style={{ flexShrink: 1 }}>
                        <Txt variant="body">
                          {row.kind === 'due'
                            ? `${memberName(data.members, row.memberId)} 회비`
                            : row.memo || (row.kind === 'expense' ? '지출' : '수입')}
                        </Txt>
                        <Txt variant="tiny" muted>
                          {formatDate(row.occurredOn)}
                          {row.period ? ` · ${formatPeriod(row.period)}분` : ''}
                          {row.months > 1 ? ` 외 ${row.months - 1}달` : ''}
                          {row.source === 'ai' ? ' · AI' : ''}
                        </Txt>
                      </View>
                      <Txt variant="h3" tabular color={row.kind === 'expense' ? p.danger : p.ok}>
                        {row.kind === 'expense' ? '-' : '+'}
                        {won(row.amount)}
                      </Txt>
                    </Row>

                    {/* 붙여 둔 영수증. 없으면 찍어서 붙인다. */}
                    {row.photoUri ? (
                      <Image
                        source={{ uri: row.photoUri }}
                        accessibilityLabel={`${row.memo ?? '장부'} 영수증`}
                        resizeMode="contain"
                        style={{
                          width: '100%',
                          aspectRatio: 4 / 3,
                          borderRadius: radius.md,
                          backgroundColor: p.surfaceAlt,
                        }}
                      />
                    ) : null}

                    <Row gap={space.sm}>
                      {/*
                        영수증이 필요한 건 지출과 찬조다. 회비 입금은 은행 문자가 증빙이라
                        모든 줄에 버튼을 달면 장부가 버튼 목록이 된다. 이미 붙여 둔 줄에는 남겨 둔다.
                      */}
                      {row.kind !== 'due' || row.photoUri ? (
                        <Button
                          label={row.photoUri ? '영수증 다시 찍기' : '영수증 찍기'}
                          icon="camera"
                          tone="neutral"
                          small
                          style={{ flex: 1 }}
                          disabled={busyId === row.id}
                          onPress={() => attachReceipt(row.id)}
                        />
                      ) : (
                        <View style={{ flex: 1 }} />
                      )}
                      <Button label="삭제" tone="danger" small onPress={() => removeLedger(row.id)} />
                    </Row>
                  </View>
                </View>
              ))
            )}
          </Card>
        )}

        <SectionHeader title="빠르게 넣기" />
        <Card>
          <Txt variant="small" muted>
            은행 입금 문자를 통째로 붙여넣으면 이름과 금액만 뽑아 회비로 넣어요. 은행 앱 화면을 찍어서
            올려도 되고, 구장비·조끼값 같은 지출이나 찬조금은 &ldquo;구장비 12만원 결제&rdquo; 한 줄이면 돼요.
          </Txt>
        </Card>
      </Screen>
      <QuickInputFab hint="payment" />
    </View>
  );
}
