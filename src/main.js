import './style.css';
import { Game } from './game/Game.js';

const canvas = document.getElementById('game-canvas');
const startScreen = document.getElementById('start-screen');
const startBtn = document.getElementById('start-btn');
const pauseOverlay = document.getElementById('pause-overlay');
const resumeBtn = document.getElementById('resume-btn');
const resultsScreen = document.getElementById('results-screen');
const againBtn = document.getElementById('again-btn');

let game = null;

function boot() {
  game = new Game(canvas);
  game.renderer.render(game.scene, game.camera);
}

function startGame() {
  startScreen.classList.add('hidden');
  resultsScreen?.classList.add('hidden');
  if (!game) boot();
  // Soft reset cars if restarting
  if (game.finished) {
    location.reload();
    return;
  }
  game.audio.ensure();
  game.start();
  try {
    if (screen.orientation?.lock) {
      screen.orientation.lock('landscape').catch(() => {});
    }
  } catch (_) {}
}

startBtn.addEventListener('click', startGame);
startBtn.addEventListener('pointerup', (e) => {
  if (!startScreen.classList.contains('hidden')) {
    e.preventDefault();
    startGame();
  }
});

startScreen.addEventListener('pointerup', (e) => {
  if (e.target === startBtn) return;
  if (e.target.closest('button')) return;
  if (
    e.target === startScreen ||
    e.target.tagName === 'H1' ||
    e.target.classList.contains('subtitle')
  ) {
    startGame();
  }
});

resumeBtn?.addEventListener('click', () => {
  pauseOverlay.classList.add('hidden');
  game?.resume();
});
pauseOverlay?.addEventListener('pointerup', (e) => {
  if (e.target === pauseOverlay || e.target === resumeBtn) {
    pauseOverlay.classList.add('hidden');
    game?.resume();
  }
});

againBtn?.addEventListener('click', () => {
  location.reload();
});
againBtn?.addEventListener('pointerup', (e) => {
  e.preventDefault();
  location.reload();
});

window.__showPauseOverlay = (show) => {
  pauseOverlay?.classList.toggle('hidden', !show);
};

boot();
