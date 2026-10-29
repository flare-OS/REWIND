const toggle=document.querySelector('.mobile-menu-toggle');
const navigation=document.querySelector('#primary-nav');

function setOpen(open){
  toggle?.setAttribute('aria-expanded',String(open));
  toggle?.setAttribute('aria-label',open?'Close navigation':'Open navigation');
  navigation?.classList.toggle('mobile-open',open);
}

toggle?.addEventListener('click',()=>setOpen(toggle.getAttribute('aria-expanded')!=='true'));
navigation?.addEventListener('click',event=>{if(event.target.closest('a,[data-open-auth]'))setOpen(false)});
document.addEventListener('keydown',event=>{if(event.key==='Escape')setOpen(false)});
document.addEventListener('click',event=>{if(toggle?.getAttribute('aria-expanded')==='true'&&!event.target.closest('.topbar'))setOpen(false)});
