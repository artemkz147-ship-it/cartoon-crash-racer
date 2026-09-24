import './style.css';
import { Game } from './game/Game.js';

const canvas = document.getElementById('game-canvas');
const startScreen = document.getElementById('start-screen');
const startBtn = document.getElementById('start-btn');
const pauseOverlay = document.getElementById('pause-overlay');
const resumeBtn = document.getElementById('resume-btn');

let game = null;

function boot() {
  game = new Game(canvas);
  game.renderer.render(game.scene, game.camera);
}

function startGame() {
  startScreen.classList.add('hidden');
  if (!game) boot();
  game.start();
  // Attempt landscape lock on supported browsers / Capacitor WebView
  try {
    if (screen.orientation?.lock) {
      screen.orientation.lock('landscape').catch(() => {});
    }
  } catch (_) {}
}

startBtn.addEventListener('click', startGame);
startBtn.addEventListener('pointerup', (e) => {
  // Extra tap path for stubborn mobile browsers
  if (!startScreen.classList.contains('hidden')) {
    e.preventDefault();
    startGame();
  }
});

// Tap anywhere on start screen also starts
startScreen.addEventListener('pointerup', (e) => {
  if (e.target === startBtn) return;
  if (e.target.closest('button')) return;
  // require deliberate tap on empty area or title
  if (e.target === startScreen || e.target.tagName === 'H1' || e.target.classList.contains('subtitle')) {
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

// Expose pause overlay toggle for Game
window.__showPauseOverlay = (show) => {
  pauseOverlay?.classList.toggle('hidden', !show);
};

boot();
