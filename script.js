/**
 * Simon Color — vanilla JS memory game
 * Offline-ready: Web Audio tones, no external files
 */

/* ========== Difficulty tuning (customize here) ========== */
const BASE_DELAY = 600;       // ms between flashes at start
const DELAY_DECREMENT = 25;   // ms faster per point scored
const MIN_DELAY = 250;
const BASE_FLASH_MS = 220;    // how long each pad stays lit
const FLASH_DECREMENT = 8;
const MIN_FLASH_MS = 120;

/* Color names — index 0–3 matches each pad's data-color */
const COLORS = ['green', 'red', 'yellow', 'blue'];

/* Tone frequencies (Hz) per color — Web Audio, no MP3 files */
const TONE_FREQ = [329.63, 261.63, 392.0, 440.0];

const PLAYER_NAME_KEY = 'simonPlayerName';
const MAX_LEADERBOARD = 10;
const SCORES_COLLECTION = 'scores';

let db = null;
let globalEntries = [];
let leaderboardUnsubscribe = null;

/* ========== Game state ========== */
let sequence = [];          // ARRAY: grows each round with random 0–3
let playerIndex = 0;
let score = 0;
let highScore = 0;
let playerName = '';
let isPlaying = false;
let canAcceptInput = false;
let isShowingSequence = false;

let audioContext = null;
let playbackDelay = BASE_DELAY;
let flashDuration = BASE_FLASH_MS;
let lastInputTime = 0;

/* ========== DOM references ========== */
const nameScreen = document.getElementById('name-screen');
const titleScreen = document.getElementById('title-screen');
const gameScreen = document.getElementById('game-screen');
const gameOverOverlay = document.getElementById('game-over-overlay');
const playerNameInput = document.getElementById('player-name-input');
const nameError = document.getElementById('name-error');
const btnContinue = document.getElementById('btn-continue');
const btnChangeName = document.getElementById('btn-change-name');
const playerNameDisplay = document.getElementById('player-name-display');
const leaderboardList = document.getElementById('leaderboard-list');
const btnStart = document.getElementById('btn-start');
const btnRestart = document.getElementById('btn-restart');
const scoreDisplay = document.getElementById('score-display');
const highScoreDisplay = document.getElementById('high-score-display');
const titleHighScore = document.getElementById('title-high-score');
const statusText = document.getElementById('status-text');
const finalScoreEl = document.getElementById('final-score');
const newRecordMsg = document.getElementById('new-record-msg');
const leaderboardRankMsg = document.getElementById('leaderboard-rank-msg');
const pads = document.querySelectorAll('.pad');

/* ========== Global leaderboard — Firebase Firestore (shared worldwide) ========== */
function normalizeName(name) {
  return name.trim().replace(/\s+/g, ' ');
}

function nameToDocId(name) {
  const slug = normalizeName(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return slug || 'player';
}

function initFirebaseDb() {
  if (typeof FIREBASE_CONFIGURED !== 'undefined' && !FIREBASE_CONFIGURED) {
    return false;
  }
  if (typeof firebase === 'undefined' || !firebase.apps.length) {
    return false;
  }
  db = firebase.firestore();
  return true;
}

function getSortedTopEntries(entries) {
  return [...entries]
    .filter((e) => e && typeof e.score === 'number' && e.name)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_LEADERBOARD);
}

function getPlayerBestFromEntries(name) {
  const key = normalizeName(name).toLowerCase();
  const entry = globalEntries.find(
    (e) => normalizeName(e.name).toLowerCase() === key
  );
  return entry ? entry.score : 0;
}

function getRankClass(rank) {
  if (rank === 1) return 'rank-gold';
  if (rank === 2) return 'rank-silver';
  if (rank === 3) return 'rank-bronze';
  return '';
}

function getMedal(rank) {
  if (rank === 1) return '🥇';
  if (rank === 2) return '🥈';
  if (rank === 3) return '🥉';
  return '';
}

function showLeaderboardMessage(message) {
  leaderboardList.innerHTML = `<li class="leaderboard-empty">${escapeHtml(message)}</li>`;
}

function renderLeaderboard() {
  const entries = getSortedTopEntries(globalEntries);

  if (!db) {
    showLeaderboardMessage(
      'Leaderboard unavailable — add your Firebase keys in firebase-config.js'
    );
    return;
  }

  if (entries.length === 0) {
    showLeaderboardMessage('No scores yet — be the first!');
    return;
  }

  leaderboardList.innerHTML = entries
    .map((entry, index) => {
      const rank = index + 1;
      const rankClass = getRankClass(rank);
      const medal = getMedal(rank);
      const medalHtml = medal
        ? `<span class="leaderboard-medal" aria-hidden="true">${medal}</span>`
        : '';
      const rankLabel = medal ? '' : `${rank}`;

      return `
        <li class="leaderboard-item ${rankClass}">
          <span class="leaderboard-rank">${rankLabel}</span>
          ${medalHtml}
          <span class="leaderboard-name">${escapeHtml(entry.name)}</span>
          <span class="leaderboard-score">${entry.score}</span>
        </li>
      `;
    })
    .join('');
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function subscribeToLeaderboard() {
  if (!db) {
    renderLeaderboard();
    return;
  }

  if (leaderboardUnsubscribe) {
    leaderboardUnsubscribe();
    leaderboardUnsubscribe = null;
  }

  showLeaderboardMessage('Loading scores…');

  leaderboardUnsubscribe = db
    .collection(SCORES_COLLECTION)
    .onSnapshot(
      (snapshot) => {
        globalEntries = [];
        snapshot.forEach((doc) => {
          const data = doc.data();
          globalEntries.push({
            name: data.name,
            score: data.score,
          });
        });
        renderLeaderboard();
        if (playerName) loadHighScore();
      },
      () => {
        showLeaderboardMessage('Could not load leaderboard. Check Firebase setup.');
      }
    );
}

function upsertLocalEntry(name, score) {
  const cleanName = normalizeName(name);
  const key = cleanName.toLowerCase();
  const idx = globalEntries.findIndex(
    (e) => normalizeName(e.name).toLowerCase() === key
  );
  if (idx >= 0) {
    if (score > globalEntries[idx].score) {
      globalEntries[idx] = { name: cleanName, score };
    }
  } else {
    globalEntries.push({ name: cleanName, score });
  }
}

async function submitScoreToFirebase(name, score) {
  if (!db || score <= 0) return false;

  const cleanName = normalizeName(name);
  const docId = nameToDocId(cleanName);
  const docRef = db.collection(SCORES_COLLECTION).doc(docId);

  try {
    const existing = await docRef.get();
    if (existing.exists && existing.data().score >= score) {
      return false;
    }

    await docRef.set(
      {
        name: cleanName,
        score,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    return true;
  } catch {
    return false;
  }
}

function getLeaderboardRankByName(name) {
  const entries = getSortedTopEntries(globalEntries);
  const key = normalizeName(name).toLowerCase();
  const idx = entries.findIndex(
    (e) => normalizeName(e.name).toLowerCase() === key
  );
  return idx >= 0 ? idx + 1 : null;
}

/* ========== Personal best (from global leaderboard for this name) ========== */
function loadHighScore() {
  highScore = playerName ? getPlayerBestFromEntries(playerName) : 0;
  updateHighScoreDisplay();
}

function updateHighScoreDisplay() {
  highScoreDisplay.textContent = highScore;
  titleHighScore.textContent = highScore;
}

function updateScoreDisplay() {
  scoreDisplay.textContent = score;
}

function setStatus(message) {
  statusText.textContent = message;
}

/* ========== Audio — unlock on first tap (required on iOS) ========== */
function initAudio() {
  if (!audioContext) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (Ctx) audioContext = new Ctx();
  }
  if (audioContext && audioContext.state === 'suspended') {
    audioContext.resume();
  }
}

function playTone(frequency, durationMs, type = 'sine') {
  if (!audioContext) return;
  const now = audioContext.currentTime;
  const osc = audioContext.createOscillator();
  const gain = audioContext.createGain();
  osc.type = type;
  osc.frequency.value = frequency;
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.35, now + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + durationMs / 1000);
  osc.connect(gain);
  gain.connect(audioContext.destination);
  osc.start(now);
  osc.stop(now + durationMs / 1000 + 0.05);
}

function playColorTone(colorIndex) {
  playTone(TONE_FREQ[colorIndex], flashDuration);
}

function playErrorSound() {
  playTone(110, 180, 'sawtooth');
  setTimeout(() => playTone(80, 200, 'square'), 100);
}

/* ========== Vibration — phones only; safe no-op on desktop ========== */
function vibrateTap() {
  if (navigator.vibrate) navigator.vibrate(30);
}

function vibrateGameOver() {
  if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
}

/* ========== Async timing — delay helper for sequence playback ========== */
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getPadElement(colorIndex) {
  return document.querySelector(`.pad[data-color="${colorIndex}"]`);
}

function disablePads(disabled) {
  pads.forEach((pad) => {
    pad.disabled = disabled;
    pad.classList.toggle('disabled', disabled);
  });
}

async function flashPad(colorIndex, playSound = true) {
  const pad = getPadElement(colorIndex);
  if (!pad) return;
  pad.classList.add('active');
  if (playSound) playColorTone(colorIndex);
  await delay(flashDuration);
  pad.classList.remove('active');
}

/* ========== Difficulty — speed up as score increases ========== */
function updateDifficulty() {
  playbackDelay = Math.max(MIN_DELAY, BASE_DELAY - score * DELAY_DECREMENT);
  flashDuration = Math.max(MIN_FLASH_MS, BASE_FLASH_MS - score * FLASH_DECREMENT);
}

/* ========== Game loop: add → show → input → repeat ========== */
function addRandomToSequence() {
  const randomIndex = Math.floor(Math.random() * 4);
  sequence.push(randomIndex);
}

async function playSequence() {
  isShowingSequence = true;
  canAcceptInput = false;
  disablePads(true);
  setStatus('Watch…');

  for (const colorIndex of sequence) {
    if (!isPlaying) break;
    await flashPad(colorIndex);
    await delay(playbackDelay);
  }

  isShowingSequence = false;
  if (!isPlaying) return;

  disablePads(false);
  canAcceptInput = true;
  playerIndex = 0;
  setStatus('Your turn');
}

function startRound() {
  addRandomToSequence();
  updateDifficulty();
  playSequence();
}

function hideAllScreens() {
  nameScreen.classList.add('hidden');
  nameScreen.classList.remove('screen-active');
  titleScreen.classList.add('hidden');
  titleScreen.classList.remove('screen-active');
  gameScreen.classList.add('hidden');
  gameScreen.classList.remove('screen-active');
}

function showNameScreen() {
  hideAllScreens();
  nameScreen.classList.remove('hidden');
  nameScreen.classList.add('screen-active');
  const saved = localStorage.getItem(PLAYER_NAME_KEY);
  if (saved) playerNameInput.value = saved;
  playerNameInput.focus();
}

function showTitleScreen() {
  hideAllScreens();
  titleScreen.classList.remove('hidden');
  titleScreen.classList.add('screen-active');
  playerNameDisplay.textContent = playerName;
  subscribeToLeaderboard();
  loadHighScore();
}

function showGameScreen() {
  hideAllScreens();
  gameScreen.classList.remove('hidden');
  gameScreen.classList.add('screen-active');
}

function validateAndSetName() {
  const raw = playerNameInput.value;
  const clean = normalizeName(raw);

  if (clean.length < 1 || clean.length > 20) {
    nameError.classList.remove('hidden');
    return false;
  }

  nameError.classList.add('hidden');
  playerName = clean;
  localStorage.setItem(PLAYER_NAME_KEY, playerName);
  return true;
}

function continueFromName() {
  if (!validateAndSetName()) return;
  initAudio();
  showTitleScreen();
}

function startGame() {
  initAudio();
  sequence = [];
  playerIndex = 0;
  score = 0;
  isPlaying = true;
  playbackDelay = BASE_DELAY;
  flashDuration = BASE_FLASH_MS;
  gameOverOverlay.classList.add('hidden');
  updateScoreDisplay();
  showGameScreen();
  setStatus('Get ready…');
  startRound();
}

async function gameOver() {
  isPlaying = false;
  canAcceptInput = false;
  isShowingSequence = false;
  disablePads(true);
  setStatus('Game Over');
  playErrorSound();
  vibrateGameOver();

  finalScoreEl.textContent = score;
  const previousBest = highScore;

  if (score > 0 && playerName && db) {
    const saved = await submitScoreToFirebase(playerName, score);
    if (saved) upsertLocalEntry(playerName, score);
  }

  loadHighScore();

  const isNewRecord = score > previousBest && score > 0;
  newRecordMsg.classList.toggle('hidden', !isNewRecord);

  leaderboardRankMsg.classList.add('hidden');
  leaderboardRankMsg.classList.remove('rank-gold-text');

  if (isNewRecord && playerName) {
    const rank = getLeaderboardRankByName(playerName);
    if (rank === 1) {
      leaderboardRankMsg.textContent = '🥇 You are #1 on the global leaderboard!';
      leaderboardRankMsg.classList.add('rank-gold-text');
      leaderboardRankMsg.classList.remove('hidden');
    } else if (rank === 2) {
      leaderboardRankMsg.textContent = '🥈 You reached #2 on the global leaderboard!';
      leaderboardRankMsg.classList.remove('hidden');
    } else if (rank === 3) {
      leaderboardRankMsg.textContent = '🥉 You reached #3 on the global leaderboard!';
      leaderboardRankMsg.classList.remove('hidden');
    } else if (rank) {
      leaderboardRankMsg.textContent = `You reached #${rank} on the global leaderboard`;
      leaderboardRankMsg.classList.remove('hidden');
    }
  }

  gameOverOverlay.classList.remove('hidden');
}

function restartGame() {
  gameOverOverlay.classList.add('hidden');
  leaderboardRankMsg.classList.add('hidden');
  leaderboardRankMsg.classList.remove('rank-gold-text');
  startGame();
}

/* ========== Player input ========== */
function handlePadTap(colorIndex) {
  const now = Date.now();
  if (now - lastInputTime < 120) return;
  lastInputTime = now;

  if (!isPlaying || !canAcceptInput || isShowingSequence) return;

  const pad = getPadElement(colorIndex);
  if (pad) {
    pad.classList.add('active');
    setTimeout(() => pad.classList.remove('active'), flashDuration * 0.6);
  }

  playColorTone(colorIndex);
  vibrateTap();

  if (colorIndex !== sequence[playerIndex]) {
    gameOver();
    return;
  }

  playerIndex += 1;

  if (playerIndex === sequence.length) {
    score += 1;
    updateScoreDisplay();
    updateDifficulty();
    canAcceptInput = false;
    setStatus('Nice!');
    setTimeout(() => {
      if (isPlaying) startRound();
    }, 500);
  }
}

/* ========== EVENT LISTENERS — wire buttons to game functions ========== */
btnContinue.addEventListener('click', continueFromName);

playerNameInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') continueFromName();
});

btnChangeName.addEventListener('click', showNameScreen);

btnStart.addEventListener('click', () => {
  if (!playerName) {
    showNameScreen();
    return;
  }
  initAudio();
  startGame();
});

btnRestart.addEventListener('click', () => {
  initAudio();
  restartGame();
});

pads.forEach((pad) => {
  const colorIndex = parseInt(pad.dataset.color, 10);

  /* pointerdown = faster response on touch screens */
  pad.addEventListener('pointerdown', () => {
    if (!isPlaying || !canAcceptInput || isShowingSequence) return;
    pad.classList.add('active');
    setTimeout(() => pad.classList.remove('active'), flashDuration * 0.5);
  });

  pad.addEventListener('click', () => {
    handlePadTap(colorIndex);
  });
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden && isPlaying) {
    canAcceptInput = false;
  }
});

/* ========== Init on page load ========== */
const savedName = localStorage.getItem(PLAYER_NAME_KEY);
if (savedName) {
  playerName = normalizeName(savedName);
  playerNameInput.value = playerName;
}

initFirebaseDb();
disablePads(true);
showNameScreen();
