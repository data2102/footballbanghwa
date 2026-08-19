import { Alert, Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

/** 화면에 띄우고 AI에 보낼 준비까지 끝난 사진. */
export type PickedPhoto = {
  /** 미리보기용. 네이티브는 파일 URI, 웹은 blob/data URI. */
  uri: string;
  /** Claude 에 보낼 원본 없는 base64 (data: 접두사 없음). */
  base64: string;
  mediaType: 'image/jpeg';
  width: number;
  height: number;
};

/**
 * Claude 는 긴 변이 1568px 를 넘으면 어차피 줄여서 본다.
 * 미리 줄여 보내면 업로드가 빨라지고 토큰도 덜 든다.
 */
const MAX_EDGE = 1568;
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
  options?: { avatar?: boolean },
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
  return compress(result.assets[0].uri, options?.avatar ? AVATAR_EDGE : MAX_EDGE);
}

async function compress(uri: string, maxEdge: number): Promise<PickedPhoto> {
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

  return {
    uri: saved.uri,
    base64: saved.base64 ?? '',
    mediaType: 'image/jpeg',
    width: saved.width,
    height: saved.height,
  };
}

/** 프로필 사진처럼 저장해 두고 다시 보여줘야 하는 경우에 쓰는 data URI. */
export function toDataUri(photo: PickedPhoto): string {
  return `data:${photo.mediaType};base64,${photo.base64}`;
}
