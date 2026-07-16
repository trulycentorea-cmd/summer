// 측정한 원본 숫자(dB, 음절/분 등)를 1~5 별점으로 바꾼다.
//
// ⚠️ 여기 숫자들은 초등 저학년을 기준으로 잡은 출발점이다.
//    실제 교실에서 아이들이 발표해보고 반드시 조정해야 한다. 조정은 이 파일만 고치면 된다.

export const ELEMENTS = [
  { key: 'confidence', name: '자신감', emoji: '😊' },
  { key: 'voice',      name: '목소리', emoji: '🎤' },
  { key: 'speed',      name: '속도',   emoji: '🐢' },
  { key: 'posture',    name: '자세',   emoji: '🧍' },
  { key: 'eyeContact', name: '눈맞춤', emoji: '👀' },
];

// --- 기준값 ---
const VOICE_MIN_DB = -50;   // ⭐1
const VOICE_MAX_DB = -20;   // ⭐5
const SPEED_IDEAL_MIN = 200; // 음절/분. 이 구간 안이면 ⭐5
const SPEED_IDEAL_MAX = 280;
const SPEED_PENALTY_PER_STAR = 25; // 구간 밖으로 25음절/분 벗어날 때마다 별 1개 감점
const EYE_MIN_RATIO = 0.2;  // ⭐1
const EYE_MAX_RATIO = 0.8;  // ⭐5
const SWAY_STILL = 0.02;    // ⭐5 (얼굴 너비 대비 흔들림 비율)
const SWAY_MAX   = 0.12;    // ⭐1

/**
 * @param {object} raw 측정 원본값
 * @returns {object} 요소별 별점(1~5). 측정하지 못한 요소는 null.
 */
export function calcScores(raw) {
  const voice = raw.voiceOk ? linear(raw.avgDb, VOICE_MIN_DB, VOICE_MAX_DB) : null;
  const speed = raw.speedOk ? speedScore(raw.syllablesPerMin) : null;

  const eyeContact = raw.visionOk ? linear(raw.eyeContactRatio, EYE_MIN_RATIO, EYE_MAX_RATIO) : null;
  // 흔들림은 작을수록 좋으므로 기준을 뒤집어 넣는다.
  const posture = raw.visionOk ? linear(raw.swayRatio, SWAY_MAX, SWAY_STILL) : null;

  return {
    confidence: confidenceScore({ voice, speed, eyeContact }, raw.silenceRatio),
    voice, speed, posture, eyeContact,
  };
}

/**
 * 자신감은 직접 잴 수 없다. 목소리·눈맞춤·속도를 합쳐서 추정한다.
 * 측정하지 못한 요소는 빼고 나머지 가중치로 다시 계산한다.
 */
function confidenceScore({ voice, speed, eyeContact }, silenceRatio) {
  const parts = [
    { score: voice,      weight: 0.4 },
    { score: eyeContact, weight: 0.4 },
    { score: speed,      weight: 0.2 },
  ].filter(p => p.score !== null);

  if (!parts.length) return null;

  const totalWeight = parts.reduce((sum, p) => sum + p.weight, 0);
  let value = parts.reduce((sum, p) => sum + p.score * p.weight, 0) / totalWeight;

  // 말을 못 하고 멈춰 있는 시간이 길면 자신감이 낮은 신호다.
  if (silenceRatio > 0.4) value -= 1;

  return round1to5(value);
}

/**
 * 말하기 속도가 빨랐는지 느렸는지 알려준다. 별점만으로는 방향을 알 수 없어서,
 * 결과 화면과 코치 문장이 같은 기준으로 방향을 말하도록 여기서 한 번에 정한다.
 * @returns {'fast'|'slow'|'good'} 이상 구간보다 빠르면 fast, 느리면 slow, 안이면 good
 */
export function speedDirection(spm) {
  if (spm > SPEED_IDEAL_MAX) return 'fast';
  if (spm < SPEED_IDEAL_MIN) return 'slow';
  return 'good';
}

/**
 * 속도는 "빠를수록 나쁨"이 아니라 "너무 빠르거나 너무 느리면 나쁨"이다.
 * 이상 구간(200~280음절/분) 안이면 만점, 벗어난 거리만큼 감점한다.
 */
function speedScore(spm) {
  let distance = 0;
  if (spm < SPEED_IDEAL_MIN) distance = SPEED_IDEAL_MIN - spm;
  else if (spm > SPEED_IDEAL_MAX) distance = spm - SPEED_IDEAL_MAX;

  return round1to5(5 - distance / SPEED_PENALTY_PER_STAR);
}

/** minValue일 때 ⭐1, maxValue일 때 ⭐5가 되도록 비례 변환한다. */
function linear(value, minValue, maxValue) {
  const ratio = (value - minValue) / (maxValue - minValue);
  return round1to5(1 + 4 * ratio);
}

function round1to5(v) {
  return Math.max(1, Math.min(5, Math.round(v)));
}
