import { createDocument, serializeDocument, validateDocument, createMask, MOTIFS, REPEATS, FRAMES, DYE_PALETTES } from '../site/engine.js';

const PACK_FIELDS = ['schemaVersion','id','version','title','venue','intro','ending','steps','choices','allowedControls','conditions','card','sources','idleSeconds','countdownSeconds'];
const PRESET_FIELDS = ['motif','repeat','frame','spacing','rotation','motifScale','bridge','dyePalette','dyeDepth','customPattern'];
const CONTROLS = ['motif','layout','custom','palette','bridge'];
const STEP_IDS = ['choose','explore','create','reveal','takeaway'];
const own = (value, key) => Object.hasOwn(value, key);
function object(value, fields, required = fields) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !fields.includes(key)) || required.some(key => !own(value,key))) throw new Error('数据字段不完整或含未知内容。');
}
function text(value, label, max = 160, min = 1) {
  if (typeof value !== 'string' || value.trim().length < min || value.length > max || /[\u0000-\u0008\u000b-\u001f\u007f]/u.test(value)) throw new Error(`${label}格式无效。`);
  return value;
}
function id(value) {
  if (typeof value !== 'string' || !/^[a-z0-9][a-z0-9_-]{0,47}$/.test(value)) throw new Error('标识应为 1–48 位小写字母、数字、短横线或下划线。');
  return value;
}
function integer(value, min, max, label) {
  if (!Number.isInteger(value) || value < min || value > max) throw new Error(`${label}超出允许范围。`);
  return value;
}
function enumeration(value, choices, label) {
  if (!choices.includes(value)) throw new Error(`${label}无效。`);
  return value;
}
function array(value, max, label, min = 0) {
  if (!Array.isArray(value) || value.length < min || value.length > max) throw new Error(`${label}数量无效。`);
  for (let index = 0; index < value.length; index++) if (!own(value,index)) throw new Error(`${label}不能包含空项。`);
  return value;
}
function validatePreset(value) {
  object(value, PRESET_FIELDS, PRESET_FIELDS.filter(key => key !== 'customPattern'));
  enumeration(value.motif,Object.keys(MOTIFS),'纹样');
  enumeration(value.repeat,REPEATS,'平铺方式');
  enumeration(value.frame,FRAMES,'成布边式');
  enumeration(value.dyePalette,Object.keys(DYE_PALETTES),'染色配方');
  integer(value.spacing,60,150,'纹样间距');integer(value.rotation,0,180,'纹样角度');
  integer(value.motifScale,70,125,'纹样尺度');integer(value.dyeDepth,1,5,'浸染深度');
  if (typeof value.bridge !== 'boolean') throw new Error('留桥设置无效。');
  if (own(value,'customPattern') && (!Array.isArray(value.customPattern) || value.customPattern.length !== 256 || Array.from(value.customPattern).some(bit => bit !== 0 && bit !== 1))) throw new Error('自刻花版应为 16×16 的二值网格。');
  return Object.fromEntries(PRESET_FIELDS.filter(key => own(value,key)).map(key => [key,key === 'customPattern' ? [...value[key]] : value[key]]));
}

/** Return a canonical, detached, data-only pack; invalid input throws. */
export function validateExhibitPack(value) {
  object(value, PACK_FIELDS);
  if (value.schemaVersion !== 1) throw new Error('不支持此展包版本。');
  if (typeof value.version !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$/.test(value.version)) throw new Error('版本号格式无效。');
  const steps = [...array(value.steps,5,'流程',4)];
  if (new Set(steps).size !== steps.length || steps.some(step => !STEP_IDS.includes(step)) || steps[0] !== 'choose' || steps.at(-1) !== 'takeaway' || !steps.includes('create') || !steps.includes('reveal') || steps.indexOf('create') > steps.indexOf('reveal')) throw new Error('流程须以选择开始、领取结束，并先创作后揭蓝。');
  const choices = array(value.choices,8,'选择',1).map(choice => {
    object(choice,['id','title','description','preset']);
    return { id:id(choice.id), title:text(choice.title,'选择标题',48), description:text(choice.description,'选择说明',300), preset:validatePreset(choice.preset) };
  });
  if (new Set(choices.map(choice => choice.id)).size !== choices.length) throw new Error('选择标识重复。');
  const allowedControls = [...array(value.allowedControls,5,'可调控件')];
  if (new Set(allowedControls).size !== allowedControls.length || allowedControls.some(control => !CONTROLS.includes(control))) throw new Error('可调控件无效。');
  const conditions = array(value.conditions,12,'完成条件').map(condition => {
    object(condition,['field','operator','value']);
    const {field,operator,value:expected} = condition;
    enumeration(field,['stage','coverage','motif','repeat','dyePalette','dyeDepth','customCells'],'条件字段');
    enumeration(operator,['eq','gte','lte'],'比较方式');
    if (['stage','motif','repeat','dyePalette'].includes(field)) {
      if (operator !== 'eq') throw new Error('枚举条件只能比较相等。');
      const enums = {stage:['coat','dye','reveal'],motif:Object.keys(MOTIFS),repeat:REPEATS,dyePalette:Object.keys(DYE_PALETTES)};
      enumeration(expected,enums[field],'条件取值');
    } else if (field === 'coverage') { if (typeof expected !== 'number' || !Number.isFinite(expected) || expected < 0 || expected > 100) throw new Error('施浆条件范围应为 0–100。'); }
    else integer(expected,field === 'dyeDepth' ? 1 : 0,field === 'dyeDepth' ? 5 : 256,'条件取值');
    return {field,operator,value:expected};
  });
  object(value.card,['headline','caption']);
  const card = {headline:text(value.card.headline,'成品卡标题',80),caption:text(value.card.caption,'成品卡说明',400)};
  const sources = array(value.sources,12,'来源').map(source => {
    object(source,['title','url']);
    text(source.url,'来源链接',1000);
    let url; try { url = new URL(source.url); } catch { throw new Error('来源链接无效。'); }
    if (!['https:','http:'].includes(url.protocol) || url.username || url.password) throw new Error('来源必须为 HTTP(S) 链接。');
    return {title:text(source.title,'来源标题',160),url:url.href};
  });
  return {schemaVersion:1,id:id(value.id),version:text(value.version,'版本',40),title:text(value.title,'展览标题',80),venue:text(value.venue,'展览地点',100),intro:text(value.intro,'开场说明',1200),ending:text(value.ending,'结束说明',1200),steps,choices,allowedControls,conditions,card,sources,idleSeconds:integer(value.idleSeconds,30,3600,'待机秒数'),countdownSeconds:integer(value.countdownSeconds,5,120,'倒计时秒数')};
}

export function createPreset(pack, choiceId) {
  const valid = validateExhibitPack(pack);
  const choice = valid.choices.find(item => item.id === choiceId);
  if (!choice) throw new Error('此选择不属于当前展包。');
  return serializeDocument({...createDocument(),...choice.preset});
}

/** Always recompute coverage from the actual mask, including custom stencils. */
export function evaluateConditions(pack, design) {
  const valid = validateExhibitPack(pack);
  const doc = validateDocument(design.coverage instanceof Uint8Array ? serializeDocument(design) : design);
  const mask = createMask(doc);
  let holes = 0, coated = 0;
  for (let index = 0; index < mask.length; index++) if (mask[index]) {holes++;coated += doc.coverage[index];}
  const coverage = holes ? coated / holes * 100 : 0;
  const values = {...doc,coverage,customCells:doc.customPattern.reduce((sum,bit) => sum + bit,0)};
  const labelFor = condition => {
    const {field,operator,value} = condition;
    if (field === 'stage') return {coat:'进入施浆',dye:'进入浸染',reveal:'完成揭纹'}[value];
    if (field === 'motif') return `使用${MOTIFS[value]}纹样`;
    if (field === 'repeat') return `使用${{straight:'齐列',staggered:'错列',mirror:'镜像'}[value]}平铺`;
    if (field === 'dyePalette') return `使用${DYE_PALETTES[value]}色方`;
    if (field === 'coverage' && operator === 'gte' && value > 0 && value <= .001) return '为花版施浆';
    const names = {coverage:'施浆覆盖',dyeDepth:'浸染深度',customCells:'自刻孔格'};
    return `${names[field]}${{eq:'达到',gte:'至少',lte:'至多'}[operator]}${value}${field === 'coverage' ? '%' : field === 'customCells' ? '格' : '层'}`;
  };
  const checks = valid.conditions.map(condition => {
    const actual = values[condition.field];
    const passed = condition.operator === 'eq' ? actual === condition.value : condition.operator === 'gte' ? actual >= condition.value : actual <= condition.value;
    return {passed,label:labelFor(condition)};
  });
  if (!valid.conditions.some(condition => condition.field === 'stage' && condition.operator === 'eq' && condition.value === 'reveal')) checks.push({passed:doc.stage === 'reveal',label:'完成揭纹'});
  return {complete:doc.stage === 'reveal' && checks.every(check => check.passed),checks,coverage};
}

/** Server-side envelope validation; preset locks are enforced independently of UI. */
export function canonicalizeEnvelope(envelope, pack) {
  object(envelope,['schemaVersion','design','exhibit','choice','card','sessionId']);
  if (envelope.schemaVersion !== 1) throw new Error('不支持此作品版本。');
  const valid = validateExhibitPack(pack);
  object(envelope.exhibit,['id','version','title','venue']);
  object(envelope.choice,['id','title']);
  object(envelope.card,['headline','caption']);
  if (envelope.exhibit.id !== valid.id || envelope.exhibit.version !== valid.version) throw new Error('展包版本不匹配。');
  const choice = valid.choices.find(item => item.id === envelope.choice.id);
  if (!choice) throw new Error('此选择不属于当前展包。');
  text(envelope.sessionId,'体验编号',96);
  if (!/^[A-Za-z0-9_-]+$/.test(envelope.sessionId)) throw new Error('体验编号无效。');
  const design = serializeDocument(validateDocument(envelope.design));
  const preset = createPreset(valid,choice.id);
  if (design.motif === 'custom' && preset.motif !== 'custom' && !valid.allowedControls.includes('custom')) throw new Error('当前展包未开放自刻花版。');
  const groups = {motif:['motif'],layout:['repeat','frame','spacing','rotation','motifScale'],custom:['customPattern'],palette:['dyePalette','dyeDepth'],bridge:['bridge']};
  const permitted = new Set(valid.allowedControls.flatMap(control => groups[control]));
  for (const field of [...PRESET_FIELDS,'seed']) {
    if (!permitted.has(field) && JSON.stringify(design[field]) !== JSON.stringify(preset[field])) throw new Error(`当前展包固定了 ${field}。`);
  }
  if (!evaluateConditions(valid,design).complete) throw new Error('作品尚未完成本展包的揭蓝条件。');
  return {schemaVersion:1,design,exhibit:{id:valid.id,version:valid.version,title:valid.title,venue:valid.venue},choice:{id:choice.id,title:choice.title},card:{...valid.card},sessionId:envelope.sessionId};
}
