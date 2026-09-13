(function(){
  const rail=document.querySelector('.krDesktopRail,.rail');
  if(!rail||document.getElementById('krAroNavPop'))return;
  const names={schedule:['予定','予定と空きを確認'],dashboard:['査定','査定案件を確認'],network:['査定','査定案件を確認'],slips:['伝票一覧','保存済み伝票を確認'],slipList:['伝票一覧','保存済み伝票を確認'],slip:['伝票作成','新しい伝票を作成'],recycle:['リサイクル','リサイクル料金を確認'],inventory:['在庫','在庫と工程を管理'],store:['販売','販売中の商品を確認'],home:['ホーム','ホームページを開く'],settings:['設定','変更・設定を管理']};
  const classKey={network:'dashboard',slipList:'slips'};
  const pop=document.createElement('div');pop.id='krAroNavPop';pop.className='krAroNavPop';pop.setAttribute('aria-hidden','true');pop.innerHTML='<i class="krAroIcon"></i><span><strong></strong><small></small></span>';document.body.appendChild(pop);
  const icon=pop.querySelector('i'),title=pop.querySelector('strong'),message=pop.querySelector('small');let timer=0;
  function keyFor(a){return a.dataset.aro||a.dataset.navKey||a.dataset.app||'inventory'}
  function show(a){clearTimeout(timer);const key=keyFor(a),copy=names[key]||names.inventory,visual=classKey[key]||key;icon.className='krAroIcon aro-'+visual;title.textContent=(a.querySelector('.label,span')||{}).textContent||a.getAttribute('aria-label')||copy[0];message.textContent=a.dataset.aroMessage||copy[1];const r=a.getBoundingClientRect();pop.style.top=Math.max(8,Math.min(innerHeight-pop.offsetHeight-8,r.top+r.height/2-64))+'px';pop.classList.add('on');pop.setAttribute('aria-hidden','false')}
  function hide(){clearTimeout(timer);timer=setTimeout(()=>{pop.classList.remove('on');pop.setAttribute('aria-hidden','true')},70)}
  rail.querySelectorAll('a').forEach(a=>{a.addEventListener('pointerenter',()=>show(a));a.addEventListener('pointerleave',hide);a.addEventListener('focus',()=>show(a));a.addEventListener('blur',hide)});
})();
