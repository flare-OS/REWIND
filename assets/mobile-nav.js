const toggle=document.querySelector('.mobile-menu-toggle');
const navigation=document.querySelector('#primary-nav');
const homeLink=navigation?.querySelector('a[href="../"],a[href="/"],a[href="./"]');
if(navigation&&!navigation.querySelector('a[href*="/news/"],a[href="news/"],a[href="../news/"],a[href="./news/"]')){
  const newsLink=document.createElement('a');
  newsLink.href=new URL('news/',homeLink?new URL(homeLink.getAttribute('href'),location.href):location.origin).href;
  newsLink.textContent='News';
  const catalogLink=navigation.querySelector('a[href*="catalog"]');
  (catalogLink||homeLink)?.after(newsLink);
}
const newsLink=navigation?.querySelector('a[href*="/news/"],a[href="news/"],a[href="../news/"],a[href="./news/"]');
if(newsLink&&location.pathname.includes('/news'))newsLink.classList.add('active');

function setOpen(open){
  toggle?.setAttribute('aria-expanded',String(open));
  toggle?.setAttribute('aria-label',open?'Close navigation':'Open navigation');
  navigation?.classList.toggle('mobile-open',open);
}

toggle?.addEventListener('click',()=>setOpen(toggle.getAttribute('aria-expanded')!=='true'));
navigation?.addEventListener('click',event=>{if(event.target.closest('a,[data-open-auth]'))setOpen(false)});
document.addEventListener('keydown',event=>{if(event.key==='Escape')setOpen(false)});
document.addEventListener('click',event=>{if(toggle?.getAttribute('aria-expanded')==='true'&&!event.target.closest('.topbar'))setOpen(false)});
