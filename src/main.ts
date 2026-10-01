import { Game } from './core/game';

const container = document.getElementById('app');
if (!container) throw new Error('#app container missing');
new Game(container).start();
