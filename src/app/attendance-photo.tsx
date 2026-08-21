import { useEffect, useMemo, useState } from 'react';
import { Image, Pressable, ScrollView, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { blankMemberFields, useStore } from '@/lib/store';
import { parseText, type ParseProgress } from '@/lib/ai/client';
import { wakeAiServer } from '@/lib/ai/aiFetch';
import { BUILD_ID, detailOf } from '@/lib/ai/invokeError';
import { isLocalRepo } from '@/lib/repo';
import { pickPhoto, type PickedPhoto } from '@/lib/photo';
import { takeHandedPhotos } from '@/lib/photoHandoff';
import { shareText } from '@/lib/share';
import { formatDate } from '@/lib/format';
import { Button, Card, Checkbox, Chip, Divider, Row, Screen, Txt, radius, space } from '@/components/ui';
import { Icon } from '@/components/icons';
import { usePalette } from '@/theme';
import type { ParseResponse, ParsedItem } from '@/lib/ai/contract';
import type { AttendanceStatus } from '@/lib/types';

/**
 * 카톡 투표 화면을 사진으로 올려 참석을 채우는 화면.
 *
 * 전에는 공통 "문자·사진으로 입력하기"를 같이 썼다. 그런데 그 화면은 회비·라인업·기록까지
 * 다 받는 자리라 참석만 하려는 사람에게는 물어보는 게 많았다 — 종류를 고르고, 글을 쓰고,
 * 힌트를 정한다. 참석은 **투표 화면을 찍어 올리는 일 하나**뿐이라 그 길만 남긴다.
 *
 * 글을 받지 않는 것도 일부러다. 글이 섞이면 함수가 긴 출력 경로로 넘어가는데,
 * 아흔 명이면 그 길이가 그대로 실행 한도가 된다(CLAUDE.md 참고).
 */

/** 올릴 수 있는 사진 수. 긴 캡처는 한 장이 여러 조각으로 잘려 나간다. */
const MAX_PHOTOS = 3;

const GROUPS: { status: AttendanceStatus | 'pending'; label: string }[] = [
  { status: 'attending', label: '참석' },
  { status: 'late', label: '지각' },
  { status: 'absent', label: '불참' },
  { status: 'pending', label: '미투표' },
];

export default function AttendancePhotoScreen() {
  const p = usePalette();
  const router = useRouter();
  const data = useStore((s) => s.data);
  const activeMatchId = useStore((s) => s.activeMatchId);
  const setAttendanceMany = useStore((s) => s.setAttendanceMany);
  const clearAttendance = useStore((s) => s.clearAttendance);
  const updateMember = useStore((s) => s.updateMember);
  const addMember = useStore((s) => s.addMember);
  const clearStoreError = useStore((s) => s.clearError);

  const [photos, setPhotos] = useState<PickedPhoto[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<ParseProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errorDetail, setErrorDetail] = useState<string | null>(null);
  const [showDetail, setShowDetail] = useState(false);
  const [result, setResult] = useState<ParseResponse | null>(null);
  const [checked, setChecked] = useState<Set<number>>(new Set());
  /**
   * 못 찾은 이름을 사람이 이어 준 결과. 줄 번호 -> 회원 id.
   *
   * 이어 주면 그 카톡 이름을 회원의 별명으로 같이 저장한다. 그래야 다음 주에 안 묻는다 —
   * "화이팅" 같은 이름은 실제 이름과 글자가 안 겹쳐서 AI 가 영영 못 맞힌다.
   */
  const [links, setLinks] = useState<Record<number, string>>({});
  /** 새 회원으로 만들 줄들. */
  const [asNew, setAsNew] = useState<Set<number>>(new Set());
  /** 지금 명단을 펼쳐 놓은 줄. */
  const [pickerAt, setPickerAt] = useState<number | null>(null);
  /**
   * 명단에서 찾을 때 쓰는 검색어.
   *
   * 아흔 명을 가로로 밀어서 찾는 건 처음 한 번이 특히 고생이다 — 별명이 아직 하나도
   * 안 쌓였을 때는 이어 줄 사람이 여럿이라 그만큼 밀어야 한다. 두어 글자만 쳐도
   * 후보가 몇 명으로 줄어든다.
   */
  const [pickerQuery, setPickerQuery] = useState('');

  useEffect(() => {
    /*
     * 참석 탭에서 고른 사진을 들고 들어온다. 브라우저는 "사용자가 누른 그 순간"이
     * 아니면 사진첩을 안 열어 줘서, 여는 건 버튼 쪽에서 하고 고른 것만 넘겨받는다.
     */
    const handed = takeHandedPhotos();
    if (handed) setPhotos(handed);
    /*
     * AI 서버는 무료 플랜이라 15분 놀면 잠든다. 깨는 데 30~60초라, 분석을 누른 다음에
     * 깨우기 시작하면 그 시간을 사람이 다 기다린다. 화면을 여는 순간 미리 찔러 둔다.
     */
    wakeAiServer();
  }, []);

  /*
   * 명단은 활동 회원 전체를 보낸다. availableMembers 는 "그 경기에 뛸 수 있는 사람"이라
   * 이미 불참으로 찍힌 사람이 빠지는데, 투표 화면에는 그 사람도 이름이 나온다.
   * 빠진 채로 보내면 그 사람만 조용히 unmatched 가 된다.
   */
  const members = useMemo(() => (data ? data.members.filter((one) => one.active) : []), [data]);
  const byId = useMemo(() => new Map(members.map((one) => [one.id, one])), [members]);

  if (!data) return null;
  const match = data.matches.find((one) => one.id === activeMatchId) ?? null;

  /** AI 에 실제로 가는 장수. 긴 캡처는 한 장이 여러 조각이 된다. */
  const sliceCount = photos.reduce((sum, photo) => sum + photo.parts.length, 0);

  async function attach(source: 'camera' | 'library') {
    setError(null);
    try {
      const photo = await pickPhoto(source);
      if (photo) setPhotos((prev) => [...prev, photo].slice(0, MAX_PHOTOS));
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
        // 글은 보내지 않는다. 이 화면은 투표 화면을 옮겨 적는 일만 한다.
        text: '',
        photos: photos.map((photo) =>
          photo.parts.map((part) => ({ mediaType: photo.mediaType, data: part.base64 })),
        ),
        members,
        team: data!.team,
        hint: 'attendance',
        onProgress: setProgress,
      });
      const attendance = response.items.filter((item) => item.kind === 'attendance');
      setResult({ ...response, items: attendance });
      // 사람을 특정한 것만 미리 켜 둔다. 못 찾은 건 사람이 보고 정한다.
      setChecked(
        new Set(attendance.map((item, at) => (item.memberId ? at : -1)).filter((at) => at >= 0)),
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '분석하지 못했어요. 다시 시도해 주세요.');
      setErrorDetail(detailOf(caught));
      setShowDetail(false);
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  async function commit() {
    if (!result || !match) return;
    setBusy(true);
    setError(null);
    setErrorDetail(null);
    // 앞서 남은 오류가 있으면 이번 결과와 헷갈린다.
    clearStoreError();
    try {
      /*
       * 상태별로 모아서 한 번에 보낸다. 한 명씩 부르면 아흔 명일 때 왕복이 아흔 번이고,
       * 중간에 하나가 실패하면 어디까지 저장됐는지 알 수 없다.
       */
      const buckets = new Map<string, string[]>();
      for (const [at, item] of result.items.entries()) {
        if (!checked.has(at) || item.kind !== 'attendance') continue;

        // links 는 인덱스 접근이라 없는 줄이면 undefined 다. null 로 맞춰 둔다.
        let memberId: string | null = item.memberId ?? links[at] ?? null;

        // 사람이 "이 사람이에요"로 이어 준 이름은 그 회원의 별명으로 남긴다.
        if (!item.memberId && links[at]) {
          const member = byId.get(links[at]);
          const alias = item.memberName.trim();
          if (member && alias && !member.aliases.includes(alias)) {
            await updateMember({ ...member, aliases: [...member.aliases, alias] });
          }
        }

        // 명단에 없던 사람은 새로 만든다. 만든 회원에게 바로 참석이 붙는다.
        if (!memberId && asNew.has(at)) {
          const created = await addMember({
            name: item.memberName.trim(),
            ...blankMemberFields(),
          });
          memberId = created?.id ?? null;
        }

        if (!memberId) continue;
        const list = buckets.get(item.status) ?? [];
        list.push(memberId);
        buckets.set(item.status, list);
      }

      for (const [status, ids] of buckets) {
        // 미투표는 "줄이 없음"이다. 새 상태를 쓰는 게 아니라 있던 줄을 지운다.
        if (status === 'pending') await clearAttendance(match.id, ids);
        else await setAttendanceMany(match.id, ids, status as AttendanceStatus);
      }

      /*
       * 스토어는 저장이 실패해도 던지지 않는다. 화면을 먼저 바꿔 두고(낙관적 갱신)
       * 오류는 error 에 담아만 둔다. 그래서 여기서 확인하지 않으면 **실패했는데도
       * "저장했어요" 하고 화면이 닫힌다.** 실제로 그렇게 아흔 명이 통째로 날아갔다 —
       * 화면에는 저장된 것처럼 보이고, 다시 들어가면 하나도 없었다.
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

  const grouped = useMemo(() => {
    if (!result) return [];
    return GROUPS.map((group) => ({
      ...group,
      rows: result.items
        .map((item, at) => ({ item, at }))
        .filter(({ item }) => item.kind === 'attendance' && item.status === group.status),
    })).filter((group) => group.rows.length);
  }, [result]);

  /**
   * 검색어로 걸러 낸 후보. 아무것도 안 쳤으면 전원이다.
   * 이름·별명·등번호 어느 쪽으로 쳐도 걸린다 — 총무가 기억하는 게 그중 하나뿐일 수 있다.
   */
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

  const pickedCount = checked.size;

  return (
    <Screen scroll>
      {!result ? (
        <>
          {/* 어느 경기에 들어가는지 먼저 말한다. 올린 뒤에 알면 되돌리는 비용이 크다. */}
          <Card>
            {match ? (
              <>
                <Txt variant="h3">{formatDate(match.date)} 경기에 들어가요</Txt>
                <Txt variant="tiny" muted>
                  다른 날짜에 놓으려면 참석 탭에서 날짜를 먼저 고르고 오세요
                </Txt>
              </>
            ) : (
              <Txt variant="small" color={p.danger}>
                반영할 경기가 없어요. 참석 탭에서 날짜를 먼저 고르고 와 주세요.
              </Txt>
            )}
          </Card>

          <Row gap={space.sm}>
            <Button
              label={photos.length ? '사진 더 찍기' : '사진 찍기'}
              icon="camera"
              tone="neutral"
              style={{ flex: 1 }}
              disabled={photos.length >= MAX_PHOTOS}
              onPress={() => attach('camera')}
            />
            <Button
              label={photos.length ? '사진 더 고르기' : '사진첩에서'}
              icon="image"
              tone="neutral"
              style={{ flex: 1 }}
              disabled={photos.length >= MAX_PHOTOS}
              onPress={() => attach('library')}
            />
          </Row>

          {photos.length ? (
            <Card>
              <Txt variant="small" muted>
                아래 선택한 사진
              </Txt>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <Row gap={space.sm}>
                  {photos.map((photo, at) => (
                    <Pressable
                      key={at}
                      onPress={() => setPhotos((prev) => prev.filter((_, i) => i !== at))}
                      accessibilityRole="button"
                      accessibilityLabel={`${at + 1}번째 사진 빼기`}
                    >
                      <Image
                        source={{ uri: photo.uri }}
                        style={{
                          width: 92,
                          height: 92,
                          borderRadius: radius.sm,
                          borderWidth: 1,
                          borderColor: p.border,
                        }}
                      />
                      <Row gap={4} style={{ marginTop: 4, justifyContent: 'center' }}>
                        <Icon name="close" size={12} color={p.textMuted} />
                        <Txt variant="tiny" muted>
                          빼기
                        </Txt>
                      </Row>
                    </Pressable>
                  ))}
                </Row>
              </ScrollView>
              {sliceCount > photos.length ? (
                <Txt variant="tiny" muted>
                  긴 캡처라 {sliceCount}조각으로 나눠 읽어요
                </Txt>
              ) : null}
            </Card>
          ) : (
            <Card>
              <Txt variant="small" muted>
                카톡 투표 현황 화면을 찍어 올리면 참석·불참·미투표를 읽어요. 항목별 탭과 미참여 탭을
                각각 올리면 둘 다 채워져요.
              </Txt>
            </Card>
          )}

          {error ? (
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
          ) : null}

          <Button
            label={photos.length ? `사진 ${photos.length}장과 함께 분석하기` : '사진을 먼저 올려주세요'}
            loading={busy}
            disabled={!photos.length || !match}
            onPress={runParse}
          />

          {busy && progress && progress.total > 1 ? (
            <Txt variant="tiny" muted style={{ textAlign: 'center' }}>
              {`${progress.total}장 중 ${progress.done}장 읽었어요`}
            </Txt>
          ) : null}

          {isLocalRepo ? (
            <Txt variant="tiny" muted style={{ textAlign: 'center' }}>
              데모 모드에서는 사진을 읽지 못해요. Supabase를 연결하면 Claude가 투표 화면을 읽어요.
            </Txt>
          ) : null}

          <Txt variant="tiny" muted style={{ textAlign: 'center' }}>
            {`앱 판 ${BUILD_ID}`}
          </Txt>
        </>
      ) : (
        <>
          <Card>
            <Txt variant="h3">{result.summary || '이렇게 읽었어요'}</Txt>
            {match ? (
              <Txt variant="tiny" muted>
                {formatDate(match.date)} 경기에 들어가요
              </Txt>
            ) : null}
            {result.unmatched.length ? (
              <Row wrap gap={space.sm}>
                <Txt variant="tiny" muted>
                  명단에서 못 찾은 이름:
                </Txt>
                {result.unmatched.map((name) => (
                  <Chip key={name} label={name} tone={{ fg: p.warn, bg: p.warnSoft }} />
                ))}
              </Row>
            ) : null}
          </Card>

          {grouped.length === 0 ? (
            <Card>
              <Txt variant="small" muted>
                읽어낼 이름을 찾지 못했어요. 화면을 더 밝은 데서 다시 찍거나, 긴 화면은 나눠서 찍어
                주세요.
              </Txt>
            </Card>
          ) : (
            grouped.map((group) => {
              const all = group.rows.every(({ at }) => checked.has(at));
              return (
                <Card key={group.status} style={{ padding: space.sm, gap: 0 }}>
                  <Row style={{ padding: space.sm }} gap={space.md}>
                    <Txt variant="h3" style={{ flex: 1 }}>
                      {group.label} {group.rows.length}명
                    </Txt>
                    <Chip
                      label={all ? '전체 빼기' : '전체 넣기'}
                      onPress={() =>
                        setChecked((prev) => {
                          const next = new Set(prev);
                          for (const { at, item } of group.rows) {
                            if (all) next.delete(at);
                            else if (item.kind === 'attendance' && (item.memberId || links[at] || asNew.has(at)))
                              next.add(at);
                          }
                          return next;
                        })
                      }
                    />
                  </Row>
                  {group.rows.map(({ item, at }) => (
                    <View key={at}>
                      <Divider />
                      <Pressable
                        onPress={() =>
                          setChecked((prev) => {
                            const next = new Set(prev);
                            if (next.has(at)) next.delete(at);
                            else next.add(at);
                            return next;
                          })
                        }
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: checked.has(at) }}
                        accessibilityLabel={nameOf(item, byId)}
                      >
                        <Row style={{ padding: space.sm }} gap={space.md}>
                          {/* 네모는 보여 주기만 한다. 둘 다 반응하면 두 번 토글돼 아무 일도 안 일어난다. */}
                          <View
                            pointerEvents="none"
                            accessibilityElementsHidden
                            importantForAccessibility="no-hide-descendants"
                          >
                            <Checkbox checked={checked.has(at)} onToggle={() => {}} />
                          </View>
                          <View style={{ flex: 1, gap: 2 }}>
                            <Txt variant="body">{nameOf(item, byId)}</Txt>
                            {!item.memberId && links[at] ? (
                              <Txt variant="tiny" muted>
                                {`${byId.get(links[at])?.name ?? ''} 로 넣고, 이 이름을 별명으로 기억해요`}
                              </Txt>
                            ) : !item.memberId && asNew.has(at) ? (
                              <Txt variant="tiny" muted>
                                새 회원으로 만들어서 넣어요
                              </Txt>
                            ) : null}
                          </View>
                        </Row>
                      </Pressable>

                      {/*
                        명단에서 못 찾은 이름은 여기서 끝내야 한다. 회색 칩으로 보여 주기만 하면
                        그 사람은 매주 조용히 빠진다. 한 번 이어 주면 별명으로 남아 다음부터 안 묻는다.
                      */}
                      {item.kind === 'attendance' && !item.memberId ? (
                        <View style={{ paddingHorizontal: space.sm, paddingBottom: space.sm, gap: space.xs }}>
                          <Row wrap gap={space.sm}>
                            <Chip
                              label={links[at] ? '다시 고르기' : '명단에서 고르기'}
                              tone={links[at] ? undefined : { fg: p.warn, bg: p.warnSoft }}
                              onPress={() => {
                                setPickerAt(pickerAt === at ? null : at);
                                // 앞 사람 찾던 말이 남아 있으면 후보가 이상하게 걸러진다.
                                setPickerQuery('');
                              }}
                            />
                            <Chip
                              label={asNew.has(at) ? '새 회원 취소' : '새 회원으로 추가'}
                              tone={asNew.has(at) ? undefined : { fg: p.warn, bg: p.warnSoft }}
                              onPress={() => {
                                setAsNew((prev) => {
                                  const next = new Set(prev);
                                  if (next.has(at)) next.delete(at);
                                  else next.add(at);
                                  return next;
                                });
                                setLinks((prev) => {
                                  const next = { ...prev };
                                  delete next[at];
                                  return next;
                                });
                                setPickerAt(null);
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
                                  그런 이름이 명단에 없어요. 새 회원으로 추가할 수도 있어요.
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
                                      tone={
                                        links[at] === member.id
                                          ? { fg: p.primaryStrong, bg: p.primarySoft }
                                          : undefined
                                      }
                                      onPress={() => {
                                        setLinks((prev) => ({ ...prev, [at]: member.id }));
                                        setAsNew((prev) => {
                                          const next = new Set(prev);
                                          next.delete(at);
                                          return next;
                                        });
                                        setChecked((prev) => new Set(prev).add(at));
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
                      ) : null}
                    </View>
                  ))}
                </Card>
              );
            })
          )}

          {error ? (
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
                      onPress={() => shareText(errorDetail, '저장 실패 원인')}
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
          ) : null}

          <Button
            label={pickedCount ? `${pickedCount}명 저장하기` : '저장할 사람을 골라주세요'}
            loading={busy}
            disabled={!pickedCount}
            onPress={commit}
          />
          <Button
            label="사진 다시 올리기"
            tone="neutral"
            onPress={() => {
              setResult(null);
              setPhotos([]);
              setChecked(new Set());
            }}
          />
        </>
      )}
    </Screen>
  );
}

/**
 * 저장이 왜 막혔는지 사람 말로 옮긴다.
 *
 * 제일 흔한 건 권한이다. 참석 표는 "운영진이거나 자기 자신"만 쓸 수 있어서, 내 회원 줄의
 * 역할이 선수(player)면 남의 참석은 한 줄도 안 들어간다. 영어 원문만 보여 주면
 * 무엇을 해야 하는지 알 수 없다.
 */
function explainSaveFailure(raw: string): string {
  if (/row-level security|violates row-level|42501|permission denied/i.test(raw)) {
    return '저장할 권한이 없어요. 남의 참석은 감독·코치·총무만 바꿀 수 있어요. 팀 운영진에게 역할을 올려 달라고 해 주세요.';
  }
  if (/failed to fetch|network/i.test(raw)) {
    return '서버에 닿지 못했어요. 인터넷을 확인하고 다시 눌러 주세요.';
  }
  return `저장하지 못했어요. (${raw.slice(0, 120)})`;
}

function nameOf(item: ParsedItem, byId: Map<string, { name: string }>): string {
  const resolved = item.memberId ? byId.get(item.memberId) : undefined;
  return resolved?.name ?? (item.memberName || '이름 없음');
}
