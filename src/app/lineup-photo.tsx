import { useEffect, useMemo, useState } from 'react';
import { Image, Pressable, ScrollView, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useStore } from '@/lib/store';
import { parseText } from '@/lib/ai/client';
import { wakeAiServer } from '@/lib/ai/aiFetch';
import { BUILD_ID, detailOf } from '@/lib/ai/invokeError';
import { isLocalRepo } from '@/lib/repo';
import { pickPhoto, type PickedPhoto } from '@/lib/photo';
import { takeHandedPhotos } from '@/lib/photoHandoff';
import { shareText } from '@/lib/share';
import { formatDate } from '@/lib/format';
import { buildBoard, type BoardRow } from '@/features/lineup/board';
import { GuestTag } from '@/features/lineup/Pitch';
import { Button, Card, Chip, Divider, Row, Screen, Txt, radius, space } from '@/components/ui';
import { Icon } from '@/components/icons';
import { usePalette } from '@/theme';
import type { LineupItem } from '@/lib/ai/contract';
import type { LineupSide, PositionGroup } from '@/lib/types';

/**
 * 화이트보드 사진 한 장으로 그 쿼터의 두 팀을 채우는 화면.
 *
 * 이 팀은 판에 **이름을 쓴 자석**을 붙인다. 중계 화면(네이버 라인업)과 같은 모양이라,
 * 사람이 포메이션을 고르고 이름을 하나씩 넣을 일이 없다 — 이미 운동장에서 다 짜고 왔다.
 * 그래서 이 화면이 하는 일은 **사진을 그대로 옮겨 그리는 것** 하나다.
 *
 * 자리 수는 읽어 낸 그대로 쓴다. 카탈로그의 4-3-3 으로 끌어다 붙이면 수비가 셋인 날에
 * 없는 자리가 하나 생긴다(`formationFromGroups`).
 *
 * 가끔 용병이 온다. 회원으로 만들면 명단·참석률·회비 독촉에 계속 남아서 안 오는 사람이
 * 매주 미납자로 뜬다. 그래서 **회원으로 만들지 않고 이름만 자리에 붙이고 N 을 단다.**
 */

/** 화이트보드는 한 장에 두 팀이 다 있다. 나눠 올리면 어느 쪽이 A인지 알 수 없다. */
const MAX_PHOTOS = 1;

type Row = BoardRow;

export default function LineupPhotoScreen() {
  const p = usePalette();
  const router = useRouter();
  const data = useStore((s) => s.data);
  const activeMatchId = useStore((s) => s.activeMatchId);
  const activeQuarter = useStore((s) => s.activeQuarter);
  const saveLineup = useStore((s) => s.saveLineup);
  const setLineupPhoto = useStore((s) => s.setLineupPhoto);
  const updateMember = useStore((s) => s.updateMember);
  const clearStoreError = useStore((s) => s.clearError);

  const [photos, setPhotos] = useState<PickedPhoto[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorDetail, setErrorDetail] = useState<string | null>(null);
  const [showDetail, setShowDetail] = useState(false);
  const [items, setItems] = useState<LineupItem[] | null>(null);
  const [summary, setSummary] = useState('');
  /** 빼고 저장할 줄. 기본은 전부 넣는다 — 판 하나가 통째로 한 벌이라 골라 넣을 게 아니다. */
  const [dropped, setDropped] = useState<Set<number>>(new Set());
  /** 못 찾은 이름을 사람이 이어 준 결과. 줄 번호 -> 회원 id. */
  const [links, setLinks] = useState<Record<number, string>>({});
  const [pickerAt, setPickerAt] = useState<number | null>(null);
  const [pickerQuery, setPickerQuery] = useState('');

  useEffect(() => {
    const handed = takeHandedPhotos();
    if (handed) setPhotos(handed.slice(0, MAX_PHOTOS));
    // 무료 플랜이라 15분 놀면 잠든다. 사진 고르는 동안 깨워 둔다.
    wakeAiServer();
  }, []);

  const members = useMemo(() => (data ? data.members.filter((one) => one.active) : []), [data]);
  const byId = useMemo(() => new Map(members.map((one) => [one.id, one])), [members]);

  const pickerMatches = useMemo(() => {
    const needle = pickerQuery.trim().toLowerCase();
    if (!needle) return members;
    return members.filter(
      (one) =>
        one.name.toLowerCase().includes(needle) ||
        (one.nickname ?? '').toLowerCase().includes(needle) ||
        one.aliases.some((alias) => alias.toLowerCase().includes(needle)) ||
        String(one.backNumber ?? '') === needle,
    );
  }, [members, pickerQuery]);

  if (!data) return null;
  const match = data.matches.find((one) => one.id === activeMatchId) ?? null;

  /** 자리 순서를 판 그대로 세운다. GK -> DF -> MF -> FW, 같은 줄에서는 왼쪽부터. */
  const sides: { side: LineupSide; rows: Row[] }[] = useMemo(() => {
    if (!items) return [];
    const order: PositionGroup[] = ['GK', 'DF', 'MF', 'FW'];
    return (['A', 'B'] as LineupSide[])
      .map((side) => ({
        side,
        rows: items
          .map((item, at) => ({ item, at }))
          .filter(({ item }) => (item.side ?? 'A') === side)
          .sort(
            (a, b) =>
              order.indexOf(a.item.group) - order.indexOf(b.item.group) ||
              (a.item.slotKey ?? '').localeCompare(b.item.slotKey ?? ''),
          ),
      }))
      .filter((group) => group.rows.length);
  }, [items]);

  const keptCount = items ? items.length - dropped.size : 0;

  async function attach(source: 'camera' | 'library') {
    setError(null);
    try {
      const photo = await pickPhoto(source);
      if (photo) setPhotos([photo]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '사진을 불러오지 못했어요.');
    }
  }

  async function runParse() {
    if (!photos.length) return;
    setBusy(true);
    setError(null);
    setErrorDetail(null);
    try {
      const response = await parseText({
        // 글은 보내지 않는다. 이 화면은 판을 옮겨 적는 일만 한다.
        text: '',
        photos: photos.map((photo) => ({
          slices: photo.parts.map((part) => ({ mediaType: photo.mediaType, data: part.base64 })),
        })),
        members,
        team: data!.team,
        hint: 'lineup',
        quarter: activeQuarter,
      });
      const lineup = response.items.filter((item): item is LineupItem => item.kind === 'lineup');
      setItems(lineup);
      setSummary(response.summary);
      setDropped(new Set());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '분석하지 못했어요. 다시 시도해 주세요.');
      setErrorDetail(detailOf(caught));
      setShowDetail(false);
    } finally {
      setBusy(false);
    }
  }

  /** 읽기와 상관없이 사진만 이 쿼터에 붙인다. AI 가 못 읽어도 원본은 남아야 한다. */
  async function attachOnly() {
    if (!match || !photos.length) return;
    setBusy(true);
    clearStoreError();
    try {
      await setLineupPhoto(match.id, activeQuarter, 'A', photos[0]);
      const failed = useStore.getState().error;
      if (failed) {
        setError(explainSaveFailure(failed));
        setErrorDetail(failed);
        setBusy(false);
        return;
      }
      router.back();
    } finally {
      setBusy(false);
    }
  }

  async function commit() {
    if (!items || !match) return;
    setBusy(true);
    setError(null);
    setErrorDetail(null);
    clearStoreError();
    try {
      for (const { side, rows } of sides) {
        const kept = rows.filter(({ at }) => !dropped.has(at));
        if (!kept.length) continue;

        // 사람이 "이 사람이에요"로 이어 준 판 위의 이름은 그 회원의 별명으로 남긴다.
        for (const { item, at } of kept) {
          if (item.memberId || !links[at]) continue;
          const member = byId.get(links[at]);
          const alias = item.memberName.trim();
          if (member && alias && !member.aliases.includes(alias)) {
            await updateMember({ ...member, aliases: [...member.aliases, alias] });
          }
        }

        const { formation, slots } = buildBoard(kept, links);

        const existing = data!.lineups.find(
          (one) => one.matchId === match.id && one.quarter === activeQuarter && one.side === side,
        );
        await saveLineup({
          matchId: match.id,
          quarter: activeQuarter,
          side,
          formationId: formation.id,
          slots,
          // 읽어 왔다고 원본 사진을 지우면 안 된다.
          photoUri: existing?.photoUri ?? null,
          photoPath: existing?.photoPath ?? null,
        });
      }

      // 원본 사진도 이 쿼터에 붙여 둔다. 판 한 장에 두 팀이 다 있어서 A팀 줄에 붙인다.
      if (photos.length) await setLineupPhoto(match.id, activeQuarter, 'A', photos[0]);

      /*
       * 스토어는 저장이 실패해도 던지지 않는다(낙관적 갱신). 여기서 확인하지 않으면
       * 실패했는데도 "저장했어요" 하고 화면이 닫힌다.
       */
      const failed = useStore.getState().error;
      if (failed) {
        setError(explainSaveFailure(failed));
        setErrorDetail(failed);
        setShowDetail(false);
        setBusy(false);
        return;
      }
      router.back();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '저장하지 못했어요. 다시 시도해 주세요.');
      setBusy(false);
    }
  }

  const errorCard = error ? (
    <Card style={{ backgroundColor: p.dangerSoft, borderColor: p.dangerSoft }}>
      <Txt variant="small" color={p.danger}>
        {error}
      </Txt>
      {errorDetail ? (
        <View style={{ gap: space.xs, marginTop: space.sm }}>
          <Row gap={space.sm}>
            <Button
              label={showDetail ? '자세히 접기' : '자세히 보기'}
              tone="neutral"
              small
              onPress={() => setShowDetail((was) => !was)}
            />
            <Button
              label="원인 복사하기"
              tone="neutral"
              small
              onPress={() => shareText(errorDetail, '분석 실패 원인')}
            />
          </Row>
          {showDetail ? (
            <Txt variant="tiny" color={p.danger} selectable>
              {errorDetail}
            </Txt>
          ) : null}
        </View>
      ) : null}
    </Card>
  ) : null;

  return (
    <Screen scroll>
      {!items ? (
        <>
          {/* 어느 경기 몇 쿼터에 들어가는지 먼저 말한다. 올린 뒤에 알면 되돌리기가 비싸다. */}
          <Card>
            {match ? (
              <>
                <Txt variant="h3">
                  {formatDate(match.date)} 경기 {activeQuarter}쿼터에 들어가요
                </Txt>
                <Txt variant="tiny" muted>
                  다른 쿼터에 놓으려면 출전 탭에서 쿼터를 먼저 고르고 오세요
                </Txt>
              </>
            ) : (
              <Txt variant="small" color={p.danger}>
                반영할 경기가 없어요. 출전 탭에서 날짜를 먼저 고르고 와 주세요.
              </Txt>
            )}
          </Card>

          <Row gap={space.sm}>
            <Button
              label={photos.length ? '다시 찍기' : '사진 찍기'}
              icon="camera"
              tone="neutral"
              style={{ flex: 1 }}
              onPress={() => attach('camera')}
            />
            <Button
              label="앨범에서 고르기"
              icon="image"
              tone="neutral"
              style={{ flex: 1 }}
              onPress={() => attach('library')}
            />
          </Row>

          {photos.length ? (
            <Card>
              <Txt variant="small" muted>
                아래 선택한 사진
              </Txt>
              <Pressable
                onPress={() => setPhotos([])}
                accessibilityRole="button"
                accessibilityLabel="사진 빼기"
              >
                <Image
                  source={{ uri: photos[0].uri }}
                  resizeMode="contain"
                  style={{
                    width: '100%',
                    aspectRatio: 4 / 3,
                    borderRadius: radius.sm,
                    borderWidth: 1,
                    borderColor: p.border,
                    backgroundColor: p.surfaceAlt,
                  }}
                />
                <Row gap={4} style={{ marginTop: 4, justifyContent: 'center' }}>
                  <Icon name="close" size={12} color={p.textMuted} />
                  <Txt variant="tiny" muted>
                    빼기
                  </Txt>
                </Row>
              </Pressable>
            </Card>
          ) : (
            <Card>
              <Txt variant="small" muted>
                위 A팀 · 아래 B팀이 같이 그려진 화이트보드를 한 장으로 찍어 올리면 이름 자석을 읽어
                두 팀을 채워요. 줄에 붙은 자석 수 그대로 판을 그려요.
              </Txt>
              <Txt variant="tiny" muted>
                명단에 없는 이름은 용병으로 보고 이름 왼쪽에 N 을 달아요.
              </Txt>
            </Card>
          )}

          {errorCard}

          <Button
            label={photos.length ? '사진에서 라인업 읽기' : '사진을 먼저 올려주세요'}
            loading={busy}
            disabled={!photos.length || !match}
            onPress={runParse}
          />
          {photos.length && error ? (
            <Button label="읽지 않고 사진만 붙이기" tone="neutral" disabled={busy} onPress={attachOnly} />
          ) : null}

          {isLocalRepo ? (
            <Txt variant="tiny" muted style={{ textAlign: 'center' }}>
              데모 모드에서는 사진을 읽지 못해요. Supabase를 연결하면 Claude가 화이트보드를 읽어요.
            </Txt>
          ) : null}

          <Txt variant="tiny" muted style={{ textAlign: 'center' }}>
            {`앱 판 ${BUILD_ID}`}
          </Txt>
        </>
      ) : (
        <>
          <Card>
            <Txt variant="h3">{summary || '이렇게 읽었어요'}</Txt>
            {match ? (
              <Txt variant="tiny" muted>
                {formatDate(match.date)} 경기 {activeQuarter}쿼터에 들어가요
              </Txt>
            ) : null}
            <Txt variant="tiny" muted>
              N 이 붙은 사람은 명단에 없어요. 회원이면 눌러서 이어 주세요.
            </Txt>
          </Card>

          {sides.length === 0 ? (
            <Card>
              <Txt variant="small" muted>
                판에서 이름을 찾지 못했어요. 자석 글씨가 보이게 더 가까이서 다시 찍어 주세요.
              </Txt>
            </Card>
          ) : (
            sides.map(({ side, rows }) => (
              <Card key={side} style={{ padding: space.sm, gap: 0 }}>
                <Row style={{ padding: space.sm }} gap={space.md}>
                  <Txt variant="h3" style={{ flex: 1 }}>
                    {side}팀 {rows.filter(({ at }) => !dropped.has(at)).length}명
                  </Txt>
                  <Txt variant="tiny" muted>
                    {side === 'A' ? '판 위쪽' : '판 아래쪽'}
                  </Txt>
                </Row>
                {rows.map(({ item, at }) => {
                  const linked = links[at] ? byId.get(links[at]) : undefined;
                  const resolved = item.memberId ? byId.get(item.memberId) : undefined;
                  const guest = !resolved && !linked;
                  const out = dropped.has(at);
                  return (
                    <View key={at}>
                      <Divider />
                      <Row style={{ padding: space.sm }} gap={space.md}>
                        <Txt variant="tiny" muted tabular style={{ width: 34 }}>
                          {item.slotKey || item.group}
                        </Txt>
                        <Row gap={space.xs} style={{ flex: 1 }}>
                          {guest && !out ? <GuestTag /> : null}
                          <Txt
                            variant="body"
                            color={out ? p.textDisabled : undefined}
                            style={{ flexShrink: 1 }}
                          >
                            {resolved?.name ?? linked?.name ?? (item.memberName || '이름 미상')}
                          </Txt>
                        </Row>
                        <Chip
                          label={out ? '되돌리기' : '빼기'}
                          onPress={() =>
                            setDropped((prev) => {
                              const next = new Set(prev);
                              if (next.has(at)) next.delete(at);
                              else next.add(at);
                              return next;
                            })
                          }
                        />
                      </Row>

                      {guest && !out ? (
                        <View style={{ paddingHorizontal: space.sm, paddingBottom: space.sm, gap: space.xs }}>
                          <Row wrap gap={space.sm}>
                            <Txt variant="tiny" muted>
                              명단에 없어요. 용병으로 넣을게요.
                            </Txt>
                            <Chip
                              label="명단에서 고르기"
                              onPress={() => {
                                setPickerAt(pickerAt === at ? null : at);
                                setPickerQuery('');
                              }}
                            />
                          </Row>
                          {pickerAt === at ? (
                            <View style={{ gap: space.xs }}>
                              <TextInput
                                value={pickerQuery}
                                onChangeText={setPickerQuery}
                                autoFocus
                                placeholder="이름·등번호로 찾기"
                                placeholderTextColor={p.textFaint}
                                style={{
                                  width: '100%',
                                  backgroundColor: p.surfaceAlt,
                                  borderRadius: radius.sm,
                                  paddingHorizontal: space.md,
                                  paddingVertical: space.sm,
                                  color: p.text,
                                  fontSize: 15,
                                }}
                              />
                              {pickerMatches.length === 0 ? (
                                <Txt variant="tiny" muted>
                                  그런 이름이 명단에 없어요. 용병이면 그대로 두세요.
                                </Txt>
                              ) : (
                                <ScrollView
                                  horizontal
                                  showsHorizontalScrollIndicator={false}
                                  contentContainerStyle={{ gap: space.sm, paddingVertical: space.xs }}
                                >
                                  {pickerMatches.map((member) => (
                                    <Chip
                                      key={member.id}
                                      label={
                                        member.backNumber != null
                                          ? `${member.name} ${member.backNumber}번`
                                          : member.name
                                      }
                                      onPress={() => {
                                        setLinks((prev) => ({ ...prev, [at]: member.id }));
                                        setPickerAt(null);
                                        setPickerQuery('');
                                      }}
                                    />
                                  ))}
                                </ScrollView>
                              )}
                            </View>
                          ) : null}
                        </View>
                      ) : linked ? (
                        <Txt variant="tiny" muted style={{ paddingHorizontal: space.sm, paddingBottom: space.sm }}>
                          {`판에 적힌 "${item.memberName}" 을 이 사람의 별명으로 기억해요`}
                        </Txt>
                      ) : null}
                    </View>
                  );
                })}
              </Card>
            ))
          )}

          {errorCard}

          <Button
            label={keptCount ? `${keptCount}명으로 ${activeQuarter}쿼터 저장하기` : '넣을 사람이 없어요'}
            loading={busy}
            disabled={!keptCount}
            onPress={commit}
          />
          <Button
            label="사진 다시 올리기"
            tone="neutral"
            onPress={() => {
              setItems(null);
              setPhotos([]);
              setDropped(new Set());
              setLinks({});
            }}
          />
        </>
      )}
    </Screen>
  );
}

/** 저장이 왜 막혔는지 사람 말로 옮긴다. 제일 흔한 건 권한이다. */
function explainSaveFailure(raw: string): string {
  if (/row-level security|violates row-level|42501|permission denied/i.test(raw)) {
    return '저장할 권한이 없어요. 라인업은 감독·코치·총무만 바꿀 수 있어요. 팀 운영진에게 역할을 올려 달라고 해 주세요.';
  }
  if (/failed to fetch|network/i.test(raw)) {
    return '서버에 닿지 못했어요. 인터넷을 확인하고 다시 눌러 주세요.';
  }
  return `저장하지 못했어요. (${raw.slice(0, 120)})`;
}
