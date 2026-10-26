// Runs before first paint so a stored theme choice does not flash the wrong colors.
try {
  var theme = localStorage.getItem('regex3.theme');
  if (theme === 'light' || theme === 'dark') document.documentElement.setAttribute('data-theme', theme);
  var dark = theme === 'dark' || (theme !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  var meta = document.getElementById('theme-color');
  if (meta) meta.setAttribute('content', dark ? '#111113' : '#ffffff');
} catch (e) {
  // Storage unavailable: fall back to the system preference.
}
