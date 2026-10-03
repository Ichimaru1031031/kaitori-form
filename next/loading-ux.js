(() => {
 const K=window.KRN;
 // Render more only when the sentinel approaches the visible viewport.
 K.autoMore=(element,load)=>{
   element.classList.add('autoMore');element.textContent='下へスクロールすると続きを表示';
   element.setAttribute('role','status');let busy=false;
   const observer=new IntersectionObserver(entries=>{if(!element.isConnected){observer.disconnect();return;}if(!entries.some(e=>e.isIntersecting)||element.classList.contains('hidden')||busy)return;busy=true;element.textContent='続きを表示中…';requestAnimationFrame(()=>{observer.disconnect();load();});},{rootMargin:'0px 0px 160px 0px'});
   observer.observe(element);return observer;
 };
 const panel=document.createElement('div');panel.id='operationProgress';panel.hidden=true;panel.setAttribute('role','status');panel.setAttribute('aria-live','polite');panel.innerHTML='<span class="loadingSpinner" aria-hidden="true"></span><div><b></b><small></small></div>';document.body.append(panel);
 const pending=new Map();let sequence=0,timer;
 function render(){const task=[...pending.values()].at(-1);panel.hidden=!task;if(!task){clearInterval(timer);timer=null;return;}panel.querySelector('b').textContent=task.label;panel.querySelector('small').textContent=Date.now()-task.started>8000?'通常より時間がかかっています。処理結果を確認中です。':'処理中です。このままお待ちください。';}
 async function track(label,run){const id=++sequence;pending.set(id,{label,started:Date.now()});render();if(!timer)timer=setInterval(render,1000);try{return await run();}finally{pending.delete(id);render();}}
 function wrap(object,key,label){if(typeof object?.[key]!=='function')return;const original=object[key];object[key]=function(...args){return track(typeof label==='function'?label(...args):label,()=>original.apply(this,args));};}
 const actionLabel=action=>/pdf|finalize-slip/.test(action)?'明細PDFを準備中…':/send|deliver/.test(action)?'送信結果を確認中…':/ocr/.test(action)?'商品ラベルを読み取り中…':'変更内容を保存中…';
 window.addEventListener('DOMContentLoaded',()=>{wrap(K,'loadSnapshot','予定・在庫の最新情報を確認中…');wrap(window.KRAPI,'runImmediate',actionLabel);wrap(window.KRAPI,'getSnapshot','最新情報を確認中…');wrap(window.KRAssessmentAdapter,'getCase','査定の最新情報を確認中…');wrap(window.KRAssessmentAdapter,'run',actionLabel);});
})();
