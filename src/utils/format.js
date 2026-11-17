/**
 * 6자리 숫자 수업방 코드를 생성합니다. (예: "823509")
 */
export function generateRoomCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

/**
 * 선생님 권한을 확인하기 위한 비밀 키를 생성합니다.
 */
export function generateTeacherKey() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * ISO 날짜 문자열을 한국어 시간 형식으로 변환합니다. (예: "오후 8:01")
 */
export function formatKoreanTime(isoString) {
  const date = new Date(isoString);
  return date.toLocaleTimeString('ko-KR', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

/**
 * 바이트 단위 파일 크기를 읽기 쉬운 문자열로 변환합니다.
 */
export function formatFileSize(bytes) {
  if (!bytes && bytes !== 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * 입력된 텍스트가 단일 URL인지 판별합니다.
 */
export function isSingleUrl(text) {
  const trimmed = text.trim();
  return /^https?:\/\/[^\s]+$/i.test(trimmed);
}
