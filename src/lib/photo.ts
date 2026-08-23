import { Alert, Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

/** Claude 에 보내는 한 장. 긴 캡처는 여러 장으로 잘려 나간다. */
export type PhotoPart = {
  /** data: 접두사 없는 base64. */
  base64: string;
  width: number;
  height: number;
};

/** 화면에 띄우고 AI에 보낼 준비까지 끝난 사진. */
export type PickedPhoto = {
  /** 미리보기용. 네이티브는 파일 URI, 웹은 blob/data URI. */
  uri: string;
  /** Claude 에 보낼 원본 없는 base64 (data: 접두사 없음). */
  base64: string;
  mediaType: 'image/jpeg';
  width: number;
  height: number;
  /**
   * AI 에 보낼 조각들. 보통은 자기 자신 한 장이고, 긴 캡처만 여러 장이 된다.
   * 화면에는 사진 하나로 보이고 미리보기도 하나다 — 사람에게는 한 장이 맞다.
   */
  parts: PhotoPart[];
};

/**
 * Claude 는 긴 변이 1568px 를 넘으면 어차피 줄여서 본다.
 * 미리 줄여 보내면 업로드가 빨라지고 토큰도 덜 든다.
 */
const MAX_EDGE = 1568;

/*
 * 카톡 투표 현황 캡처는 아주 길다 — 폭 1080 에 높이가 3천을 넘는다.
 * 그걸 "긴 변 1568" 규칙으로 줄이면 폭이 480 언저리가 되어 이름 글자가 뭉개진다.
 * 실제로 아흔 명 명단에서 이름을 자꾸 틀리게 읽은 원인이 이것이다.
 *
 * 그래서 길쭉한 사진은 줄이지 않고 가로로 잘라서 여러 장으로 보낸다.
 * 조각끼리 조금 겹쳐 두면 경계에 걸린 줄이 어느 한쪽에는 온전히 들어간다.
 */
/** 세로가 가로의 이 배를 넘으면 자른다. */
const SLICE_RATIO = 1.4;
/** 조각 하나의 세로 = 가로 × 이 값. 1568 을 넘지 않게 잡는다. */
const TILE_RATIO = 1.3;
/** 조각끼리 겹치는 비율. 경계에 걸린 줄을 살린다. */
const OVERLAP = 0.08;
/** 조각이 이보다 많아지면 조각을 키워서 수를 맞춘다. 토큰이 무한정 늘면 안 된다. */
const MAX_TILES = 6;
/** 프로필 사진은 작게 써서 더 줄인다. */
const AVATAR_EDGE = 512;

export type PhotoSource = 'camera' | 'library';

async function ensurePermission(source: PhotoSource): Promise<boolean> {
  // 웹은 브라우저의 파일 선택 대화상자가 권한을 대신 물어본다.
  if (Platform.OS === 'web') return true;

  const result =
    source === 'camera'
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();

  if (result.granted) return true;

  Alert.alert(
    source === 'camera' ? '카메라를 쓸 수 없어요' : '사진첩을 열 수 없어요',
    '설정에서 이 앱의 접근을 허용해 주세요.',
  );
  return false;
}

/**
 * 카메라로 찍거나 사진첩에서 고른다. 취소하면 null.
 * 웹에서는 둘 다 파일 선택 대화상자로 열리고, 모바일 브라우저는 거기서 촬영을 제안한다.
 */
export async function pickPhoto(
  source: PhotoSource,
  options?: {
    avatar?: boolean;
    /**
     * 자르지 않고 통째로 한 장으로 보낸다.
     *
     * 화이트보드 사진은 **배치가 곧 내용**이다 — 위쪽 덩어리가 A팀, 아래쪽이 B팀이고,
     * 자기 골문에서 먼 줄일수록 공격이다. 이걸 가로로 자르면 아랫조각은 하프라인도
     * 골문도 없는 띠 한 장이 되어, 어느 팀 어느 줄인지 알 방법이 사라진다.
     *
     * 자르기는 원래 긴 카톡 캡처의 **작은 글씨**를 살리려고 있는 것이다. 판의 자석 글씨는
     * 크고, 줄여도 긴 변이 1568 안에 들어와서 잘라 봐야 얻을 게 없다.
     */
    whole?: boolean;
  },
): Promise<PickedPhoto | null> {
  if (!(await ensurePermission(source))) return null;

  const common: ImagePicker.ImagePickerOptions = {
    mediaTypes: ['images'],
    // 프로필 사진만 정사각형으로 자르게 한다. 명단 사진은 잘리면 글자가 날아간다.
    allowsEditing: options?.avatar ?? false,
    aspect: options?.avatar ? [1, 1] : undefined,
    quality: 1,
    exif: false,
  };

  const result =
    source === 'camera'
      ? await ImagePicker.launchCameraAsync(common)
      : await ImagePicker.launchImageLibraryAsync(common);

  if (result.canceled || !result.assets.length) return null;
  return compress(
    result.assets[0].uri,
    options?.avatar ? AVATAR_EDGE : MAX_EDGE,
    options?.whole ?? false,
  );
}

async function compress(uri: string, maxEdge: number, whole = false): Promise<PickedPhoto> {
  const context = ImageManipulator.manipulate(uri);
  // 가로가 긴 사진이든 세로가 긴 사진이든 긴 변만 제한하면 비율은 알아서 유지된다.
  const rendered = await context.renderAsync();
  const longEdge = Math.max(rendered.width, rendered.height);

  const target =
    longEdge > maxEdge
      ? rendered.width >= rendered.height
        ? { width: maxEdge }
        : { height: maxEdge }
      : null;

  const final = target ? await ImageManipulator.manipulate(uri).resize(target).renderAsync() : rendered;
  const saved = await final.saveAsync({ compress: 0.7, format: SaveFormat.JPEG, base64: true });

  const photo = {
    uri: saved.uri,
    base64: saved.base64 ?? '',
    mediaType: 'image/jpeg' as const,
    width: saved.width,
    height: saved.height,
  };

  return {
    ...photo,
    // 길쭉한 원본은 줄인 것 대신 잘라 낸 조각들을 보낸다. 미리보기는 줄인 것 그대로.
    parts:
      !whole && rendered.height / rendered.width > SLICE_RATIO
        ? await slice(uri, rendered.width, rendered.height)
        : [{ base64: photo.base64, width: photo.width, height: photo.height }],
  };
}

/**
 * 길쭉한 캡처를 가로로 잘라 여러 장으로 만든다.
 * 조각은 원본 해상도를 그대로 쓰되, 폭이 1568 을 넘으면 그때만 줄인다.
 */
async function slice(uri: string, width: number, height: number): Promise<PhotoPart[]> {
  /*
   * 조각도 긴 변이 1568 을 넘으면 Claude 가 다시 줄인다. 그러면 잘라 낸 보람이 없다.
   * 폭을 줄여야 하는 사진이면 그 비율만큼 세로 상한도 같이 내려 잡는다.
   */
  const scale = width > MAX_EDGE ? MAX_EDGE / width : 1;
  const cap = Math.floor(MAX_EDGE / scale);
  let tileHeight = Math.min(Math.round(width * TILE_RATIO), cap);
  let step = Math.round(tileHeight * (1 - OVERLAP));
  /*
   * 그래도 조각이 너무 많아지면 조각을 키운다. 이때는 상한을 넘겨도 둔다 —
   * 조금 줄어드는 것보다 화면 일부가 통째로 빠지는 쪽이 훨씬 나쁘다.
   */
  if (Math.ceil(height / step) > MAX_TILES) {
    step = Math.ceil(height / MAX_TILES);
    tileHeight = Math.round(step / (1 - OVERLAP));
  }

  /*
   * 앞 조각이 이 조각의 시작점 아래로 얼마나 더 덮고 있는지. 겹치는 만큼이다.
   * 남은 자투리가 이 안에 들어오면 앞 조각에 이미 다 있으니 건너뛴다.
   */
  const covered = tileHeight - step;

  const parts: PhotoPart[] = [];
  for (let top = 0; top < height; top += step) {
    const cropHeight = Math.min(tileHeight, height - top);
    /*
     * 전에는 "자투리가 조각 높이의 20% 미만이면 버린다"였다. 그런데 앞 조각이 덮는 건
     * 겹침(8%)뿐이라, 그 사이 12% 가 통째로 사라졌다 — 1080폭이면 168px, 이름 한두 줄이다.
     * 하필 카톡 투표 화면은 불참이 맨 아래에 있어서 불참만 골라 빠졌다.
     */
    if (parts.length && height - top <= covered) break;

    let piece = ImageManipulator.manipulate(uri).crop({
      originX: 0,
      originY: top,
      width,
      height: cropHeight,
    });
    if (width > MAX_EDGE) piece = piece.resize({ width: MAX_EDGE });

    const saved = await (await piece.renderAsync()).saveAsync({
      compress: 0.8,
      format: SaveFormat.JPEG,
      base64: true,
    });
    parts.push({ base64: saved.base64 ?? '', width: saved.width, height: saved.height });
  }
  return parts;
}

/** 프로필 사진처럼 저장해 두고 다시 보여줘야 하는 경우에 쓰는 data URI. */
export function toDataUri(photo: PickedPhoto): string {
  return `data:${photo.mediaType};base64,${photo.base64}`;
}
