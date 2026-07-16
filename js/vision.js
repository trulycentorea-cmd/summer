// 카메라 영상에서 얼굴을 찾아 "정면을 보는가(눈맞춤)"와 "몸을 흔드는가(자세)"를 측정한다.
// MediaPipe Face Landmarker(구글의 얼굴 인식 모델)를 CDN에서 불러다 쓴다. → 인터넷이 필요하다.

import { FilesetResolver, FaceLandmarker }
  from 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35';

const CDN_WASM = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm';
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

// MediaPipe가 찾아주는 얼굴 점 468개 중 우리가 쓰는 것들의 고정 번호.
const NOSE = 1;      // 코끝
const EYE_L = 33;    // 왼쪽 눈 바깥쪽
const EYE_R = 263;   // 오른쪽 눈 바깥쪽
const FACE_L = 234;  // 얼굴 왼쪽 가장자리
const FACE_R = 454;  // 얼굴 오른쪽 가장자리

/* ─── 보정이 필요한 기준값 ───────────────────────────────────────────
   사람 얼굴 생김새와 카메라 높이에 따라 달라진다. 발표 화면에서 F12(개발자도구)
   콘솔을 열면 실시간 yaw/pitch가 찍히니, 정면을 볼 때의 값을 보고 맞추면 된다.
   (개발계획.md의 "눈맞춤 보정 절차" 참고)                                     */
const YAW_LIMIT = 0.10;   // 코가 얼굴 중앙에서 이만큼 이상 벗어나면 고개를 돌린 것
const PITCH_MIN = 0.13;   // 눈~코 거리가 이보다 짧아지면 고개를 숙인 것
/* ──────────────────────────────────────────────────────────────── */

const MIN_SAMPLES = 15;   // 이보다 적게 측정됐으면 결과를 믿지 않는다

/**
 * 얼굴 점들로 고개 방향을 계산한다. (순수 함수 — 카메라 없이 테스트할 수 있다)
 * @param {Array<{x:number,y:number}>} face MediaPipe가 준 얼굴 점 배열
 * @returns {{yaw:number, pitch:number, forward:boolean, centerX:number, faceWidth:number}|null}
 */
export function analyzeFace(face) {
  const nose = face[NOSE], faceL = face[FACE_L], faceR = face[FACE_R];
  const eyeL = face[EYE_L], eyeR = face[EYE_R];
  if (!nose || !faceL || !faceR || !eyeL || !eyeR) return null;

  const faceWidth = Math.abs(faceR.x - faceL.x);
  if (faceWidth < 0.01) return null;  // 얼굴이 너무 작으면 값이 튄다

  const centerX = (faceL.x + faceR.x) / 2;

  // 고개를 좌우로 돌리면 코끝이 얼굴 중앙에서 벗어난다.
  const yaw = (nose.x - centerX) / faceWidth;

  // 고개를 숙이면 눈~코끝 거리가 화면상에서 짧아 보인다(원근 때문).
  // 얼굴 높이가 아니라 너비로 나눈다. 고개를 숙이면 높이 자체가 줄어들어
  // 분모와 분자가 같이 작아지면서 변화를 못 잡아내기 때문이다.
  const eyeMidY = (eyeL.y + eyeR.y) / 2;
  const pitch = (nose.y - eyeMidY) / faceWidth;

  const forward = Math.abs(yaw) <= YAW_LIMIT && pitch >= PITCH_MIN;
  return { yaw, pitch, forward, centerX, faceWidth };
}

/**
 * 발표 내내 모은 샘플을 최종 점수 재료로 요약한다. (순수 함수)
 * @param {Array<{forward:boolean, centerX:number|null, faceWidth:number|null}>} samples
 */
export function summarize(samples) {
  const seen = samples.filter(s => s.centerX !== null);

  // 표본이 너무 적으면(카메라가 늦게 켜졌거나 발표가 짧으면) 신뢰할 수 없다.
  if (samples.length < MIN_SAMPLES || seen.length < 10) {
    return { eyeContactRatio: 0, swayRatio: 0, ok: false };
  }

  const eyeContactRatio = samples.filter(s => s.forward).length / samples.length;

  // 몸을 흔들면 얼굴 중심이 좌우로 움직인다. 그 흔들림을 얼굴 너비로 나눠서
  // 카메라와의 거리에 상관없는 값으로 만든다.
  const swayRatio = stdDev(seen.map(s => s.centerX)) / mean(seen.map(s => s.faceWidth));

  return { eyeContactRatio, swayRatio, ok: true };
}

export class FaceWatcher {
  constructor() {
    this.samples = [];
    this.live = null;        // 보정용 실시간 값
    this._landmarker = null;
    this._running = false;
    this._lastVideoTime = -1;
  }

  /** 모델을 내려받는다. 시간이 걸리므로 발표 시작 전에 미리 부른다. */
  async load() {
    const fileset = await FilesetResolver.forVisionTasks(CDN_WASM);
    this._landmarker = await FaceLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: MODEL_URL, delegate: 'GPU' },
      runningMode: 'VIDEO',
      numFaces: 1,
    });
  }

  get isReady() { return Boolean(this._landmarker); }

  start(video) {
    if (!this._landmarker) return;
    this._running = true;
    this.samples = [];
    // 새 발표는 영상 시간이 0부터 다시 시작한다. 지난 발표의 값이 남아 있으면
    // 첫 프레임을 "이미 본 프레임"으로 착각해 건너뛸 수 있다.
    this._lastVideoTime = -1;

    const loop = () => {
      if (!this._running) return;
      this._detect(video);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  _detect(video) {
    if (video.readyState < 2) return;
    // 같은 프레임을 두 번 넣으면 MediaPipe가 오류를 낸다. 새 프레임일 때만 분석한다.
    if (video.currentTime === this._lastVideoTime) return;
    this._lastVideoTime = video.currentTime;

    let result;
    try {
      result = this._landmarker.detectForVideo(video, performance.now());
    } catch {
      return;
    }

    const face = result.faceLandmarks?.[0];
    if (!face) {
      // 얼굴이 안 보이면 정면을 안 본 것으로 센다. (아이가 아예 돌아선 경우)
      this.samples.push({ forward: false, centerX: null, faceWidth: null });
      return;
    }

    const m = analyzeFace(face);
    if (!m) return;

    this.samples.push({ forward: m.forward, centerX: m.centerX, faceWidth: m.faceWidth });
    this.live = m;
  }

  stop() {
    this._running = false;
    this.live = null;
    // 모델은 닫지 않고 살려둔다. 여기서 close()하면 두 번째 발표부터 눈맞춤이
    // 측정되지 않고, 다시 만드는 데 몇 초가 걸린다. (앱을 닫으면 알아서 정리된다)
    return summarize(this.samples);
  }
}

function mean(xs) {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function stdDev(xs) {
  const m = mean(xs);
  return Math.sqrt(mean(xs.map(x => (x - m) ** 2)));
}
