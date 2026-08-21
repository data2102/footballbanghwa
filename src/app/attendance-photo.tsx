import { useEffect, useMemo, useState } from 'react';
import { Image, Pressable, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useStore } from '@/lib/store';
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

  const [photos, setPhotos] = useState<PickedPhoto[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<ParseProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errorDetail, setErrorDetail] = useState<string | null>(null);
  const [showDetail, setShowDetail] = useState(false);
  const [result, setResult] = useState<ParseResponse | null>(null);
  const [checked, setChecked] = useState<Set<number>>(new Set());

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
    try {
      /*
       * 상태별로 모아서 한 번에 보낸다. 한 명씩 부르면 아흔 명일 때 왕복이 아흔 번이고,
       * 중간에 하나가 실패하면 어디까지 저장됐는지 알 수 없다.
       */
      const buckets = new Map<string, string[]>();
      result.items.forEach((item, at) => {
        if (!checked.has(at) || item.kind !== 'attendance' || !item.memberId) return;
        const list = buckets.get(item.status) ?? [];
        list.push(item.memberId);
        buckets.set(item.status, list);
      });

      for (const [status, ids] of buckets) {
        // 미투표는 "줄이 없음"이다. 새 상태를 쓰는 게 아니라 있던 줄을 지운다.
        if (status === 'pending') await clearAttendance(match.id, ids);
        else await setAttendanceMany(match.id, ids, status as AttendanceStatus);
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
                            else if (item.kind === 'attendance' && item.memberId) next.add(at);
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
                          <Txt variant="body" style={{ flex: 1 }}>
                            {nameOf(item, byId)}
                          </Txt>
                          {item.kind === 'attendance' && !item.memberId ? (
                            <Chip label="명단에 없음" tone={{ fg: p.danger, bg: p.dangerSoft }} />
                          ) : null}
                        </Row>
                      </Pressable>
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

function nameOf(item: ParsedItem, byId: Map<string, { name: string }>): string {
  const resolved = item.memberId ? byId.get(item.memberId) : undefined;
  return resolved?.name ?? (item.memberName || '이름 없음');
}
