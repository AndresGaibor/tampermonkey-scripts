type JsonRequestOptions = {
  method: 'GET';
  url: string;
  headers: { Accept: 'application/json' };
  timeout: number;
  onload?: (response: { status: number; responseText: string }) => void;
  ontimeout?: () => void;
  onerror?: () => void;
};

type JsonRequestClient = (options: JsonRequestOptions) => void;

export function createRequestJson(request: JsonRequestClient) {
  return function requestJson(url: string) {
    return new Promise((resolve, reject) => {
      request({
        method: 'GET',
        url,
        headers: {
          Accept: 'application/json',
        },
        timeout: 15000,
        onload: (res) => {
          try {
            if (res.status < 200 || res.status >= 300) {
              reject(new Error(`HTTP ${res.status}`));
              return;
            }

            resolve(JSON.parse(res.responseText));
          } catch (error) {
            reject(error);
          }
        },
        ontimeout: () => reject(new Error('Tiempo de espera agotado')),
        onerror: () => reject(new Error('Error de red')),
      });
    });
  };
}