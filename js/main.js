// 화면 전환과 발표 진행을 총괄한다. 다른 파일들을 불러다 쓰는 사령탑 역할이다.

import { VoiceMeter, AUDIO_CONSTRAINTS } from './audio.js';
import { SpeechCounter, isSupported as speechSupported } from './speech.js';
import { calcScores, ELEMENTS, speedDirection } from './score.js';
import { buildFeedback, calcCookies } from './coach.js';
import { pickTopic, TOPICS } from './topics.js';
import { renderQR, shareableUrl } from './qr.js';
import * as storage from './storage.js';

const $ = (sel) => document.querySelector(sel);

// 지금 발표할 주제. 미션 화면에서 정하고, 발표 중 화면에서도 잊지 않게 보여준다.
let currentTopic = null;

// 발표 한 번 동안만 쓰는 상태. 발표가 끝나면 전부 버린다.
let session = null;

// 얼굴 인식(vision.js)은 인터넷에서 모델을 받아온다. 앱 전체를 여기에 묶으면 안 되므로
// 정적 import 대신 필요할 때 불러오고, 실패하면 눈맞춤·자세만 포기한다.
let faceWatcher = null;
let visionLoading = null;

function preloadVision() {
  if (faceWatcher || visionLoading) return visionLoading;
  visionLoading = (async () => {
    try {
      const { FaceWatcher } = await import('./vision.js');
      const watcher = new FaceWatcher();
      await watcher.load();
      faceWatcher = watcher;
    } catch (err) {
      // 인터넷이 없거나 CDN이 막힌 경우. 나머지 기능은 그대로 쓸 수 있어야 한다.
      console.warn('얼굴 인식을 쓸 수 없어요. 눈맞춤·자세는 측정되지 않습니다.', err);
      faceWatcher = null;
    } finally {
      visionLoading = null;
    }
  })();
  return visionLoading;
}

// ===== 화면 전환 =====
function goto(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('is-active'));
  $(`#screen-${name}`).classList.add('is-active');
  if (name === 'home') renderHome();
  if (name === 'growth') renderGrowth();
  if (name === 'phone') renderPhoneScreen();
}

// ===== 핸드폰으로 열기 (QR) =====
function renderPhoneScreen() {
  const url = shareableUrl();
  $('#qr-url').textContent = url;
  // QR은 CDN 라이브러리가 필요하다. 실패하면 위의 주소 글자만 남는다.
  renderQR($('#qr-box'), url);
}

// ===== 홈 =====
function renderHome() {
  const data = storage.load();
  const level = storage.getLevel(data.totalCookies);
  $('#home-level').textContent = level.emoji;
  $('#home-level-name').textContent = level.name;
  $('#home-cookies').textContent = data.cookies;
  $('#home-count').textContent = data.records.length;
}

// ===== 미션 체크리스트 =====
const missionBoxes = () => [...document.querySelectorAll('[data-mission]')];

function allMissionsChecked() {
  return missionBoxes().every(b => b.checked);
}

function updateMissionState() {
  const done = missionBoxes().filter(b => b.checked).length;
  const all = done === missionBoxes().length;
  // disabled로 막지 않는다. 눌렀을 때 "왜 안 되는지" 알려주려면 클릭이 살아있어야 한다.
  // 대신 아직 준비 안 됐다는 걸 회색(btn-waiting)으로 보여준다.
  $('#btn-start').classList.toggle('btn-waiting', !all);
  $('#mission-hint').classList.remove('mission-hint-warn');
  $('#mission-hint').textContent = all
    ? '준비 완료! 발표를 시작해요 🎉'
    : `${done} / ${missionBoxes().length} 체크했어요`;
}

/** 미션을 다 안 채우고 시작을 누르면, 이유를 알려주고 안 한 항목을 흔들어 준다. */
function nudgeMissions() {
  const hint = $('#mission-hint');
  hint.textContent = '❗ 발표 미션을 모두 체크해야 시작할 수 있어요';
  hint.classList.add('mission-hint-warn');

  missionBoxes().forEach(box => {
    if (box.checked) return;
    const li = box.closest('li');
    li.classList.remove('shake');
    void li.offsetWidth;          // 애니메이션을 다시 트리거하기 위한 리플로우
    li.classList.add('shake');
  });
}

function resetMissions() {
  missionBoxes().forEach(b => (b.checked = false));
  updateMissionState();
}

// ===== 발표 주제 =====
/** 지금 주제(currentTopic)를 카드에 그린다. */
function renderTopic() {
  $('#topic-emoji').textContent = currentTopic.emoji;
  $('#topic-title').textContent = currentTopic.title;
  $('#topic-hints').innerHTML = currentTopic.hints
    .map(h => `<li>${h}</li>`).join('');
}

/** 새 주제를 무작위로 뽑는다 (방금 것과 다른 주제). "🎲 다른 주제" 버튼. */
function newTopic() {
  currentTopic = pickTopic(currentTopic);
  renderTopic();
}

/** 주제 목록을 그리드로 그린다. 지금 주제는 파란 테두리로 표시. */
function buildTopicGrid() {
  $('#topic-grid').innerHTML = TOPICS.map((t, i) => `
    <button class="topic-choice${t.title === currentTopic?.title ? ' is-current' : ''}" data-topic="${i}">
      <span class="choice-emoji">${t.emoji}</span><span>${t.title}</span>
    </button>`).join('');
}

function openPicker() {
  buildTopicGrid();
  $('#topic-picker').hidden = false;
}
function closePicker() {
  $('#topic-picker').hidden = true;
}

/** 목록에서 주제 하나를 고르면 그걸로 정하고 목록을 닫는다. */
function chooseTopic(index) {
  currentTopic = TOPICS[index];
  renderTopic();
  closePicker();
}

// ===== 발표 시작 =====
async function startPresentation() {
  // 미션을 다 체크해야 시작할 수 있다. 안 됐으면 이유를 알려주고 멈춘다.
  if (!allMissionsChecked()) {
    nudgeMissions();
    return;
  }

  $('#record-error').textContent = '';

  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user' },
      audio: AUDIO_CONSTRAINTS,
    });
  } catch (err) {
    showCameraError(err);
    return;
  }

  goto('record');
  // 발표 중에도 무슨 주제였는지 잊지 않게 위에 띄워준다.
  $('#topic-banner').textContent = `${currentTopic.emoji} ${currentTopic.title}`;

  const video = $('#preview');
  video.srcObject = stream;

  const meter = new VoiceMeter();
  meter.start(stream);

  const speech = new SpeechCounter();
  speech.start();

  // 모델이 아직 안 왔으면 기다리지 않는다. 아이를 카메라 앞에 세워두고
  // 몇 초씩 멈춰 있는 것보다, 눈맞춤 없이 바로 시작하는 편이 낫다.
  if (faceWatcher) faceWatcher.start(video);

  session = { stream, meter, speech, startedAt: Date.now(), timers: [] };

  session.timers.push(setInterval(tickTimer, 250));
  session.timers.push(setInterval(tickVolumeBar, 50));
  session.timers.push(setInterval(logCalibration, 500));
}

/**
 * 눈맞춤 기준값(vision.js의 YAW_LIMIT / PITCH_MIN)을 실제 얼굴에 맞추기 위한 보정용 출력.
 * F12 콘솔에서 정면을 볼 때의 값을 보고 기준을 조정한다.
 */
function logCalibration() {
  const live = faceWatcher?.live;
  if (live) {
    console.log(
      `[보정] yaw=${live.yaw.toFixed(3)} pitch=${live.pitch.toFixed(3)} → ${live.forward ? '정면 ⭕' : '아님 ❌'}`
    );
  }
}

function tickTimer() {
  const sec = Math.floor((Date.now() - session.startedAt) / 1000);
  const mm = String(Math.floor(sec / 60)).padStart(2, '0');
  const ss = String(sec % 60).padStart(2, '0');
  $('#rec-timer').textContent = `${mm}:${ss}`;
}

function tickVolumeBar() {
  const level = session.meter.level;
  $('#volume-bar').style.width = `${level * 100}%`;
  $('#volume-hint').textContent =
    level < 0.15 ? '조금 더 크게 말해보세요' :
    level > 0.85 ? '아주 잘 들려요!' : '좋아요, 계속 말해보세요';
}

function showCameraError(err) {
  goto('mission');
  const msg =
    location.protocol === 'file:'
      ? '주소가 file:// 로 열려 있어요. Live Server 같은 로컬 서버로 실행해야 카메라를 쓸 수 있어요.'
      : err.name === 'NotAllowedError'
      ? '카메라와 마이크 사용을 허용해 주세요. (주소창 왼쪽 자물쇠 아이콘에서 바꿀 수 있어요)'
      : err.name === 'NotFoundError'
      ? '카메라나 마이크를 찾을 수 없어요. 연결을 확인해 주세요.'
      : `카메라를 켤 수 없어요: ${err.name}`;
  $('#mission-hint').textContent = msg;
}

// ===== 발표 종료 =====
function stopPresentation() {
  if (!session) return;

  session.timers.forEach(clearInterval);
  session.stream.getTracks().forEach(t => t.stop());

  const duration = (Date.now() - session.startedAt) / 1000;
  const voice = session.meter.stop();
  const speech = session.speech.stop(duration);
  const face = faceWatcher ? faceWatcher.stop() : { eyeContactRatio: 0, swayRatio: 0, ok: false };

  const raw = {
    avgDb: voice.avgDb,
    silenceRatio: voice.silenceRatio,
    voiceOk: voice.ok,
    syllablesPerMin: speech.syllablesPerMin,
    speedOk: speech.ok,
    eyeContactRatio: face.eyeContactRatio,
    swayRatio: face.swayRatio,
    visionOk: face.ok,
  };

  const scores = calcScores(raw);
  const prev = storage.getLastRecord();
  const prevScores = prev ? prev.scores : null;

  const reward = calcCookies(scores, prevScores);
  const feedback = buildFeedback(scores, prevScores, raw);

  storage.addRecord({
    date: new Date().toISOString(),
    duration: Math.round(duration),
    scores,
    raw,                            // 별점 기준을 바꿔도 과거 기록을 다시 계산할 수 있게 원본을 남긴다
    cookiesEarned: reward.earned,
  });

  session = null;
  renderResult(scores, feedback, reward, raw);
  goto('result');
}

/** 별점이 안 나온 요소에, 아이가 다음에 뭘 고치면 되는지 알려준다. */
function missingNote(key, raw) {
  if (key === 'speed') return '목소리가 잘 들리지 않았어요';
  if (key === 'posture' || key === 'eyeContact') {
    return faceWatcher ? '얼굴이 화면에 잘 보이지 않았어요' : '이 기능은 인터넷 연결이 필요해요';
  }
  return '측정하지 못했어요';
}

/** 속도 별점 옆에 붙는 방향 태그. 빠름/느림/딱 좋음을 한눈에 보여준다. */
function speedTag(key, score, raw) {
  if (key !== 'speed' || score === null || !raw.speedOk) return '';
  const dir = speedDirection(raw.syllablesPerMin);
  const label = dir === 'fast' ? '🐇 조금 빨라요'
              : dir === 'slow' ? '🐢 조금 느려요'
              : '👍 딱 좋아요';
  return `<span class="speed-tag speed-${dir}">${label}</span>`;
}

// ===== 결과 화면 =====
function renderResult(scores, feedback, reward, raw) {
  const lines = [feedback.growth, feedback.praise, feedback.tip].filter(Boolean);
  $('#coach-message').innerHTML = lines.length
    ? lines.map(t => `<p>${t}</p>`).join('')
    : '<p>발표하느라 수고했어요!</p>';

  $('#score-list').innerHTML = ELEMENTS.map(el => {
    const score = scores[el.key];
    const body = score === null
      ? `<span class="score-note">${missingNote(el.key, raw)}</span>`
      : `<span class="score-stars">${'⭐'.repeat(score)}${'☆'.repeat(5 - score)}</span>`;
    // 속도는 별점만으로 빠른지 느린지 알 수 없으므로, 방향을 항상 함께 보여준다.
    const tag = speedTag(el.key, scores[el.key], raw);
    return `<li><span class="score-name">${el.emoji} ${el.name}</span>${body}${tag}</li>`;
  }).join('');

  $('#reward-box').innerHTML =
    reward.isFirst
      ? `<span class="reward-big">🍪 +${reward.earned}</span>첫 발표에 도전했어요!`
      : reward.earned === 0
      ? '다음 발표에서 더 좋아지면 쿠키를 받을 수 있어요!'
      : `<span class="reward-big">${reward.bonus ? '🌟' : '🍪'} +${reward.earned}</span>` +
        (reward.bonus ? '5가지가 모두 좋아졌어요!' : `${reward.grown.length}가지가 좋아졌어요!`);
}

// ===== 성장 기록 =====
function renderGrowth() {
  const { records } = storage.load();

  if (!records.length) {
    $('#growth-body').innerHTML =
      '<p class="empty">아직 발표 기록이 없어요.<br>첫 발표에 도전해 볼까요? 🌱</p>';
    return;
  }

  const avg = (key) => {
    const vals = records.map(r => r.scores[key]).filter(v => v !== null);
    return vals.length ? (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1) : '-';
  };

  $('#growth-body').innerHTML = `
    <p class="screen-sub">지금까지 ${records.length}번 발표했어요!</p>
    <div class="chart-box"><canvas id="growth-chart"></canvas></div>
    <ul class="score-list">
      ${ELEMENTS.map(el => `
        <li><span class="score-name">${el.emoji} ${el.name}</span>
        <span class="score-stars">평균 ${avg(el.key)}점</span></li>`).join('')}
    </ul>
    ${renderBadges(records)}`;

  drawChart(records);
}

/**
 * 성장 그래프. Chart.js도 인터넷에서 받아오므로, 실패하면 위의 평균 목록만 남긴다.
 * 그래프가 없다고 성장 화면 전체가 깨지면 안 된다.
 */
async function drawChart(records) {
  let Chart;
  try {
    // 반드시 /auto/ 를 써야 한다. 그냥 chart.js를 불러오면 축·선 같은 구성요소가
    // 등록되지 않아서 그래프가 조용히 안 그려진다 ("linear is not a registered scale").
    ({ default: Chart } = await import('https://cdn.jsdelivr.net/npm/chart.js@4.4.7/auto/+esm'));
  } catch (err) {
    console.warn('그래프를 불러올 수 없어요 (인터넷 연결 확인).', err);
    document.querySelector('.chart-box')?.remove();
    return;
  }

  const canvas = $('#growth-chart');
  if (!canvas) return;  // 그 사이 사용자가 다른 화면으로 갔다

  const palette = { confidence: '#f6a5c0', voice: '#4a7dff', speed: '#7ee0a8', posture: '#ffc36b', eyeContact: '#a78bfa' };

  new Chart(canvas, {
    type: 'line',
    data: {
      labels: records.map((_, i) => `${i + 1}회`),
      datasets: ELEMENTS.map(el => ({
        label: `${el.emoji} ${el.name}`,
        data: records.map(r => r.scores[el.key]),   // null이면 선이 끊긴다 (측정 못 한 회차)
        borderColor: palette[el.key],
        backgroundColor: palette[el.key],
        tension: 0.3,
        spanGaps: false,
      })),
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: { y: { min: 0, max: 5, ticks: { stepSize: 1 } } },
      plugins: { legend: { labels: { boxWidth: 12, font: { size: 11 } } } },
    },
  });
}

// ===== 배지 (PRD 8장) =====
const BADGES = [
  { key: 'voice',      emoji: '🎤', name: '큰 목소리 달인' },
  { key: 'eyeContact', emoji: '👀', name: '눈맞춤 왕' },
  { key: 'confidence', emoji: '😊', name: '자신감 최고' },
  { key: 'posture',    emoji: '🧍', name: '바른 자세 챔피언' },
  { key: 'speed',      emoji: '🐢', name: '알맞은 빠르기 달인' },
];

/** 해당 요소로 ⭐5를 세 번 받으면 배지를 얻는다. 한 번의 운이 아니라 습관이 됐다는 뜻이다. */
function renderBadges(records) {
  const earned = BADGES.filter(b =>
    records.filter(r => r.scores[b.key] === 5).length >= 3);

  if (!earned.length) {
    return '<p class="hint">⭐5를 세 번 받으면 배지를 얻어요!</p>';
  }
  return `<div class="badges">${earned
    .map(b => `<span class="badge">${b.emoji} ${b.name}</span>`).join('')}</div>`;
}

// ===== 버튼 연결 =====
// 미션을 읽고 체크하는 10~20초 동안 얼굴 인식 모델을 미리 받아둔다.
const goMission = () => { resetMissions(); newTopic(); closePicker(); goto('mission'); preloadVision(); };

$('#btn-use-web').onclick = () => goto('home');
$('#btn-use-phone').onclick = () => goto('phone');
$('#btn-go-mission').onclick = goMission;
$('#btn-new-topic').onclick = newTopic;
$('#btn-pick-topic').onclick = openPicker;
$('#btn-close-picker').onclick = closePicker;
// 그리드 버튼은 매번 새로 그려지므로, 부모에 위임해서 클릭을 받는다.
$('#topic-grid').onclick = (e) => {
  const btn = e.target.closest('[data-topic]');
  if (btn) chooseTopic(Number(btn.dataset.topic));
};
$('#btn-go-growth').onclick = () => goto('growth');
$('#btn-start').onclick = startPresentation;
$('#btn-stop').onclick = stopPresentation;
$('#btn-again').onclick = goMission;
document.querySelectorAll('[data-goto]').forEach(b => (b.onclick = () => goto(b.dataset.goto)));
missionBoxes().forEach(b => (b.onchange = updateMissionState));

if (!speechSupported()) {
  console.warn('이 브라우저는 음성 인식을 지원하지 않습니다. Chrome을 사용하세요. (속도 측정이 꺼집니다)');
}

renderHome();
