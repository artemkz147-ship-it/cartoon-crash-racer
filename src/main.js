import './style.css';
import { Game } from './game/Game.js';

const canvas = document.getElementById('game-canvas');
const startScreen = document.getElementById('start-screen');
const startBtn = document.getElementById('start-btn');

let game = null;

function boot() {
  game = new Game(canvas);
  // Render one frame so start screen has a live backdrop feel if desired
  game.renderer.render(game.scene, game.camera);
}

startBtn.addEventListener('click', () => {
  startScreen.classList.add('hidden');
  if (!game) boot();
  game.start();
});

boot();
