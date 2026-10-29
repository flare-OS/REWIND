import './config.js';
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
  document.querySelector('#birth-field').classList.toggle('hidden', !signup);
  document.querySelector('#age-note').classList.toggle('hidden', !signup);
  document.querySelector('#age-confirm-field').classList.toggle('hidden', !signup);
  document.querySelector('#terms-accept-field').classList.toggle('hidden', !signup);
  document.querySelector('[name=email]').required = false;
  document.querySelector('[name=dateOfBirth]').required = signup;
  document.querySelector('[name=confirmAge]').required = signup;document.querySelector('[name=confirmAge]').checked = false;
  document.querySelector('[name=acceptTerms]').required = signup;document.querySelector('[name=acceptTerms]').checked = false;
  updateSupervisorField();
  document.querySelector('[name=username]').required = true;
  document.querySelector('#switch-copy').textContent = signup ? 'Already have an account?' : 'New to REWIND?';
  document.querySelector('#switch-auth').textContent = signup ? 'Log in' : 'Create an account';
  document.querySelector('#auth-message').textContent = '';
  document.querySelector('[name=password]').autocomplete = signup ? 'new-password' : 'current-password';
}
function updateSupervisorField() {
  const field=document.querySelector('#supervisor-field'),input=document.querySelector('[name=supervisorUsername]'),dob=document.querySelector('[name=dateOfBirth]').value;
  if(authMode!=='signup'){field.classList.add('hidden');input.required=false;return}
  const date=dob?new Date(`${dob}T00:00:00`):null;
  if(!date||Number.isNaN(date.getTime())){field.classList.add('hidden');input.required=false;return}
  const now=new Date();let age=now.getFullYear()-date.getFullYear();if(now.getMonth()<date.getMonth()||(now.getMonth()===date.getMonth()&&now.getDate()<date.getDate()))age--;
  field.classList.toggle('hidden',age>=15);input.required=age>=13&&age<15;
}
const birthInput=document.querySelector('[name=dateOfBirth]');const ageCutoff=new Date();ageCutoff.setFullYear(ageCutoff.getFullYear()-13);birthInput.max=ageCutoff.toISOString().slice(0,10);birthInput.addEventListener('input',updateSupervisorField);
document.querySelectorAll('[data-open-auth]').forEach(button => button.addEventListener('click', () => { setAuthMode(button.dataset.openAuth); dialog.showModal(); }));
document.querySelector('#switch-auth').addEventListener('click', () => setAuthMode(authMode === 'login' ? 'signup' : 'login'));
document.querySelector('#auth-form').addEventListener('submit', async event => {
  event.preventDefault();
  const form = new FormData(event.currentTarget), message = document.querySelector('#auth-message'), button = document.querySelector('#auth-submit');
  button.disabled = true; message.textContent = 'Connecting…';
  try {
    const body = Object.fromEntries(form.entries());
    if(authMode==='signup'){body.confirmAge=form.has('confirmAge');body.acceptTerms=form.has('acceptTerms');body.ackPrivacy=form.has('acceptTerms')}
    await api(`auth/${authMode}`, { method: 'POST', body: JSON.stringify(body) });
    dialog.close(); await loadSession();
  } catch (error) { message.textContent = error.message; }
  finally { button.disabled = false; }
});
async function loadSession() {
  try {
    const { user } = await api('auth/me');
    const chip = document.querySelector('#user-chip'); chip.textContent = `${user.username} · ${user.role}`; chip.classList.remove('hidden');
    const navigation=document.querySelector('#primary-nav');if(navigation&&!navigation.querySelector('#profile-nav-link')){const link=document.createElement('a');link.id='profile-nav-link';link.href=`users/${encodeURIComponent(user.id)}`;link.textContent='My profile';navigation.insertBefore(link,navigation.querySelector('.mobile-menu-actions'));}
    document.body.classList.add('signed-in');const dashboard=document.querySelector('#member-dashboard');dashboard?.classList.remove('portal-hidden');const welcome=document.querySelector('#welcome-user');if(welcome)welcome.textContent=`Welcome back, ${user.username}`;document.querySelector('.hero')?.classList.add('portal-hidden');document.querySelector('.discovery-links')?.classList.add('portal-hidden');document.querySelector('.creator-banner')?.classList.add('portal-hidden');
    document.querySelectorAll('[data-open-auth]').forEach(b => b.classList.add('hidden'));
    if (['owner','asset_mod'].includes(user.role) && !document.querySelector('#admin-link')) { const link=document.createElement('a');link.id='admin-link';link.href='admin/';link.className='button button-quiet';link.textContent='Admin';chip.before(link); }
    try { const family=await api('guardian'); document.querySelector('#guardian-link').classList.toggle('hidden',!(family.age<15||family.requests?.length||family.link?.supervisor_user_id===family.viewerId)); } catch { document.querySelector('#guardian-link').classList.add('hidden'); }
    const logout = document.querySelector('#logout-button'); if (!logout) { const out=document.createElement('button');out.id='logout-button';out.className='button button-quiet';out.textContent='Log out';out.onclick=async()=>{try{await api('auth/logout',{method:'POST'});location.reload()}catch(e){alert(e.message)}};chip.after(out); }
    const mobileLogout=document.querySelector('#mobile-logout');if(mobileLogout){mobileLogout.classList.remove('hidden');mobileLogout.onclick=()=>document.querySelector('#logout-button')?.click()}
    await loadAccount();
    await loadFriends();
    return user;
  } catch { return null; }
}
async function loadFriends(){const list=document.querySelector('#friends-list');if(!list)return;try{const {friends,requests}=await api('friends');list.innerHTML='<b>Your friends</b><p>'+friends.map(f=>escapeHtml(f.username)).join(', ')+'</p>';document.querySelector('#friend-requests').innerHTML=requests.length?'<b>Requests</b>'+requests.map(f=>`<p>${escapeHtml(f.username)} <button data-accept-friend="${escapeHtml(f.id)}">Accept</button></p>`).join(''):'';document.querySelectorAll('[data-accept-friend]').forEach(b=>b.onclick=async()=>{try{await api('friends',{method:'POST',body:JSON.stringify({action:'accept',userId:b.dataset.acceptFriend})});await loadFriends()}catch(e){alert(e.message)}})}catch{}}
document.querySelector('#friend-request-form')?.addEventListener('submit',async e=>{e.preventDefault();try{await api('friends',{method:'POST',body:JSON.stringify({action:'request',username:new FormData(e.currentTarget).get('username')})});document.querySelector('#friend-message').textContent='Friend request sent.';e.currentTarget.reset()}catch(err){document.querySelector('#friend-message').textContent=err.message}});
function escapeHtml(value = '') { return String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
async function loadAccount(){const panel=document.querySelector('#account-plan-panel');try{const {account,entitlements,choices}=await api('account');if(!panel)return;panel.className='admin-card';panel.innerHTML=`<b>${escapeHtml(account.plan.toUpperCase())} plan · ${account.orbs} Orbs</b><p>${Math.floor(account.play_seconds/60)} minutes playtime · Friend limit ${entitlements.friends??'unlimited'} · Daily allowance ${entitlements.daily} Orbs${account.starcode?` · Starcode ${escapeHtml(account.starcode)}`:''}</p>${Object.entries(choices).map(([plan,c])=>`<button class="button button-outline" data-upgrade="${plan}">Get ${plan} · ${c.orbs} Orbs or ${c.seconds/60} minutes playtime</button>`).join('')}`;panel.querySelectorAll('[data-upgrade]').forEach(button=>button.onclick=async()=>{const plan=button.dataset.upgrade,choice=choices[plan],method=confirm(`Use ${choice.orbs} Orbs? Choose Cancel to use the required playtime instead.`)?'orbs':'playtime';try{await api('account',{method:'POST',body:JSON.stringify({action:'upgrade',plan,method})});await loadAccount()}catch(e){alert(e.message)}})}catch(e){if(panel)panel.textContent=e.message}}
document.querySelector('#report-form')?.addEventListener('submit',async event=>{event.preventDefault();const data=Object.fromEntries(new FormData(event.currentTarget));const message=document.querySelector('#report-message');try{await api('account',{method:'POST',body:JSON.stringify({action:'report',...data})});message.textContent='Report submitted for review.';event.currentTarget.reset()}catch(e){message.textContent=e.message}});
document.querySelector('#refresh-places')?.addEventListener('click', loadPlaces);
loadSession();
