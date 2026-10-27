import { validateDocument, createMask, renderPixels, coveragePercent, MOTIFS, DYE_PALETTES } from './engine.js?v=61';

export function renderDesign(canvas, design) {
  const doc = validateDocument(design), size = canvas.width;
  canvas.height = size;
  canvas.getContext('2d').putImageData(new ImageData(renderPixels(doc, createMask(doc, size), size), size, size), 0, 0);
}
function lines(ctx, text, x, y, width, lineHeight, limit = 4) {
  const chars = Array.from(text); let line = '', row = 0;
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    if (ctx.measureText(line + ch).width > width) {
      if (row === limit - 1) {
        while (ctx.measureText(line + '…').width > width) line = Array.from(line).slice(0, -1).join('');
        ctx.fillText(line + '…', x, y); return y + lineHeight;
      }
      ctx.fillText(line, x, y); y += lineHeight; line = ''; row++;
    }
    line += ch;
  }
  ctx.fillText(line, x, y); return y + lineHeight;
}
export function renderCard(canvas, envelope) {
  const doc = validateDocument(envelope.design), c = canvas.getContext('2d');
  canvas.width = 1440; canvas.height = 1080;
  c.fillStyle = '#f0eadc'; c.fillRect(0, 0, 1440, 1080);
  c.fillStyle = '#17374a'; c.fillRect(0, 0, 1440, 18);
  c.strokeStyle = '#b8a375'; c.lineWidth = 2; c.strokeRect(35, 35, 1370, 1010);
  const textile = document.createElement('canvas'); textile.width = 800;
  renderDesign(textile, envelope.design);
  c.save(); c.shadowColor = '#12253435'; c.shadowBlur = 30; c.shadowOffsetY = 14;
  c.drawImage(textile, 76, 140, 780, 780); c.restore();
  c.fillStyle = '#54616a'; c.font = '24px "Microsoft YaHei", sans-serif';
  c.fillText('留白成蓝  /  一方布，一段旅程', 76, 99);
  c.fillStyle = '#a14935'; c.fillRect(918, 142, 64, 64);
  c.fillStyle = '#fff4df'; c.font = '36px KaiTi, serif'; c.fillText('留', 931, 188);
  c.fillStyle = '#183648'; c.font = '44px "Microsoft YaHei", sans-serif';
  lines(c, doc.name || '我的一方蓝', 918, 290, 400, 62, 2);
  c.strokeStyle = '#b6a37e'; c.beginPath(); c.moveTo(918, 398); c.lineTo(1320, 398); c.stroke();
  c.font = '28px "Microsoft YaHei", sans-serif';
  lines(c, envelope.card.headline, 918, 458, 400, 43, 2);
  c.fillStyle = '#54616a'; c.font = '24px "Microsoft YaHei", sans-serif';
  lines(c, envelope.card.caption, 918, 580, 400, 39, 3);
  c.font = '23px "Microsoft YaHei", sans-serif';
  lines(c, `${envelope.choice.title} · ${DYE_PALETTES[doc.dyePalette]}`, 918, 750, 400, 36, 2);
  c.fillText(`亲手施浆 ${Number(coveragePercent(doc, createMask(doc)).toFixed(1))}%`, 918, 862);
  c.font = '22px "Microsoft YaHei", sans-serif';
  lines(c, `${envelope.exhibit.venue} · ${envelope.exhibit.title}`, 76, 980, 1250, 32, 2);
  c.textAlign = 'right'; c.fillText(MOTIFS[doc.motif], 1320, 1018); c.textAlign = 'left';
  return canvas;
}
export function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 2000);
}
export function downloadJSON(envelope) {
  downloadBlob(new Blob([JSON.stringify(envelope.design)], { type: 'application/json' }), '留白成蓝_可编辑花版.json');
}
export function downloadCard(canvas, isCurrent = () => true) {
  return new Promise((resolve, reject) => canvas.toBlob(blob => {
    if (!isCurrent()) { resolve(false); return; }
    if (!blob) { reject(new Error('纪念卡暂时无法生成，请重试。')); return; }
    downloadBlob(blob, '留白成蓝_旅行纪念卡.png'); resolve(true);
  }, 'image/png'));
}
