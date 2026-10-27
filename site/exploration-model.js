import { createDocument, createCustomPattern, createMask, coatAll, coveragePercent } from './engine.js?v=61';

export const MISSIONS = Object.freeze([
  { id:'breath', title:'给花留一点风', tag:'01 / THE UNFINISHED', brief:'不必涂满。让一部分花消失，做一方有疏有密的布。', goal:'施浆覆盖 10%—70%，完成揭纹', motif:'sprig', repeat:'straight', frame:'open', stamp:'风', hint:'在工坊只刮几道，看覆盖率落进目标区间，再浸染、揭纹。' },
  { id:'rhythm', title:'让莲花错落生长', tag:'02 / THE RHYTHM', brief:'同一枚花，换一种相遇方式。让上下两行错开半步。', goal:'莲华珠露 · 错列 · 完整刮浆 · 揭纹', motif:'lotus', repeat:'straight', frame:'bordered', stamp:'花', hint:'展开「调整排布与疏密」，改为错列，再完整刮浆、浸染、揭纹。' },
  { id:'signature', title:'刻一枚自己的花', tag:'03 / THE SIGNATURE', brief:'没有标准答案。从一个小小的空隙，刻出只属于你的印记。', goal:'自刻花版至少 8 格，完成施浆和揭纹', motif:'custom', repeat:'straight', frame:'open', stamp:'刻', hint:'打开「自刻花版」，点亮或擦去格子；让自己的图形长成整幅花布。' },
  { id:'night', title:'把夜色染进布里', tag:'04 / THE DEEP BLUE', brief:'同一处留白，在深浅之间会有不同的力量。试一方深邃的夜蓝。', goal:'黛夜配色 · 最深浸染 · 完整刮浆 · 揭纹', motif:'wave', repeat:'mirror', frame:'bordered', stamp:'蓝', hint:'在染色配方里选黛夜，把深度推至 5；观察白花与深蓝的对比。' }
]);

export function missionProgress(id, doc) {
  if (!doc) return { complete:false, checks:[] };
  const coverage = coveragePercent(doc, createMask(doc));
  const starter = createCustomPattern();
  const checks = id==='breath' ? [[coverage>=10 && coverage<=70,'施浆覆盖 10%—70%']]
    : id==='rhythm' ? [[doc.motif==='lotus','莲华珠露'],[doc.repeat==='staggered','错列排布'],[coverage===100,'完整刮浆']]
    : id==='signature' ? [[doc.motif==='custom','自己的花版'],[(doc.customPattern||[]).filter(Boolean).length>=8,'至少 8 格孔洞'],[(doc.customPattern||[]).some((v,i)=>v!==starter[i]),'改变起始花版'],[coverage>0,'已经施浆']]
    : id==='night' ? [[doc.dyePalette==='midnight','黛夜配色'],[doc.dyeDepth===5,'深度 5'],[coverage===100,'完整刮浆']] : [];
  checks.push([doc.stage==='reveal','完成揭纹']);
  return { complete:MISSIONS.some(m=>m.id===id)&&checks.every(c=>c[0]), checks, coverage };
}

export function readMissionSession(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !MISSIONS.some(m => m.id === value.id)) return null;
  return { id: value.id, armed: value.armed === true };
}

// A spatial sweep: the experiment's brush coverage has the same consequence as
// a left-to-right paste pass in the workshop, rather than a colour-only filter.
export function experimentDocument({ motif='lotus', bridge=true, coverage=65, depth=3 }={}) {
  const doc=createDocument(); Object.assign(doc,{motif,bridge,dyeDepth:depth,stage:'reveal'});
  const mask=createMask(doc); coatAll(doc,mask);
  const boundary=Math.round(Math.max(0,Math.min(100,coverage))*doc.size/100);
  for(let i=0;i<doc.coverage.length;i++) if(i%doc.size>=boundary)doc.coverage[i]=0;
  return doc;
}
