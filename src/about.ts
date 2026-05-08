const PRIVACY_URL = 'https://wcooper90.github.io/liqpass/privacy.html';

export function initAbout() {
  const btn = document.getElementById('about-btn');
  const modal = document.getElementById('about-modal') as HTMLElement | null;
  const closeBtn = document.getElementById('about-close');
  const privacyLink = document.getElementById('about-privacy') as HTMLAnchorElement | null;

  if (privacyLink) privacyLink.href = PRIVACY_URL;

  const open = () => modal?.classList.add('visible');
  const close = () => modal?.classList.remove('visible');

  btn?.addEventListener('click', open);
  closeBtn?.addEventListener('click', close);
  modal?.addEventListener('click', (e) => {
    if (e.target === modal) close();
  });
}
