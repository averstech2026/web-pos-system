// ─── Адаптивное масштабирование ────────────────────────────────
function fitKiosk() {
  const wrapper = document.getElementById('kiosk-wrapper');
  const kiosk = document.getElementById('kiosk');
  const isMobile = window.matchMedia('(max-width: 768px)').matches;
  const viewport = window.visualViewport;
  const vw = viewport?.width ?? window.innerWidth;
  const vh = viewport?.height ?? window.innerHeight;
  const offsetTop = viewport?.offsetTop ?? 0;
  const offsetLeft = viewport?.offsetLeft ?? 0;

  wrapper.style.position = '';
  wrapper.style.left = '';
  wrapper.style.top = '';
  wrapper.style.width = '';
  wrapper.style.height = '';
  wrapper.style.overflow = '';
  wrapper.style.transform = '';
  kiosk.style.transform = '';
  kiosk.style.left = '';
  kiosk.style.top = '';

  if (isMobile) {
    document.documentElement.classList.add('kiosk-mobile');
    document.body.classList.add('kiosk-mobile');
    document.body.classList.remove('kiosk-desktop');

    const sidePad = 8;
    const availW = vw - sidePad * 2;
    const coverScale = Math.max(availW / 1080, vh / 1920);
    const scale = coverScale * 0.97;
    const scaledW = 1080 * scale;
    const scaledH = 1920 * scale;

    wrapper.style.width = vw + 'px';
    wrapper.style.height = vh + 'px';
    wrapper.style.position = 'fixed';
    wrapper.style.left = offsetLeft + 'px';
    wrapper.style.top = offsetTop + 'px';
    wrapper.style.overflow = 'hidden';

    kiosk.style.transform = `scale(${scale})`;
    kiosk.style.left = ((vw - scaledW) / 2) + 'px';
    kiosk.style.top = ((vh - scaledH) / 2) + 'px';
  } else {
    document.documentElement.classList.remove('kiosk-mobile');
    document.body.classList.remove('kiosk-mobile');
    document.body.classList.add('kiosk-desktop');
    const maxW = Math.min(vw - 32, 450);
    const maxH = vh - 32;
    const scale = Math.min(maxW / 1080, maxH / 1920, 0.5);
    wrapper.style.width = (1080 * scale) + 'px';
    wrapper.style.height = (1920 * scale) + 'px';
    kiosk.style.transform = `scale(${scale})`;
  }
}

export { fitKiosk };
