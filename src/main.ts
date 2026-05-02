import './style.css';
import { App } from './app';
import { initTheme } from './theme';

document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  new App();
});
