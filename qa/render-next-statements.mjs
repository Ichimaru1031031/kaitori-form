import {readFile,mkdir} from "node:fs/promises";
import vm from "node:vm";
import {createRequire} from "node:module";
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.KR_PLAYWRIGHT_PATH || "/Users/ichimarukazuki/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
const out=process.argv[2];if(!out)throw new Error("Output directory required");
await mkdir(out,{recursive:true});
const gas=await readFile(new URL("../next-green-gas/Code.gs",import.meta.url),"utf8");
let html="";
const context=vm.createContext({HtmlService:{createHtmlOutput:value=>{html=value;return {getBlob:()=>({getAs:()=>({setName(){return this}})})}}},MimeType:{PDF:"application/pdf"},Utilities:{formatDate:()=>"20261002-120000"},DriveApp:{getFolderById:()=>({createFile:()=>({getId:()=>"sample",getUrl:()=>"sample"})})}});
vm.runInContext(gas,context);
const item=(category,amount,extra={})=>({category,maker:"パナソニック",model:"NR-B17HW",year:"2024",spec:"168L / 動作正常 / 使用感少なめ",amount,...extra});
const snap={caseId:"確認サンプル",sourceServiceOrderId:"TEST-STATEMENT-001",version:1,confirmedAt:"2026/10/02 12:00",total:27300,payload:{customer:{name:"山田 太郎",postalCode:"270-0135",address:"千葉県流山市野々下1丁目2番3号",phone:"090-0000-0000",email:"sample@example.invalid"},items:{purchase:[item("冷蔵庫",5000),item("洗濯機",8000,{model:"NA-FA8H2",spec:"8kg / 動作正常"})],sale:[item("エアコン",36990,{model:"CS-224DFL",spec:"2.2kW / 6畳用"})],work:[{category:"エアコン標準取付工事",amount:17600}],delivery:[{category:"配送・設置",amount:3000}],recycle:[{category:"冷蔵庫リサイクル",amount:4730},{category:"洗濯機リサイクル",amount:2530},{category:"収集運搬",amount:3300}]}}};
const sign="data:image/svg+xml;base64,"+Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="280" height="80"><text x="35" y="55" font-size="32">山田 太郎</text></svg>').toString("base64");
const browser=await chromium.launch({headless:true,executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"});
try{
 const page=await browser.newPage();
 for(const kind of ["other","recycle"]){
  context.createCustomerPdf_(snap,sign,kind);
  await page.setContent(html);await page.evaluate(()=>document.fonts.ready);
  await page.pdf({path:out+"/"+kind+"-statement.pdf",format:"A4",printBackground:true,preferCSSPageSize:true});
  console.log(kind+" PDF created");
 }
}finally{await browser.close()}
