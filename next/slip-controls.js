(() => {
 const K=window.KRN,w=K.slipWorkspace;let baseline=null,exitPending=null;
 const clone=v=>v?JSON.parse(JSON.stringify(v)):null;
 const open=K.openSlip;
 K.openSlip=async seed=>{const key='nextdraft-'+(seed?.caseId||seed?.serviceOrderId||'');baseline=seed?.caseId||seed?.serviceOrderId?clone(await KRDB.getDraft(key)):null;await open(seed);};
 K.$('#resume').addEventListener('click',async()=>{const rows=(await KRDB.listDrafts()).sort((a,b)=>b.updatedAt-a.updatedAt);baseline=clone(rows[0]);},true);
 K.captureSlipBaseline=d=>{baseline=clone(d);};
 const closed=w.onClosed;w.onClosed=()=>{closed?.();K.screen('slipsView');K.setNav('slips');K.renderSlips();};
 const modal=document.createElement('div');modal.id='slipExitModal';modal.className='overlay';modal.innerHTML='<section class="exitSheet"><h2>入力内容を保存しますか？</h2><p>自動保存した今回の変更も、保存しない場合は開いた時の内容に戻します。カレンダーに反映済みの予約はそのまま残ります。</p><button data-choice="save">保存して戻る</button><button data-choice="discard">今回の変更を保存せず戻る</button><button data-choice="cancel">入力を続ける</button></section>';document.body.append(modal);
 K.requestSlipExit=()=>{if(exitPending)return exitPending;exitPending=new Promise(resolve=>{modal.classList.add('on');modal.querySelectorAll('[data-choice]').forEach(b=>b.onclick=()=>{modal.classList.remove('on');const choice=b.dataset.choice;exitPending=null;resolve(choice);});});return exitPending;};
 w.discardOnExit=async()=>{const id=w.current()?.id;w.clear();if(id){if(baseline)await KRDB.putDraft(baseline);else await KRDB.deleteDraft(id);}await K.refreshResume();};
 const text=K.$('#closeSlipFooter');text.textContent='← 戻る';K.$('#closeSlip').setAttribute('aria-label','伝票入力を閉じる');
 // Deletion removes draft data; completed slips are hidden with a reversible archive marker.
 const key='kr-next-archived-slips';const hidden=()=>{try{return JSON.parse(localStorage.getItem(key)||'[]')}catch{return[]}};
 const archive=id=>{const ids=new Set(hidden());ids.add(id);localStorage.setItem(key,JSON.stringify([...ids]));};
 async function sharedArchive(id,archived=true){const raw=await KRAPI.runImmediate('service-order-archive',id,{archived}),result=raw?.result?.result||raw?.result||raw;K.snap.archivedServiceOrderIds=result.archivedServiceOrderIds||[];}
 async function removeDraft(id){if(!confirm('この下書き伝票を削除しますか？\nこの端末の下書きだけを削除します。PDF・在庫・予約は削除しません。'))return; if(w.current()?.id===id){w.clear();K.forgetWorkspace?.('slips');K.overlay('slip').classList.remove('on');}await KRDB.deleteDraft(id);await K.refreshResume();K.renderSlips();}
 function decorate(){
  const ids=[...hidden(),...(K.snap.archivedServiceOrderIds||[])];K.$$('#slipList .slipCardNative').forEach(card=>{const id=card.querySelector('.slipId')?.textContent.trim();if(!id)return;if(ids.includes(id)){card.hidden=true;return;}if(card.querySelector('.archiveSlip'))return;const b=document.createElement('button');b.type='button';b.className='archiveSlip';b.textContent='一覧から削除';b.onclick=async e=>{e.stopPropagation();if(!confirm('伝票 '+id+' を共有一覧から削除しますか？\nPDF・送信履歴・在庫・予約は保持します。「削除を取り消す」で戻せます。'))return;b.disabled=true;try{await sharedArchive(id);card.hidden=true;}catch(error){alert('削除できません：'+error.message);}finally{b.disabled=false;}};card.querySelector('.slipActions')?.append(b);});
  K.$$('#localSlipList .localSlipRow').forEach(b=>{const id=b.dataset.snapshotId||b.dataset.draftId;if(ids.includes(id)){b.hidden=true;return;}if(b.querySelector('.deleteDraft'))return;const del=document.createElement('span');del.className='deleteDraft';del.setAttribute('role','button');del.setAttribute('tabindex','0');del.textContent=b.dataset.snapshotId?'一覧から削除':'下書き削除';const remove=()=>{if(b.dataset.snapshotId){if(confirm('確定伝票をこの端末の一覧から削除しますか？\n確定内容・PDF・送信履歴は保持します。')){archive(id);b.hidden=true;}}else removeDraft(id);};del.onclick=e=>{e.stopPropagation();remove();};del.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();e.stopPropagation();remove();}};b.append(del);});
 }
 const undo=document.createElement('button');undo.className='restoreArchivedSlips';undo.textContent='一覧からの削除を取り消す';undo.onclick=async()=>{undo.disabled=true;try{for(const id of [...(K.snap.archivedServiceOrderIds||[])])await sharedArchive(id,false);localStorage.removeItem(key);K.renderSlips();}catch(error){alert('復元できません：'+error.message);}finally{undo.disabled=false;}};K.$('#slipList').after(undo);
 new MutationObserver(decorate).observe(K.$('#slipList'),{childList:true});new MutationObserver(decorate).observe(K.$('#localSlipList'),{childList:true});
 decorate();
})();
