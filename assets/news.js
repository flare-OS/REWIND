import './config.js';

const apiBase=(window.REWIND_CONFIG?.apiBase||(location.hostname==='localhost'||location.hostname==='127.0.0.1'?'':'https://api.rwd.2bd.net')).replace(/\/$/,'');
const $=selector=>document.querySelector(selector);
const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
async function api(path){
  const response=await fetch(`${apiBase}/api/${path}`,{credentials:'include'});
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(data.error||`Request failed (${response.status})`);
  return data;
}
function excerpt(post){return post.summary||String(post.content||'').replace(/\s+/g,' ').slice(0,200)}
function renderCard(post){
  return`<article class="news-card"><span class="eyebrow">REWIND NEWS · ${new Date(post.published_at).toLocaleDateString()}</span><h2><a href="?id=${encodeURIComponent(post.id)}">${escapeHtml(post.title)}</a></h2><p>${escapeHtml(excerpt(post))}</p><a class="button button-outline" href="?id=${encodeURIComponent(post.id)}">Read news</a></article>`;
}
function renderPost(post){
  $('#news-list').innerHTML=`<article class="news-article"><a class="news-back" href="./">← All news</a><span class="eyebrow">REWIND NEWS · ${new Date(post.published_at).toLocaleDateString()}</span><h1>${escapeHtml(post.title)}</h1><p class="news-summary">${escapeHtml(excerpt(post))}</p><div class="news-content">${escapeHtml(post.content).replace(/\r?\n/g,'<br>')}</div><div class="news-share"><button id="share-news" class="button button-primary" type="button">Copy share link</button><span id="news-share-status" aria-live="polite"></span></div></article>`;
  $('#share-news').addEventListener('click',async()=>{
    const url=`${apiBase}/api/news/share?id=${encodeURIComponent(post.id)}`;
    try{await navigator.clipboard.writeText(url);$('#news-share-status').textContent='Share link copied.'}
    catch{$('#news-share-status').textContent=url}
  });
}
async function load(){
  const grid=$('#news-list'),id=new URLSearchParams(location.search).get('id');
  try{
    if(id){
      const {post}=await api(`news?id=${encodeURIComponent(id)}`);
      document.title=`${post.title} · REWIND News`;
      renderPost(post);
      return;
    }
    const {posts}=await api('news');
    grid.innerHTML=posts.length?posts.map(renderCard).join(''):'<div class="empty-state news-empty">No news has been published yet. Check back soon.</div>';
  }catch(error){
    grid.innerHTML=`<div class="empty-state news-empty">News could not be loaded. ${escapeHtml(error.message)} <button id="news-retry" class="button button-outline" type="button">Try again</button></div>`;
    $('#news-retry').addEventListener('click',load);
  }
}
load();
