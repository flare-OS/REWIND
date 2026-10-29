import './config.js';

const apiBase=(window.REWIND_CONFIG?.apiBase||(location.hostname==='localhost'||location.hostname==='127.0.0.1'?'':'https://api.rwd.2bd.net')).replace(/\/$/,'');
const $=selector=>document.querySelector(selector);
const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
let offset=0,type='all',search='',hasMore=false,loading=false,requestVersion=0,reloadAfterCurrent=false,assets=[];
const typeNames={game_icon:'Image',game_thumbnail:'Thumbnail',decal:'Decal',audio:'Audio',model:'3D model'};

function formatSize(bytes){
  if(!Number.isFinite(Number(bytes))||Number(bytes)<=0)return'';
  const units=['B','KB','MB'];let size=Number(bytes),unit=0;
  while(size>=1024&&unit<units.length-1){size/=1024;unit++}
  return`${size.toFixed(unit?1:0)} ${units[unit]}`;
}

function assetCard(asset,index){
  const kind=asset.asset_type,isImage=['game_icon','game_thumbnail','decal'].includes(kind);
  const preview=isImage
    ?`<a class="catalog-preview image-preview" href="${escapeHtml(asset.public_url)}" target="_blank" rel="noopener" aria-label="Open ${escapeHtml(asset.name)}"><img src="${escapeHtml(asset.public_url)}" alt="${escapeHtml(asset.name)}" loading="lazy"></a>`
    :kind==='audio'
      ?`<div class="catalog-preview audio-preview"><span class="audio-glyph" aria-hidden="true">♫</span><audio controls preload="none" src="${escapeHtml(asset.public_url)}" aria-label="Play ${escapeHtml(asset.name)}"></audio></div>`
      :`<div class="catalog-preview model-preview"><model-viewer src="${escapeHtml(asset.public_url)}" alt="${escapeHtml(asset.name)}" camera-controls auto-rotate rotation-per-second="20deg" loading="lazy"></model-viewer><a class="model-fallback" href="${escapeHtml(asset.public_url)}" target="_blank" rel="noopener">Open model ↗</a></div>`;
  const size=formatSize(asset.byte_size);
  return`<article class="catalog-card" style="--card-order:${index}">${preview}<div class="catalog-card-info"><div class="catalog-card-title"><b>${escapeHtml(asset.name)}</b><span>${escapeHtml(typeNames[kind]||kind)}</span></div>${asset.description?`<p class="catalog-description">${escapeHtml(asset.description)}</p>`:''}<div class="catalog-card-meta"><span>by ${asset.owner_id?`<a href="/users/${encodeURIComponent(asset.owner_id)}">${escapeHtml(asset.owner_username||'creator')}</a>`:escapeHtml(asset.owner_username||'REWIND creator')}</span>${size?`<span>${size}</span>`:''}</div></div></article>`;
}

function render(){
  const grid=$('#catalog-grid'),count=$('#catalog-count'),more=$('#catalog-load-more');
  grid.innerHTML=assets.map(assetCard).join('')||`<div class="empty-state catalog-empty">${search?'No assets match your search.':'No approved assets in the catalog yet.'}</div>`;
  count.textContent=`${assets.length}${hasMore?'+':''} ${assets.length===1?'asset':'assets'}${type!=='all'?` · ${type==='image'?'Images':type==='audio'?'Audio':'3D models'}`:''}`;
  more.hidden=!hasMore;
  more.textContent='Load more';
}

async function load(append=false){
  if(loading){if(!append)reloadAfterCurrent=true;return}
  loading=true;
  const version=requestVersion,grid=$('#catalog-grid'),count=$('#catalog-count'),more=$('#catalog-load-more');
  if(!append)grid.innerHTML='<div class="empty-state catalog-empty">Loading catalog…</div>';
  more.disabled=true;
  const query=new URLSearchParams({type});
  if(search)query.set('search',search);
  if(append&&offset>0)query.set('offset',String(offset));
  try{
    const response=await fetch(`${apiBase}/api/assets?${query}`,{credentials:'include'});
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw Error(data.error||`Request failed (${response.status})`);
    if(version!==requestVersion)return;
    assets=append?assets.concat(data.assets||[]):data.assets||[];
    offset=append?offset+(data.assets||[]).length:assets.length;
    hasMore=Boolean(data.hasMore);
    render();
  }catch(error){
    if(version!==requestVersion)return;
    if(append){count.textContent=`Could not load more assets: ${error.message}`;more.textContent='Try again';more.disabled=false}
    else grid.innerHTML=`<div class="empty-state catalog-empty">Catalog could not be loaded. ${escapeHtml(error.message)} <button class="button button-outline" data-catalog-retry type="button">Try again</button></div>`;
  }finally{
    loading=false;
    if(!reloadAfterCurrent&&version===requestVersion)more.disabled=false;
    if(reloadAfterCurrent){reloadAfterCurrent=false;load()}
  }
}

function reset(){requestVersion++;offset=0;assets=[];load()}

document.querySelectorAll('[data-catalog-filter]').forEach(button=>button.addEventListener('click',()=>{
  document.querySelectorAll('[data-catalog-filter]').forEach(tab=>tab.classList.toggle('active',tab===button));
  type=button.dataset.catalogFilter;
  reset();
}));

let searchTimer;
$('#catalog-search').addEventListener('input',event=>{
  clearTimeout(searchTimer);
  search=event.currentTarget.value.trim();
  searchTimer=setTimeout(reset,220);
});
$('#catalog-load-more').addEventListener('click',()=>load(true));
$('#catalog-grid').addEventListener('click',event=>{if(event.target.closest('[data-catalog-retry]'))load()});
load();
