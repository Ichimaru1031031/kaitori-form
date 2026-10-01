(()=>{
 const token=new URLSearchParams(location.hash.slice(1)).get("document"),status=document.querySelector("#status");
 if(!token){status.textContent="明細リンクが見つかりません。店舗から届いたリンクを開いてください。";return}
 KRAssessmentAdapter.run("customer-pdf",{shareToken:token}).then(result=>{
  const raw=atob(result.pdfBase64),bytes=Uint8Array.from(raw,c=>c.charCodeAt(0)),url=URL.createObjectURL(new Blob([bytes],{type:"application/pdf"}));
  const link=document.querySelector("#download"),frame=document.querySelector("#pdf");
  link.href=url;link.download=result.fileName;link.hidden=false;frame.src=url;frame.hidden=false;
  status.textContent="第"+result.version+"版の明細書です。表示されない場合は「PDFを開く・保存する」を押してください。";
 }).catch(error=>{status.textContent=String(error?.message||"明細書を取得できませんでした。店舗へお問い合わせください。")});
})();
