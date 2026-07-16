// 브라우저의 음성 인식으로 말한 내용을 글자로 바꾸고, 말하기 속도(음절/분)를 구한다.
// Chrome 전용이다. 다른 브라우저에서는 isSupported()가 false를 돌려준다.

const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;

export function isSupported() {
  return Boolean(Recognition);
}

export class SpeechCounter {
  constructor() {
    this.text = '';
    this._rec = null;
    this._running = false;
  }

  start() {
    if (!Recognition) return;

    this._rec = new Recognition();
    this._rec.lang = 'ko-KR';
    this._rec.continuous = true;
    this._rec.interimResults = false;

    this._rec.onresult = (e) => {
      // e.resultIndex 이후만 읽는다. 처음부터 읽으면 같은 문장이 중복으로 쌓인다.
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) this.text += e.results[i][0].transcript + ' ';
      }
    };

    this._rec.onend = () => {
      // Chrome은 잠시 조용하면 인식을 스스로 끝낸다. 발표 중이면 다시 켜서 이어붙인다.
      if (this._running) {
        try { this._rec.start(); } catch { /* 이미 시작된 경우 무시 */ }
      }
    };

    this._rec.onerror = (e) => {
      if (e.error !== 'no-speech') console.warn('음성 인식 오류:', e.error);
    };

    this._running = true;
    try { this._rec.start(); } catch { /* 무시 */ }
  }

  /** @param {number} durationSec 발표 시간(초) */
  stop(durationSec) {
    this._running = false;
    if (this._rec) { try { this._rec.stop(); } catch { /* 무시 */ } }

    const syllables = countSyllables(this.text);
    // 인식된 글자가 너무 적으면 속도를 신뢰할 수 없다. ok:false로 알려서 별점 대신 "측정 못함"을 띄운다.
    const ok = isSupported() && syllables >= 10 && durationSec >= 3;

    return {
      text: this.text.trim(),
      syllables,
      syllablesPerMin: ok ? (syllables / durationSec) * 60 : 0,
      ok,
    };
  }
}

/** 한글은 한 글자가 곧 한 음절이다. 숫자도 대략 한 음절로 센다. */
function countSyllables(text) {
  return (text.match(/[가-힣0-9]/g) || []).length;
}
