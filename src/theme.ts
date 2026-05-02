type Theme = 'dark' | 'light';

const STORAGE_KEY = 'liqpass-theme';

const SUN_ICON =
  '<path d="M12 4V2m0 20v-2m8-8h2M2 12h2m13.66-5.66l1.42-1.42M4.92 19.08l1.42-1.42m0-11.32L4.92 4.92m14.16 14.16l-1.42-1.42M12 7a5 5 0 100 10 5 5 0 000-10z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>';

const MOON_ICON =
  '<path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>';

function applyTheme(theme: Theme) {
  document.body.classList.toggle('theme-light', theme === 'light');

  const themeColor = theme === 'light' ? '#f5f3ee' : '#0a0a0a';
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', themeColor);

  const iconEl = document.getElementById('theme-icon');
  if (iconEl) {
    iconEl.innerHTML = theme === 'light' ? MOON_ICON : SUN_ICON;
  }
}

export function initTheme() {
  const stored = localStorage.getItem(STORAGE_KEY) as Theme | null;
  const initial: Theme = stored ?? 'dark';
  applyTheme(initial);

  const btn = document.getElementById('theme-toggle');
  btn?.addEventListener('click', () => {
    const isLight = document.body.classList.contains('theme-light');
    const next: Theme = isLight ? 'dark' : 'light';
    applyTheme(next);
    localStorage.setItem(STORAGE_KEY, next);
  });
}
