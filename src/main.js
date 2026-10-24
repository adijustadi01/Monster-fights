// Entry point.
import './style.css';
import { Game } from './game.js';

function boot() {
  const app = document.getElementById('app');
  try {
    new Game(app);
  } catch (err) {
    console.error(err);
    document.getElementById('loading').textContent = 'Sorry - this device could not start WebGL. ' + err.message;
    return;
  }
  document.getElementById('loading').remove();
}

// Prevent pinch-zoom / double-tap zoom on tablets during play
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('dblclick', (e) => e.preventDefault());
document.addEventListener('contextmenu', (e) => e.preventDefault());

boot();
