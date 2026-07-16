# 🦉 AI 발표 코치 (AI Presentation Coach)

초등 저학년 학생이 발표의 핵심 요소를 스스로 익히고, 반복 연습으로 올바른 발표 습관을 기르도록 돕는 AI 기반 발표 코칭 웹앱입니다.

## 무엇을 하나요

카메라·마이크 앞에서 발표하면 5가지 요소를 측정해 별점과 **행동 중심 코칭**을 줍니다. 평가가 아니라 "다음에 뭘 하면 되는지"를 알려줍니다.

| 요소 | 어떻게 측정하나요 |
|------|------------------|
| 🎤 목소리 | Web Audio API로 실제 음량(dB) 측정 |
| 🐢 속도 | Web Speech API로 음절/분 계산 (너무 빠르거나 느리면 감점) |
| 👀 눈맞춤 | MediaPipe 얼굴 인식으로 정면 응시 비율 |
| 🧍 자세 | 얼굴 중심의 좌우 흔들림 |
| 😊 자신감 | 위 요소들로 종합 추정 |

발표할수록 🍪 쿠키를 모아 레벨(🌱→🌼→⭐→👑)이 오르고, 배지를 얻고, 성장 그래프로 자신의 발전을 확인합니다.

## 실행 방법

**Chrome에서 로컬 서버로 열어야 합니다.** (카메라·마이크는 `file://`에서 차단됩니다)

- VS Code에서 **Live Server** 확장 설치 → `index.html` 우클릭 → *Open with Live Server*

## 기술 스택

빌드 도구 없는 순수 HTML/CSS/JavaScript(ES Modules). 발표 기록은 브라우저 `localStorage`에만 저장되며 서버로 전송되지 않습니다. 눈맞춤·자세(MediaPipe)와 성장 그래프(Chart.js)는 CDN을 쓰므로 인터넷이 필요하고, 인터넷이 없으면 해당 기능만 자동으로 비활성화됩니다.

## 폴더 구조

```
index.html          화면 5개 (홈·미션·발표·결과·성장)
css/style.css
js/
  main.js           화면 전환·발표 진행 총괄
  audio.js          목소리 크기 측정
  speech.js         말하기 속도 측정
  vision.js         눈맞춤·자세 측정 (MediaPipe)
  score.js          측정값 → 별점
  coach.js          별점 → 코칭 문장·쿠키
  storage.js        기록 저장 (localStorage)
```

자세한 기획·개발 계획은 [개발계획.md](개발계획.md), 제품 요구사항은 [AI_발표_코치_PRD.md](AI_발표_코치_PRD.md)를 참고하세요.
