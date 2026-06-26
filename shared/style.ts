export function injectCss(css: string, id?: string): HTMLStyleElement {
  if (id) {
    const existing = document.getElementById(id);
    if (existing instanceof HTMLStyleElement) {
      existing.textContent = css;
      return existing;
    }
  }

  const style = document.createElement('style');
  if (id) style.id = id;
  style.textContent = css;
  document.head.appendChild(style);
  return style;
}
