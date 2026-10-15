// Read a colour from theme.css where CSS variables can't be used directly,
// like three.js materials, which need a real colour string. `fallback` is used
// if the variable isn't defined (e.g. the stylesheet hasn't loaded yet).
export const themeColor = (name: string, fallback: string) =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
