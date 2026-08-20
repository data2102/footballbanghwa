import type { PickedPhoto } from '@/lib/photo';

/**
 * 한 화면에서 고른 사진을 다음 화면으로 건네주는 자리.
 *
 * 참석 탭의 "투표 사진 올리기"는 누르는 그 자리에서 사진첩을 연다. 화면을 먼저 띄우고
 * 거기서 다시 "사진첩에서"를 누르게 하면 한 번 더 누르는 셈이고, 브라우저는 애초에
 * **사용자가 누른 그 순간이 아니면 파일 선택을 열어 주지 않는다.** 그래서 여는 건
 * 버튼 쪽에서 하고, 고른 사진만 검토 화면으로 넘긴다.
 *
 * 주소(쿼리)로는 못 넘긴다 — base64 가 수백 KB 라 주소에 실을 수 없다.
 * 한 번 꺼내면 비운다. 안 비우면 다음에 그 화면을 열 때 옛 사진이 따라 들어온다.
 */
let pending: PickedPhoto[] | null = null;

export function handOffPhotos(photos: PickedPhoto[]): void {
  pending = photos.length ? photos : null;
}

export function takeHandedPhotos(): PickedPhoto[] | null {
  const photos = pending;
  pending = null;
  return photos;
}
