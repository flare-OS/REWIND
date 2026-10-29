import './config.js';

const apiBase=(window.REWIND_CONFIG?.apiBase||(location.hostname==='localhost'||location.hostname==='127.0.0.1'?'':'https://api.rwd.2bd.net')).replace(/\/$/,'');
const $=selector=>document.querySelector(selector);
const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const userId=location.pathname.split('/').filter(Boolean).at(-1)||'';

function safeColor(value,fallback){return typeof value==='string'&&/^#[0-9a-f]{6}$/i.test(value)?value:fallback}

function renderPlaces(places){
  const grid=$('#profile-places');
  grid.innerHTML=places.map(place=>`<article class="world-card"><a class="profile-place-cover" href="../games/" aria-label="Explore ${escapeHtml(place.name)}">${place.icon_url?`<img src="${escapeHtml(place.icon_url)}" alt="" loading="lazy">`:'✧'}</a><div class="world-info"><b>${escapeHtml(place.name)}</b><p>${escapeHtml(place.genre||'All')} · ${new Date(place.published_at||Date.now()).toLocaleDateString()}</p></div></article>`).join('')||'<div class="empty-card games-empty"><div class="empty-icon">✧</div><h3>No public experiences yet</h3><p>This creator has not published a public place.</p></div>';
}

async function loadProfile(){
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId))throw Error('User profile not found.');
  const response=await fetch(`${apiBase}/api/users/${encodeURIComponent(userId)}`,{credentials:'include'});
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw Error(data.error||`Could not load profile (${response.status})`);
  const {user,places=[]}=data;
  document.title=`${user.username} · REWIND`;
  $('#profile-name').textContent=user.username;
  $('#profile-meta').textContent=`Joined ${new Date(user.created_at).toLocaleDateString(undefined,{year:'numeric',month:'long'})} · ${user.role==='user'?'Creator':user.role==='owner'?'REWIND owner':'Asset moderator'}`;
  const avatar=$('#profile-avatar');
  avatar.style.setProperty('--avatar-skin',safeColor(user.avatar?.skin,'#dca77f'));
  avatar.style.setProperty('--avatar-body',safeColor(user.avatar?.body,'#8271db'));
  $('#copy-profile').addEventListener('click',async event=>{
    try{await navigator.clipboard.writeText(location.href);event.currentTarget.textContent='Link copied'}catch{event.currentTarget.textContent='Copy unavailable'}
  });
  renderPlaces(places);
  $('#profile-status').hidden=true;
  $('#profile-content').hidden=false;
}

loadProfile().catch(error=>{$('#profile-status').textContent=error.message});
