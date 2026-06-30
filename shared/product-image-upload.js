/**
 * Dev-server upload for images into the repo-root `products/` folder.
 * Used by admin editors; static hosting has no write API — use /products/ paths or https URLs.
 */

const UPLOAD_PATH = '/api/products/upload';

/**
 * @param {string} name
 */
function safeUploadFilename(name) {
  const base = String(name || 'image.jpg')
    .replace(/[/\\?%*:|"<>]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 120);
  if (!base || base === '.' || base === '..') return `image-${Date.now()}.jpg`;
  return base;
}

/**
 * @param {File} file
 * @param {{ prefix?: string }} [opts]
 * @returns {Promise<string>} Persisted path, e.g. `/products/mkt-1234-banner.jpg`
 */
export async function uploadProductImage(file, opts = {}) {
  const prefix = String(opts.prefix || 'mkt').replace(/[^a-z0-9_-]/gi, '') || 'mkt';
  const filename = `${prefix}-${Date.now()}-${safeUploadFilename(file.name)}`;

  const data = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error || new Error('Не удалось прочитать файл'));
    reader.readAsDataURL(file);
  });

  const res = await fetch(UPLOAD_PATH, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filename, data }),
  });

  if (!res.ok) {
    let message = 'Не удалось загрузить изображение';
    try {
      const body = await res.json();
      if (body?.error) message = body.error;
    } catch {
      /* ignore */
    }
    throw new Error(message);
  }

  const body = await res.json();
  const path = String(body?.path || '').trim();
  if (!path.startsWith('/products/')) {
    throw new Error('Сервер вернул некорректный путь к файлу');
  }
  return path;
}
