import './style.css';
import { Game } from './game/Game.js';
import { Menu } from './game/Menu.js';
import { getSettings } from './game/Progress.js';

const canvas = document.getElementById('game-canvas');
const pauseOverlay = document.getElementById('pause-overlay');
const resumeBtn = document.getElementById('resume-btn');
const hud = document.getElementById('hud');
const muteBtn = document.getElementById('mute-btn');
const pauseBtn = document.getElementById('pause-btn');

let game = null;

function setRaceUI(visible) {
  hud?.classList.toggle('hidden', !visible);
  muteBtn?.classList.toggle('hidden', !visible);
  pauseBtn?.classList.toggle('hidden', !visible);
}

function quitToMenu() {
  if (game) {
    try {
      game.dispose();
    } catch (_) {}
    game = null;
  }
  setRaceUI(false);
  pauseOverlay?.classList.add('hidden');
  menu?.show();
}

function startRace(opts) {
  if (game) {
    try {
      game.dispose();
    } catch (_) {}
    game = null;
  }
  setRaceUI(true);
  const settings = getSettings();
  window.__steerSensitivity = settings.sensitivity || 1;

  game = new Game(canvas, {
    ...opts,
    onFinish: (result) => {
      setTimeout(() => {
        setRaceUI(false);
        if (game) {
          try {
            game.dispose();
          } catch (_) {}
          game = null;
        }
        menu.showResults(result);
      }, 900);
    },
  });

  if (settings.muted) {
    game.audio.ensure();
    game.audio.setMuted(true);
    window.__applyMute?.(true);
  }
  game.audio.ensure();
  game.start();
  try {
    screen.orientation?.lock?.('landscape').catch(() => {});
  } catch (_) {}
}

const menu = new Menu({ onStartRace: startRace });
setRaceUI(false);
menu.show();

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

document.getElementById('again-btn')?.addEventListener('click', () => quitToMenu());
document.getElementById('quit-btn')?.addEventListener('click', () => {
  pauseOverlay.classList.add('hidden');
  quitToMenu();
});

window.__showPauseOverlay = (show) => {
  pauseOverlay?.classList.toggle('hidden', !show);
};

pauseBtn?.addEventListener('click', () => game?.togglePause());
