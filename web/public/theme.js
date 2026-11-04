(() => {
  let preference = 'system';
  try {
    const stored = localStorage.getItem('erase.theme');
    if (stored === 'light' || stored === 'dark') preference = stored;
  } catch {}
  if (preference === 'system') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = preference;
  const colorScheme = document.querySelector('meta[name="color-scheme"]');
  if (colorScheme) colorScheme.content = preference === 'system' ? 'light dark' : preference;
})();
