function detectImperial(): boolean {
  const langs = navigator.languages?.length
    ? navigator.languages
    : [navigator.language || 'en-US'];

  for (const lang of langs) {
    const lower = lang.toLowerCase();
    if (
      lower === 'en-us' ||
      lower.endsWith('-us') ||
      lower.endsWith('-lr') ||
      lower.endsWith('-mm')
    ) {
      return true;
    }
  }
  return false;
}

export const useImperial = detectImperial();
