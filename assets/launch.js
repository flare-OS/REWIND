(() => {
  if (window.__rewindLaunchInstalled) return;
  window.__rewindLaunchInstalled = true;

  const CLIENT_PROTOCOL = 'rclient';
  let overlay = null;
  let card = null;
  let bar = null;
  let status = null;
  let placeLabel = null;
  let fallback = null;
  let manual = null;
  let currentHref = '';
  let waitTimer = 0;
  let revealTimer = 0;

  function build() {
    if (overlay) return overlay;
    overlay = document.createElement('div');
    overlay.className = 'rw-launch-overlay';
    overlay.id = 'rw-launch-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-hidden', 'true');
    overlay.innerHTML = [
      '<div class="rw-launch-card">',
      '  <button class="rw-launch-close" type="button" aria-label="Close launch dialog">×</button>',
      '  <div class="rw-launch-brand"><img src="' + new URL('../assets/rewind-mark.svg', import.meta.url).href + '" alt=""><b>REWIND</b></div>',
      '  <h2>Opening your world...</h2>',
      '  <p class="rw-launch-place"></p>',
      '  <div class="rw-launch-track"><i></i></div>',
      '  <p class="rw-launch-status">Starting REWIND Client...</p>',
      '  <div class="rw-launch-actions">',
      '    <button class="button button-primary" type="button" data-launch-client>Open REWIND Client</button>',
      '    <a class="rw-launch-fallback" data-direct-play href="#" target="_self">Play in browser instead</a>',
      '  </div>',
      '  <p class="rw-launch-note">This experience opens in the REWIND desktop client. If it does not launch, install the client or continue in your browser.</p>',
      '</div>'
    ].join('');
    document.body.append(overlay);
    card = overlay.querySelector('.rw-launch-card');
    bar = overlay.querySelector('.rw-launch-track i');
    status = overlay.querySelector('.rw-launch-status');
    placeLabel = overlay.querySelector('.rw-launch-place');
    fallback = overlay.querySelector('[data-direct-play]');
    manual = overlay.querySelector('[data-launch-client]');

    overlay.querySelector('.rw-launch-close').addEventListener('click', close);
    overlay.addEventListener('click', event => { if (event.target === overlay) close(); });
    manual.addEventListener('click', launch);
    fallback.addEventListener('click', () => {
      if (currentHref) window.location.href = currentHref;
    });
    return overlay;
  }

  function resetTimers() {
    clearTimeout(waitTimer);
    clearTimeout(revealTimer);
  }

  function setProgress(value) {
    if (bar) bar.style.width = Math.max(0, Math.min(100, value)) + '%';
  }

  function launch() {
    if (!currentHref) return;
    const id = new URL(currentHref, location.href).searchParams.get('id');
    if (!id) return;
    const deepLink = CLIENT_PROTOCOL + '://play?placeId=' + encodeURIComponent(id);
    status.textContent = 'Asking Windows to open REWIND Client...';
    try { window.location.href = deepLink; } catch { /* The browser may block custom protocols. */ }
  }

  function open(id, href, title) {
    build();
    currentHref = href;
    resetTimers();
    card.classList.remove('waiting');
    setProgress(7);
    status.textContent = 'Starting REWIND Client...';
    placeLabel.textContent = title ? title : 'Loading your experience...';
    fallback.href = href;
    overlay.classList.add('open');
    overlay.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';

    revealTimer = setTimeout(() => setProgress(48), 180);
    setTimeout(() => setProgress(78), 720);
    waitTimer = setTimeout(() => {
      card.classList.add('waiting');
      setProgress(94);
      status.textContent = 'Still waiting? Open the client manually, or continue in your browser.';
    }, 2600);

    // Run the custom-protocol navigation inside the original click gesture so
    // Chrome and Edge can show their "Open REWIND Client?" prompt.
    requestAnimationFrame(launch);
  }

  function close() {
    if (!overlay) return;
    resetTimers();
    overlay.classList.remove('open');
    overlay.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    setTimeout(() => { if (overlay && !overlay.classList.contains('open')) { setProgress(0); if (card) card.classList.remove('waiting'); } }, 240);
  }

  document.addEventListener('click', event => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const anchor = event.target.closest('a[href*="play/?id="]');
    if (!anchor || anchor.hasAttribute('data-direct-play')) return;
    let url;
    try { url = new URL(anchor.getAttribute('href'), location.href); } catch { return; }
    const id = url.searchParams.get('id');
    if (!id) return;
    event.preventDefault();
    const card = anchor.closest('.world-card, .profile-header, article, section');
    const title = card?.querySelector('b, h3, h2, #profile-name')?.textContent?.trim() || '';
    open(id, url.href, title);
  });

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') close();
  });
})();
