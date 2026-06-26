export function requestJson<T>(url: string, timeout = 15_000): Promise<T> {
  return new Promise((resolve, reject) => {
    GM_xmlhttpRequest({
      method: 'GET',
      url,
      headers: { Accept: 'application/json' },
      timeout,
      onload: (res) => {
        try {
          if (res.status < 200 || res.status >= 300) {
            reject(new Error(`HTTP ${res.status}`));
            return;
          }

          resolve(JSON.parse(res.responseText) as T);
        } catch (error) {
          reject(error);
        }
      },
      ontimeout: () => reject(new Error('Tiempo de espera agotado')),
      onerror: () => reject(new Error('Error de red')),
    });
  });
}
