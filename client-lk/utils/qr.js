import QRCode from 'qrcode';

/** Generate QR as a data-URL — works offline, no third-party API. */
export function qrDataUrl(data, size = 200) {
  return QRCode.toDataURL(data, {
    width: size,
    margin: 1,
    color: { dark: '#1E1B4B', light: '#f3f4f6' },
    errorCorrectionLevel: 'M',
  });
}
