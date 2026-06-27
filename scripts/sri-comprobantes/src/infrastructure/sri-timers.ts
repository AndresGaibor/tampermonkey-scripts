export function createSetTimeout() {
  return function setTimeoutWrapper(
    handler: () => void,
    timeout?: number
  ): ReturnType<typeof setTimeout> {
    return setTimeout(handler, timeout);
  };
}

export function createSetInterval() {
  return function setIntervalWrapper(
    handler: () => void,
    timeout?: number
  ): ReturnType<typeof setInterval> {
    return setInterval(handler, timeout);
  };
}

export const setTimeoutWrapper = createSetTimeout();
export const setIntervalWrapper = createSetInterval();