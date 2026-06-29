/**
 * Scroll edge hint: footer shadow + gradient fade when scrollable main overflows.
 * @returns {() => void} cleanup
 */
export function bindScrollFade({
  shell,
  main,
  fade,
  footer,
  classScrollHint = 'shell--scroll-hint',
  classHasOverflow = 'shell--has-overflow',
}) {
  if (!main || !fade) return () => {};

  const update = () => {
    const hasOverflow = main.scrollHeight > main.clientHeight + 8;
    const atBottom = main.scrollTop + main.clientHeight >= main.scrollHeight - 12;
    const showHint = hasOverflow && !atBottom;

    fade.hidden = !showHint;
    shell?.classList.toggle(classScrollHint, showHint);
    shell?.classList.toggle(classHasOverflow, hasOverflow);

    if (footer) {
      fade.style.bottom = `${footer.offsetHeight}px`;
    }
  };

  main.addEventListener('scroll', update, { passive: true });
  window.addEventListener('resize', update);
  const ro = new ResizeObserver(update);
  ro.observe(main);
  if (footer) ro.observe(footer);
  const mo = new MutationObserver(() => requestAnimationFrame(update));
  mo.observe(main, { childList: true, subtree: true });
  requestAnimationFrame(update);
  setTimeout(update, 120);

  return () => {
    main.removeEventListener('scroll', update);
    window.removeEventListener('resize', update);
    ro.disconnect();
    mo.disconnect();
    shell?.classList.remove(classScrollHint, classHasOverflow);
  };
}
