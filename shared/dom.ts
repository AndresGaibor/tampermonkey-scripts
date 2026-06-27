export { normalizeSpaces, normalizeText } from './text.ts';

export function waitForElement<T extends Element>(
  selector: string,
  options: { timeoutMs?: number; root?: ParentNode } = {},
): Promise<T> {
  const root = options.root ?? document;
  const timeoutMs = options.timeoutMs ?? 10_000;

  const existing = root.querySelector<T>(selector);
  if (existing) return Promise.resolve(existing);

  return new Promise((resolve, reject) => {
    const observer = new MutationObserver(() => {
      const element = root.querySelector<T>(selector);
      if (!element) return;
      clearTimeout(timer);
      observer.disconnect();
      resolve(element);
    });

    const timer = setTimeout(() => {
      observer.disconnect();
      reject(new Error(`No apareció el elemento: ${selector}`));
    }, timeoutMs);

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
  });
}

export function onDomChange(callback: () => void, debounceMs = 250): MutationObserver {
  let timer: number | undefined;

  const observer = new MutationObserver(() => {
    window.clearTimeout(timer);
    timer = window.setTimeout(callback, debounceMs);
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });

  return observer;
}
