(() => {
  const K=window.KRN, original=K.openTab;
  const owners={assessment:['assessmentOpsModal','phoneAssessmentModal'],slips:['preview'],inventory:['inventoryDetailModal','processModal','testModal','priceCardModal','meModal'],schedule:['dayScheduleModal','appointmentDetailModal','appointmentModal'],store:['saleFlowModal']};
  const screens={home:'home',assessment:'assessmentView',slips:'slipsView',inventory:'inventoryView',schedule:'scheduleView',recycle:'recycleView',store:'storeView'};
  const saved=new Map();let current='home',switching=false;
  function updateMenu(){const confirming=K.overlay('preview').classList.contains('on');const visible=!confirming&&Object.values(owners).flat().some(id=>K.$('#'+id)?.classList.contains('on'));document.body.classList.toggle('customerConfirming',confirming);document.body.classList.toggle('workspaceMenuVisible',visible);}
  K.openTab=async tab=>{
    if(switching)return;
    switching=true;
    try{
      const slip=K.overlay('slip');
      const visibleOwner=Object.entries(owners).find(([,ids])=>ids.some(id=>K.$('#'+id)?.classList.contains('on')))?.[0];
      if(visibleOwner)current=visibleOwner;else if(slip.classList.contains('on'))current='slips';
      if(slip.classList.contains('on')&&!K.slipWorkspace.confirmed){try{await K.slipWorkspace.save();}catch{alert('保存できません。入力画面を閉じずに再度保存してください。');return;}}
      // Keep DOM nodes in place: unsent inputs and signatures must not be rebuilt.
      const open=(owners[current]||[]).filter(id=>K.$('#'+id)?.classList.contains('on'));
      const screen=K.$('#'+screens[current]);
      saved.set(current,{open,windowY:window.scrollY,screenY:screen?.scrollTop||0,overlayY:open.map(id=>[id,K.$('#'+id+' > section')?.scrollTop||0])});
      for(const id of open)K.overlay(id).classList.remove('on');
      const target=saved.get(tab);
      if(target && screens[tab] && tab!=='slips'){K.screen(screens[tab]);K.setNav(tab);}
      else await original(tab);
      current=tab;
      if(target){for(const id of target.open)K.overlay(id).classList.add('on');for(const [id,y] of target.overlayY){const el=K.$('#'+id+' > section');if(el)el.scrollTop=y;}const el=K.$('#'+screens[tab]);if(el)el.scrollTop=target.screenY;window.scrollTo(0,target.windowY);}
      updateMenu();
    }finally{switching=false;}
  };
  const observer=new MutationObserver(updateMenu);
  for(const [owner,ids] of Object.entries(owners))for(const id of ids){const el=K.$('#'+id);if(!el)continue;observer.observe(el,{attributes:true,attributeFilter:['class']});el.addEventListener('click',e=>{if(e.target.closest('[data-close]')){const state=saved.get(owner);if(state)state.open=state.open.filter(x=>x!==id);}});}
})();
