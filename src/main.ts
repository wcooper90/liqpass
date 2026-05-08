import './style.css';
import { App } from './app';
import { initAbout } from './about';
import { initTheme } from './theme';

document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  initAbout();
  new App();
});
