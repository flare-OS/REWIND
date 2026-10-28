const config = window.REWIND_CONFIG || {};
const apiBase = (config.apiBase || (location.hostname === 'localhost' || location.hostname === '127.0.0.1' ? '' : 'https://api.rwd.2bd.net')).replace(/\/$/, '');
async function api(path, options = {}) {
  const response = await fetch(`${apiBase}/api/${path}`, { credentials: 'include', ...options, headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
  return data;
}
const dialog = document.querySelector('#auth-dialog');
let authMode = 'login';
function setAuthMode(mode) {
  authMode = mode;
  const signup = mode === 'signup';
  document.querySelector('#auth-title').textContent = signup ? 'Create your account' : 'Welcome back';
  document.querySelector('#auth-subtitle').textContent = signup ? 'Your next world begins with a username.' : 'Pick up where your imagination left off.';
  document.querySelector('#auth-submit').textContent = signup ? 'Create account' : 'Log in';
  document.querySelector('#username-field').classList.remove('hidden');
  document.querySelector('#email-field').classList.toggle('hidden', !signup);
  document.querySelector('#bootstrap-field').classList.toggle('hidden', !signup);
  document.querySelector('[name=username]').required = true;
  document.querySelector('#switch-copy').textContent = signup ? 'Already have an account?' : 'New to REWIND?';
  document.querySelector('#switch-auth').textContent = signup ? 'Log in' : 'Create an account';
  document.querySelector('#auth-message').textContent = '';
  document.querySelector('[name=password]').autocomplete = signup ? 'new-password' : 'current-password';
}
document.querySelectorAll('[data-open-auth]').forEach(button => button.addEventListener('click', () => { setAuthMode(button.dataset.openAuth); dialog.showModal(); }));
document.querySelector('#switch-auth').addEventListener('click', () => setAuthMode(authMode === 'login' ? 'signup' : 'login'));
document.querySelector('#auth-form').addEventListener('submit', async event => {
  event.preventDefault();
  const form = new FormData(event.currentTarget), message = document.querySelector('#auth-message'), button = document.querySelector('#auth-submit');
  button.disabled = true; message.textContent = 'Connecting…';
  try {
    const body = Object.fromEntries(form.entries());
    await api(`auth/${authMode}`, { method: 'POST', body: JSON.stringify(body) });
    dialog.close(); await loadSession();
  } catch (error) { message.textContent = error.message; }
  finally { button.disabled = false; }
});
async function loadSession() {
  try {
    const { user } = await api('auth/me');
    const chip = document.querySelector('#user-chip'); chip.textContent = `${user.username} · ${user.role}`; chip.classList.remove('hidden');
    document.querySelectorAll('[data-open-auth]').forEach(b => b.classList.add('hidden'));
    if (['owner','asset_mod'].includes(user.role) && !document.querySelector('#admin-link')) { const link=document.createElement('a');link.id='admin-link';link.href='admin/';link.className='button button-quiet';link.textContent='Admin';chip.before(link); }
    const logout = document.querySelector('#logout-button'); if (!logout) { const out=document.createElement('button');out.id='logout-button';out.className='button button-quiet';out.textContent='Log out';out.onclick=async()=>{try{await api('auth/logout',{method:'POST'});location.reload()}catch(e){alert(e.message)}};chip.after(out); }
    return user;
  } catch { return null; }
}
async function loadPlaces() {
  const grid = document.querySelector('#world-grid');
  try {
    const { places = [] } = await api('places?published=true');
    if (!places.length) return;
    grid.innerHTML = places.map(place => `<article class="world-card"><div class="world-cover">${place.icon_url ? `<img src="${escapeHtml(place.icon_url)}" alt="" style="width:100%;height:100%;object-fit:cover">` : '✧'}</div><div class="world-info"><b>${escapeHtml(place.name)}</b><p>${escapeHtml(place.genre || 'All')} · by ${escapeHtml(place.owner_username || 'creator')}</p></div></article>`).join('');
    document.querySelector('#place-search')?.addEventListener('input', event => grid.querySelectorAll('.world-card').forEach(card => card.hidden = !card.textContent.toLowerCase().includes(event.target.value.toLowerCase())));
  } catch { /* API can be configured separately after the static site is deployed. */ }
}
function escapeHtml(value = '') { return String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
document.querySelector('#refresh-places')?.addEventListener('click', loadPlaces);
loadSession(); loadPlaces();
