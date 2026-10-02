(() => {
  const K=window.KRN, workspace=K.slipWorkspace;
  let suspended=false, scrollTop=0, renderToken=0;
  const section=document.createElement('details');
  section.className='slipVisit';
  section.innerHTML='<summary>訪問日時 <span id="slipVisitSummary">未設定・任意</span></summary><div class="slipVisitFields"><label>訪問日<input id="slipVisitDate" type="date"></label><div><label>開始<input id="slipVisitStart" type="time"></label><label>終了<input id="slipVisitEnd" type="time"></label></div><button type="button" id="slipVisitSave">カレンダーへ反映</button><small id="slipVisitStatus" role="status">日時の入力は下書き保存されます。反映ボタンで予約します。</small></div>';
  K.$('#slip .common').after(section);
  const fields=['Date','Start','End'].map(key=>K.$('#slipVisit'+key));
  function visitSummary(){const [date,start,end]=fields.map(x=>x.value);K.$('#slipVisitSummary').textContent=date?date+' '+(start||'')+(end?'〜'+end:''):'未設定・任意';}
  function hydrate(){const d=workspace.current();if(!d)return;const a=(K.snap.appointments||[]).find(x=>x.appointmentId===d.appointmentId || (d.caseId&&x.caseId===d.caseId));if(a&&!d.appointmentId)d.appointmentId=a.appointmentId;const v=d.visit||a||{};fields[0].value=v.date||'';fields[1].value=v.startTime||'';fields[2].value=v.endTime||'';visitSummary();K.$('#slipVisitStatus').textContent=v.savedAt?'✓ カレンダーに反映済み':'日時の入力は下書き保存されます。反映ボタンで予約します。';}
  fields.forEach(field=>field.addEventListener('input',()=>{const d=workspace.current();workspace.setVisit({...d.visit,date:fields[0].value,startTime:fields[1].value,endTime:fields[2].value,savedAt:''});visitSummary();}));
  K.$('#slipVisitSave').onclick=async()=>{
    const d=workspace.current(),v=d?.visit||{},button=K.$('#slipVisitSave'),status=K.$('#slipVisitStatus');
    if(!v.date||!v.startTime||!v.endTime||v.startTime>=v.endTime){status.textContent='訪問日・開始・終了を確認してください。';return;}
    if(!d.customer.name.trim()){status.textContent='お客様のお名前を入力してください。';return;}
    button.disabled=true;
    try{
      const existing=(K.snap.appointments||[]).find(x=>x.appointmentId===d.appointmentId)||{};
      if(existing.status==='tentative'){throw Error('仮押さえ日時は査定画面から変更してください。');}
      const appointmentId=d.appointmentId||'NEXT-SLIP-'+d.id;
      const a={...existing,appointmentId,caseId:d.caseId||'',date:v.date,startTime:v.startTime,endTime:v.endTime,category:d.selected.includes('purchase')?'買取':d.selected.includes('work')?'工事':'販売',customerName:d.customer.name,title:d.customer.name+' 様',phone:d.customer.phone,address:d.customer.address,status:existing.status||'confirmed',serviceOrderId:d.sourceServiceOrderId||existing.serviceOrderId||'',updatedAt:new Date().toISOString()};
      await KRAPI.runImmediate('appointment-upsert',appointmentId,a);
      await KRDB.putAppointment(a);
      K.snap.appointments=[...(K.snap.appointments||[]).filter(x=>x.appointmentId!==appointmentId),a];
      workspace.setVisit({...v,appointmentId,savedAt:a.updatedAt});await workspace.save();K.renderCalendar?.();K.renderHome?.();status.textContent='✓ '+v.date+' '+v.startTime+'〜'+v.endTime+' をカレンダーに反映しました';
    }catch(e){status.textContent='反映できません：'+e.message;}finally{button.disabled=false;}
  };
  const originalOpen=K.openSlip;
  K.$('#resume').addEventListener('click',()=>{workspace.confirmed=false;},true);
  K.overlay('slip').addEventListener('input',()=>{workspace.confirmed=false;});
  workspace.onClosed=()=>{suspended=false;};
  K.openSlip=async seed=>{
    if(workspace.current()&&!workspace.confirmed)await workspace.save();workspace.confirmed=false;suspended=false;
    const snapshots=seed?.serviceOrderId?(await KRDB.listSnapshots()).filter(s=>s.serviceOrderId===seed.serviceOrderId).sort((a,b)=>b.version-a.version):[];
    if(snapshots.length){const value={...snapshots[0].payload,sourceServiceOrderId:seed.serviceOrderId};await workspace.restore(value);}
    else{await originalOpen(seed);const d=workspace.current(),rows=(K.snap.lineItems||[]).filter(x=>seed?.serviceOrderId&&x.serviceOrderId===seed.serviceOrderId);if(rows.length){const old=await KRDB.getDraft(d.id);if(!old||!Object.values(old.items||{}).some(rows=>rows.length)){const value=JSON.parse(JSON.stringify(d));for(const key of Object.keys(value.items))value.items[key]=[];for(const row of rows){if(value.items[row.serviceType])value.items[row.serviceType].push({...row,amount:Number(row.amount||0)});}value.selected=Object.keys(value.items).filter(key=>value.items[key].length);await workspace.restore(value);await workspace.save();}}}
    hydrate();K.setNav('slips');
  };
  const originalTab=K.openTab;
  K.openTab=async tab=>{
    if(K.overlay('preview').classList.contains('on')){if(!workspace.confirmed){alert('お客様確認を閉じてから移動してください。');return;}K.overlay('preview').classList.remove('on');}
    if(K.overlay('slip').classList.contains('on')){if(!workspace.confirmed){try{await workspace.save();}catch{alert('保存できません。画面を閉じずに再度保存してください。');return;}suspended=true;scrollTop=K.$('#slip .sheet').scrollTop;}K.overlay('slip').classList.remove('on');}
    if(tab==='slips'&&suspended){K.overlay('slip').classList.add('on');K.$('#slip .sheet').scrollTop=scrollTop;K.setNav('slips');hydrate();return;}
    originalTab(tab);if(tab==='slips')K.renderLocalSlips();
  };
  const local=document.createElement('section');local.id='localSlipList';K.$('#slipList').before(local);
  K.renderLocalSlips=async()=>{
    const token=++renderToken,[drafts,snapshots,jobs]=await Promise.all([KRDB.listDrafts(),KRDB.listSnapshots(),KRDB.listQueue()]);if(token!==renderToken)return;
    for(const s of snapshots){const job=jobs.find(j=>j.operation==='finalize-slip'&&j.entityId===s.id&&j.status==='done');if(job){const result=job.result?.result||job.result;s.serviceOrderId=result?.serviceOrderId||s.serviceOrderId;s.status='shared-confirmed';}}
    local.replaceChildren();const latest=new Map();for(const s of snapshots){if(!latest.has(s.draftId)||latest.get(s.draftId).version<s.version)latest.set(s.draftId,s);}
    const entries=[...drafts.map(d=>({d,label:'入力中・この端末に保存'})),...[...latest.values()].filter(s=>!s.serviceOrderId||!(K.snap.serviceOrders||[]).some(x=>x.serviceOrderId===s.serviceOrderId)).map(s=>({d:s.payload,s,label:s.status==='shared-confirmed'?'確定・共有保存済み':'確定・共有同期待ち'}))];
    if(!entries.length)return;
    const heading=document.createElement('h3');heading.textContent='この端末の伝票';local.append(heading);
    for(const {d,s,label} of entries){const button=document.createElement('button');button.className='localSlipRow';button.innerHTML='<b>'+K.esc(d.customer?.name||'お名前未入力')+' 様</b><small>'+K.esc(label)+(s?'・第'+s.version+'版':'')+'</small>';button.onclick=async()=>{if(s){alert('確定内容（編集不可）\n'+(d.customer?.name||'')+' 様\n'+(d.customer?.address||'')+'\n'+Object.values(d.items||{}).flat().map(x=>[x.category,x.maker,x.model,'¥'+Number(x.amount||0).toLocaleString()].filter(Boolean).join(' / ')).join('\n')+'\n'+label);return;}workspace.confirmed=false;suspended=false;await workspace.restore(d);hydrate();K.setNav('slips');};local.append(button);}
  };
  const render=K.renderSlips;K.renderSlips=()=>{render();K.renderLocalSlips();};
  const observer=new MutationObserver(()=>{const active=K.overlay('slip').classList.contains('on')&&!K.overlay('preview').classList.contains('on');document.body.classList.toggle('slipEditing',active);if(active)hydrate();});
  observer.observe(K.overlay('slip'),{attributes:true,attributeFilter:['class']});observer.observe(K.overlay('preview'),{attributes:true,attributeFilter:['class']});
  window.addEventListener('pagehide',()=>{if(workspace.current()&&!workspace.confirmed)workspace.save().catch(()=>{});});
})();
