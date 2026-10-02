(() => {
 const K=window.KRN,route=K.routeTab||K.openTab;
 const owners={assessment:['assessmentOpsModal','phoneAssessmentModal'],slips:['slip','preview'],inventory:['inventoryDetailModal','processModal','testModal','priceCardModal','meModal'],schedule:['dayScheduleModal','appointmentDetailModal','appointmentModal'],store:['saleFlowModal']};
 const screens={home:'home',assessment:'assessmentView',slips:'slipsView',inventory:'inventoryView',schedule:'scheduleView',recycle:'recycleView',store:'storeView'};
 const saved=new Map();let current='home',switching=false,locked=false,lockedY=0;
 function visible(id){return K.$('#'+id)?.classList.contains('on');}
 function refresh(){
  const confirming=visible('preview'),open=Object.values(owners).flat().some(visible);
  document.body.classList.toggle('customerConfirming',confirming);document.body.classList.toggle('workspaceMenuVisible',open&&!confirming);document.body.classList.toggle('slipEditing',visible('slip')&&!confirming);
  if(open&&!locked){lockedY=window.scrollY;document.body.style.top=-lockedY+'px';document.body.classList.add('workspaceScrollLocked');locked=true;}
  else if(!open&&locked){document.body.classList.remove('workspaceScrollLocked');document.body.style.top='';locked=false;window.scrollTo(0,lockedY);}
 }
 K.forgetWorkspace=tab=>{saved.delete(tab);};
 K.openTab=async tab=>{
  if(switching||visible('slipExitModal'))return;switching=true;
  try{
   const active=K.$('.nav button.active')?.dataset?.tab;
   const visibleOwner=Object.entries(owners).find(([,ids])=>ids.some(visible))?.[0];
   current=visibleOwner||(active&&screens[active]?active:current);
   if(visible('slip')&&!K.slipWorkspace.confirmed){try{await K.slipWorkspace.save();}catch{alert('保存できません。入力画面を閉じずに再度保存してください。');return;}}
   const open=(owners[current]||[]).filter(visible),screen=K.$('#'+screens[current]);
   saved.set(current,{open,y:locked?lockedY:window.scrollY,scroll:screen?.scrollTop||0,overlayY:open.map(id=>[id,K.$('#'+id+' > section')?.scrollTop||0])});
   for(const id of Object.values(owners).flat())K.overlay(id)?.classList.remove('on');
   K.$$('.overlay.on').forEach(el=>el.classList.remove('on'));
   refresh();const target=saved.get(tab);
   if(target&&screens[tab]){K.screen(screens[tab]);K.setNav(tab);}else await route(tab);
   current=tab;
   if(target){window.scrollTo(0,target.y);const el=K.$('#'+screens[tab]);if(el)el.scrollTop=target.scroll;for(const id of target.open)K.overlay(id).classList.add('on');for(const [id,y]of target.overlayY){const el=K.$('#'+id+' > section');if(el)el.scrollTop=y;}}
   if(tab==='slips'&&!visible('slip'))K.renderLocalSlips?.();refresh();
  }finally{switching=false;}
 };
 const observer=new MutationObserver(refresh);
 for(const ids of Object.values(owners))for(const id of ids){const el=K.$('#'+id);if(el)observer.observe(el,{attributes:true,attributeFilter:['class']});}
})();
