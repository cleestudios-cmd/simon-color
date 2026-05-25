/**
 * Simon Color � vanilla JS memory game
 * Offline-ready: Web Audio tones, no external files
 */

const BASE_DELAY = 600;
const DELAY_DECREMENT = 25;
const MIN_DELAY = 250;
const BASE_FLASH_MS = 220;
const FLASH_DECREMENT = 8;
const MIN_FLASH_MS = 120;

const COLORS = ['green', 'red', 'yellow', 'blue'];
const TONE_FREQ = [329.63, 261.63, 392.0, 440.0];

const PLAYER_NAME_KEY = 'simonPlayerName';
const LOCAL_LEADERBOARD_KEY = 'simonLeaderboardLocal';
const MAX_LEADERBOARD = 10;

const BACKEND_BASE_URL =
  window.__SIMON_BACKEND_URL ||
  localStorage.getItem('simonBackendUrl') ||
  window.location.origin;
const API_BASE = `${BACKEND_BASE_URL}/api`;
const LEADERBOARD_API = `${API_BASE}/leaderboard`;
const SCORE_API = `${API_BASE}/score`;

let globalEntries = [];
let isGameOverActive = false;
let sequenceRunId = 0;

let sequence = [];
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
const btnMenu = document.getElementById('btn-menu');
const scoreDisplay = document.getElementById('score-display');
const highScoreDisplay = document.getElementById('high-score-display');
const titleHighScore = document.getElementById('title-high-score');
const statusText = document.getElementById('status-text');
const finalScoreEl = document.getElementById('final-score');
const newRecordMsg = document.getElementById('new-record-msg');
const leaderboardRankMsg = document.getElementById('leaderboard-rank-msg');
const pads = document.querySelectorAll('.pad');

function normalizeName(name) {
  return name.trim().replace(/\s+/g, ' ');
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function loadLocalLeaderboard() {
  try {
    const raw = localStorage.getItem(LOCAL_LEADERBOARD_KEY);
    const data = raw ? JSON.parse(raw) : [];
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function saveLocalLeaderboard(entries) {
  try {
    localStorage.setItem(LOCAL_LEADERBOARD_KEY, JSON.stringify(entries));
  } catch (error) {
    console.warn('Could not save local leaderboard:', error);
  }
}

function getSortedTopEntries(entries) {
  return [...entries]
    .filter((entry) => entry && typeof entry.score === 'number' && entry.name)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_LEADERBOARD);
}

function showLeaderboardMessage(message) {
  leaderboardList.innerHTML = `<li class="leaderboard-empty">${escapeHtml(message)}</li>`;
}

function getPlayerBestFromEntries(name) {
  const key = normalizeName(name).toLowerCase();
  const entry = globalEntries.find((item) => normalizeName(item.name).toLowerCase() === key);
  return entry ? entry.score : 0;
}

function getRankClass(rank) {
  if (rank === 1) return 'rank-gold';
  if (rank === 2) return 'rank-silver';
  if (rank === 3) return 'rank-bronze';
  return '';
}

function getMedal(rank) {
  if (rank === 1) return '??';
  if (rank === 2) return '??';
  if (rank === 3) return '??';
  return '';
}

function renderLeaderboard() {
  const entries = getSortedTopEntries(globalEntries);

  if (entries.length === 0) {
    showLeaderboardMessage('No scores yet � be the first!');
    return;
  }

  leaderboardList.innerHTML = entries
    .map((entry, index) => {
      const rank = index + 1;
      const medal = getMedal(rank);
      const rankLabel = medal ? '' : `${rank}`;
      const medalHtml = medal ? `<span class="leaderboard-medal" aria-hidden="true">${medal}</span>` : '';

      return `
        <li class="leaderboard-item ${getRankClass(rank)}">
          <span class="leaderboard-rank">${rankLabel}</span>
          ${medalHtml}
          <span class="leaderboard-name">${escapeHtml(entry.name)}</span>
          <span class="leaderboard-score">${entry.score}</span>
        </li>
      `;
    })
    .join('');
}

function applyLeaderboardEntries(entries) {
  globalEntries = entries;
  renderLeaderboard();
  if (playerName) {
    loadHighScore();
  }
}

function addToLocalLeaderboard(name, score) {
  if (score <= 0) return false;

  const cleanName = normalizeName(name);
  const key = cleanName.toLowerCase();
  const entries = loadLocalLeaderboard();
  const existingIndex = entries.findIndex((entry) => normalizeName(entry.name).toLowerCase() === key);

  if (existingIndex >= 0) {
    if (score <= entries[existingIndex].score) {
      return false;
    }

    entries[existingIndex] = { name: cleanName, score };
  } else {
    entries.push({ name: cleanName, score });
  }

  entries.sort((a, b) => b.score - a.score);
  saveLocalLeaderboard(entries);
  applyLeaderboardEntries(entries);
  return true;
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Request failed: ${response.status}`);
  }

  return response.json();
}

async function loadLeaderboardFromBackend() {
  showLeaderboardMessage('Loading global scores�');

  try {
    const data = await fetchJson(LEADERBOARD_API);
    const entries = Array.isArray(data.entries) ? data.entries : [];
    saveLocalLeaderboard(entries);
    applyLeaderboardEntries(entries);
    return entries;
  } catch (error) {
    console.error('Leaderboard fetch failed:', error);

    const localEntries = loadLocalLeaderboard();
    applyLeaderboardEntries(localEntries);

    if (localEntries.length === 0) {
      showLeaderboardMessage('Leaderboard unavailable. Try again in a moment.');
    }

    return localEntries;
  }
}

async function submitScoreToBackend(name, score) {
  if (score <= 0) return null;

  try {
    const result = await fetchJson(SCORE_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: normalizeName(name), score }),
    });

    if (Array.isArray(result.entries)) {
      saveLocalLeaderboard(result.entries);
      applyLeaderboardEntries(result.entries);
    }

    return result;
  } catch (error) {
    console.error('Score submit failed:', error);
    addToLocalLeaderboard(name, score);
    return null;
  }
}

function getLeaderboardRankByName(name) {
  const entries = getSortedTopEntries(globalEntries);
  const key = normalizeName(name).toLowerCase();
  const index = entries.findIndex((entry) => normalizeName(entry.name).toLowerCase() === key);
  return index >= 0 ? index + 1 : null;
}

function loadHighScore() {
  highScore = playerName ? getPlayerBestFromEntries(playerName) : 0;
  highScoreDisplay.textContent = highScore;
  titleHighScore.textContent = highScore;
}

function updateScoreDisplay() {
  scoreDisplay.textContent = score;
}

function setStatus(message) {
  statusText.textContent = message;
}

function initAudio() {
  if (!audioContext) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (Ctx) {
      audioContext = new Ctx();
    }
  }

  if (audioContext && audioContext.state === 'suspended') {
    audioContext.resume();
  }
}

function playTone(frequency, durationMs, type = 'sine') {
  if (!audioContext) return;

  const now = audioContext.currentTime;
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();

  oscillator.type = type;
  oscillator.frequency.value = frequency;
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.35, now + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + durationMs / 1000);

  oscillator.connect(gain);
  gain.connect(audioContext.destination);
  oscillator.start(now);
  oscillator.stop(now + durationMs / 1000 + 0.05);
}

function playColorTone(colorIndex) {
  playTone(TONE_FREQ[colorIndex], flashDuration);
}

function playErrorSound() {
  playTone(110, 180, 'sawtooth');
  setTimeout(() => playTone(80, 200, 'square'), 100);
}

function vibrateTap() {
  if (navigator.vibrate) navigator.vibrate(30);
}

function vibrateGameOver() {
  if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
}

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

  if (playSound) {
    playColorTone(colorIndex);
  }

  await delay(flashDuration);
  pad.classList.remove('active');
}

function updateDifficulty() {
  playbackDelay = Math.max(MIN_DELAY, BASE_DELAY - score * DELAY_DECREMENT);
  flashDuration = Math.max(MIN_FLASH_MS, BASE_FLASH_MS - score * FLASH_DECREMENT);
}

function addRandomToSequence() {
  const randomIndex = Math.floor(Math.random() * 4);
  sequence.push(randomIndex);
}

async function playSequence() {
  const runId = ++sequenceRunId;
  isShowingSequence = true;
  canAcceptInput = false;
  disablePads(true);
  setStatus('Watch�');

  for (const colorIndex of sequence) {
    if (!isPlaying || runId !== sequenceRunId) break;
    await flashPad(colorIndex);
    if (!isPlaying || runId !== sequenceRunId) break;
    await delay(playbackDelay);
  }

  isShowingSequence = false;
  if (!isPlaying || runId !== sequenceRunId) return;

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

  const savedName = localStorage.getItem(PLAYER_NAME_KEY);
  if (savedName) {
    playerNameInput.value = savedName;
  }

  playerNameInput.focus();
}

function showTitleScreen() {
  hideAllScreens();
  titleScreen.classList.remove('hidden');
  titleScreen.classList.add('screen-active');
  playerNameDisplay.textContent = playerName;
  loadHighScore();
  loadLeaderboardFromBackend();
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
  sequenceRunId += 1;
  isGameOverActive = false;
  sequence = [];
  playerIndex = 0;
  score = 0;
  isPlaying = true;
  canAcceptInput = false;
  isShowingSequence = false;
  playbackDelay = BASE_DELAY;
  flashDuration = BASE_FLASH_MS;
  gameOverOverlay.classList.add('hidden');
  newRecordMsg.classList.add('hidden');
  leaderboardRankMsg.classList.add('hidden');
  leaderboardRankMsg.classList.remove('rank-gold-text');
  updateScoreDisplay();
  showGameScreen();
  setStatus('Get ready�');
  startRound();
}

function showGameOverRankMessage(previousBest) {
  const isNewRecord = score > previousBest && score > 0;
  newRecordMsg.classList.toggle('hidden', !isNewRecord);

  leaderboardRankMsg.classList.add('hidden');
  leaderboardRankMsg.classList.remove('rank-gold-text');

  if (!isNewRecord || !playerName) return;

  const rank = getLeaderboardRankByName(playerName);
  if (rank === 1) {
    leaderboardRankMsg.textContent = '?? You are #1 on the leaderboard!';
    leaderboardRankMsg.classList.add('rank-gold-text');
    leaderboardRankMsg.classList.remove('hidden');
  } else if (rank === 2) {
    leaderboardRankMsg.textContent = '?? You reached #2 on the leaderboard!';
    leaderboardRankMsg.classList.remove('hidden');
  } else if (rank === 3) {
    leaderboardRankMsg.textContent = '?? You reached #3 on the leaderboard!';
    leaderboardRankMsg.classList.remove('hidden');
  } else if (rank) {
    leaderboardRankMsg.textContent = `You reached #${rank} on the leaderboard`;
    leaderboardRankMsg.classList.remove('hidden');
  }
}

async function gameOver() {
  if (isGameOverActive) return;

  isGameOverActive = true;
  sequenceRunId += 1;
  isPlaying = false;
  canAcceptInput = false;
  isShowingSequence = false;
  disablePads(true);
  setStatus('Game Over');
  playErrorSound();
  vibrateGameOver();

  finalScoreEl.textContent = score;
  const previousBest = highScore;
  gameOverOverlay.classList.remove('hidden');

  if (score > 0 && playerName) {
    await submitScoreToBackend(playerName, score);
    loadHighScore();
    showGameOverRankMessage(previousBest);
  } else {
    newRecordMsg.classList.add('hidden');
    leaderboardRankMsg.classList.add('hidden');
  }
}

function restartGame() {
  gameOverOverlay.classList.add('hidden');
  newRecordMsg.classList.add('hidden');
  leaderboardRankMsg.classList.add('hidden');
  leaderboardRankMsg.classList.remove('rank-gold-text');
  isGameOverActive = false;
  startGame();
}

async function handlePadTap(colorIndex) {
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
    await gameOver();
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

btnContinue.addEventListener('click', continueFromName);

playerNameInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    continueFromName();
  }
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

btnMenu.addEventListener('click', () => {
  gameOverOverlay.classList.add('hidden');
  isGameOverActive = false;
  sequenceRunId += 1;
  isPlaying = false;
  showTitleScreen();
});

pads.forEach((pad) => {
  const colorIndex = parseInt(pad.dataset.color, 10);

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

const savedName = localStorage.getItem(PLAYER_NAME_KEY);
if (savedName) {
  playerName = normalizeName(savedName);
  playerNameInput.value = playerName;
}

disablePads(true);
showNameScreen();
