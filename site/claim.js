import {renderCard, downloadCard, downloadJSON} from './artwork.js';
import {validateDocument} from './engine.js?v=61';
const $=id=>document.getElementById(id);let envelope;
async function load(){
  const token=location.hash.slice(1);
  if(!/^[A-Za-z0-9_-]{40,80}$/.test(token)){$('claim-status').textContent='领取地址不完整，请重新扫描展屏上的二维码。';return;}
  try{
    const response=await fetch(`/api/artworks/${encodeURIComponent(token)}`,{cache:'no-store'}),data=await response.json();
    if(!response.ok)throw new Error(data.error||'暂时无法领取，请检查与展屏是否连接同一网络。');
    envelope=data.envelope;validateDocument(envelope.design);await document.fonts.ready;
    renderCard($('claim-card'),envelope);$('claim-card').hidden=false;$('claim-buttons').hidden=false;
    $('claim-name').textContent=envelope.design.name||'我的一方蓝';$('claim-caption').textContent=envelope.card.caption;
    $('claim-status').textContent=`${envelope.exhibit.venue} · ${envelope.choice.title}`;
    $('claim-deadline').textContent=`请在${new Date(data.expiresAt).toLocaleString('zh-CN')}前下载。保存后的图片与花版可长期留在你的设备。`;
  }catch(error){$('claim-status').textContent=error.message;}
}
$('claim-download').addEventListener('click',()=>downloadCard($('claim-card')).catch(e=>$('claim-status').textContent=e.message));
$('claim-design').addEventListener('click',()=>downloadJSON(envelope));
$('claim-continue').addEventListener('click',()=>{
  try{sessionStorage.setItem('liubai.handoff',JSON.stringify(envelope));location.assign('/?mode=personal&handoff=1#studio');}
  catch{$('claim-status').textContent='浏览器暂时无法保存接续数据。请先下载花版，再在个人工坊导入。';}
});
load();
