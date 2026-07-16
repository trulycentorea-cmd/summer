// 마이크 입력의 소리 크기(dB)를 측정한다.

/**
 * 마이크 요청 조건.
 * autoGainControl은 반드시 꺼야 한다. 켜져 있으면 브라우저가 작은 목소리를 자동으로 키워서
 * 크게 말하든 작게 말하든 비슷한 값이 나오고, "목소리 크기" 측정 자체가 무의미해진다.
 */
export const AUDIO_CONSTRAINTS = {
  autoGainControl: false,
  noiseSuppression: false,
  echoCancellation: false,
};

const SILENCE_DB = -50;   // 이보다 작으면 말하지 않는 것으로 본다
const BAR_MIN_DB = -60;   // 화면 막대 0%
const BAR_MAX_DB = -10;   // 화면 막대 100%

export class VoiceMeter {
  constructor() {
    this.samples = [];   // 측정한 dB 값들
    this.level = 0;      // 0~1, 화면 막대용
    this._timer = null;
    this._ctx = null;
  }

  start(stream) {
    this._ctx = new (window.AudioContext || window.webkitAudioContext)();
    this._ctx.resume();

    const source = this._ctx.createMediaStreamSource(stream);
    const analyser = this._ctx.createAnalyser();
    analyser.fftSize = 2048;
    source.connect(analyser);
    // analyser를 destination에 연결하지 않는다. 연결하면 내 목소리가 스피커로 나가 하울링이 생긴다.

    const buf = new Float32Array(analyser.fftSize);

    this._timer = setInterval(() => {
      analyser.getFloatTimeDomainData(buf);

      // RMS(제곱평균제곱근) = 파형의 평균적인 세기
      let sum = 0;
      for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
      const rms = Math.sqrt(sum / buf.length);
      const db = 20 * Math.log10(rms || 1e-8);

      this.samples.push(db);
      this.level = clamp01((db - BAR_MIN_DB) / (BAR_MAX_DB - BAR_MIN_DB));
    }, 50);
  }

  /** 측정을 끝내고 결과를 돌려준다. */
  stop() {
    clearInterval(this._timer);
    this._timer = null;
    if (this._ctx) { this._ctx.close(); this._ctx = null; }

    const all = this.samples;
    if (!all.length) return { avgDb: SILENCE_DB, silenceRatio: 1, ok: false };

    const speaking = all.filter(db => db > SILENCE_DB);
    const silenceRatio = 1 - speaking.length / all.length;

    // 말하는 구간만 평균낸다. 숨 쉬는 사이의 침묵까지 넣으면 크게 말해도 낮은 값이 나온다.
    const avgDb = speaking.length
      ? speaking.reduce((a, b) => a + b, 0) / speaking.length
      : SILENCE_DB;

    return { avgDb, silenceRatio, ok: speaking.length > 0 };
  }
}

function clamp01(v) { return Math.max(0, Math.min(1, v)); }
