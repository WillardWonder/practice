import { esc } from './ui.js';
import { catColor, PHRASES, LEVELS } from './seed.js';
import { blockDuration, practiceDuration, fmtDur, clockTimeLabel, GROUP } from './engine.js';

function rotationTable(b) {
  const n = b.stations.length, rounds = b.mode === 'split' ? 1 : n;
  let h = `<table class="pp-grid"><tr><th></th>${b.stations.map((_, g) => `<th>Group ${GROUP(g)}</th>`).join('')}</tr>`;
  for (let r = 0; r < rounds; r++) {
    h += `<tr><th>${b.mode === 'split' ? 'All' : 'Rot ' + (r + 1)}</th>${b.stations.map((_, g) => `<td>${esc(b.stations[(g + r) % n].title)}</td>`).join('')}</tr>`;
  }
  return h + '</table>';
}

export function blockDetail(b) {
  if (b.type === 'series') return `${(b.moves || []).length} motions: ${(b.moves || []).map(m => m.title).join(', ')}`;
  if (b.type === 'goes') return `${b.rounds} × ${fmtDur(b.workSec)} goes, ${fmtDur(b.restSec)} rest${b.switchAtHalf ? ' · switch at half' : ''}`;
  if (b.type === 'rotation') return `${b.stations.length} groups · ${fmtDur(b.stationSec)} per station${b.mode === 'split' ? ' · groups stay put' : ` · ${fmtDur(b.transitionSec || 0)} to rotate`}`;
  if (b.type === 'rest') return 'Water / recover';
  return b.description || b.category || '';
}

export function printPractice(p, { wall = false } = {}) {
  let t = 0;
  const rows = (p.blocks || []).map((b, i) => {
    const start = t; t += blockDuration(b);
    const title = b.type === 'rotation' ? (b.mode === 'split' ? 'GROUP SPLIT ROTATION' : (b.title || 'Station Rotation')) : b.title;
    return `<div class="pp-row" style="border-left-color:${catColor(b.category)}">
      <div class="tm">${p.startTime ? clockTimeLabel(p.startTime, start) : '+' + fmtDur(start)}</div>
      <div><div class="ti">${i + 1}. ${esc(title)}</div>
        <div class="ds">${esc(b.category || '')}${b.type !== 'drill' || b.description ? ' — ' + esc(blockDetail(b)) : ''}</div>
        ${b.cues?.length ? `<div class="ds"><b>Cues:</b> ${b.cues.map(esc).join(' · ')}</div>` : ''}
        ${b.type === 'rotation' && !wall ? rotationTable(b) : ''}
        ${b.type === 'rotation' && wall ? `<div class="ds">${b.stations.map((s, g) => `<b>${GROUP(g)}:</b> ${esc(s.title)}`).join(' &nbsp; ')}</div>` : ''}
      </div>
      <div class="du">${fmtDur(blockDuration(b))}</div></div>`;
  }).join('');
  const total = practiceDuration(p);
  document.getElementById('print-area').innerHTML = `<div class="${wall ? 'pp-wall' : ''}">
    <div class="pp-head"><h1>${esc(p.title || 'Wrestling Practice Plan')}</h1>
      <div class="pp-meta"><span>Date: ${esc(p.date || 'N/A')}</span><span>Time: ${esc(p.startTime || '')}${p.startTime ? ' – ' + clockTimeLabel(p.startTime, total) : ''}</span>
      <span>Total: ${Math.round(total / 60)} min</span>${p.levels?.length ? `<span>${esc(p.levels.join(', '))}</span>` : ''}</div></div>
    ${p.notes ? `<div class="pp-notes" style="min-height:0;margin:0 0 12px"><b>Focus:</b> ${esc(p.notes)}</div>` : ''}
    ${rows}
    ${wall ? '' : '<div class="pp-notes"><b>Coach notes:</b></div>'}
    <div class="pp-foot">${esc(PHRASES.printFooter)}</div></div>`;
  setTimeout(() => window.print(), 50);
}

// Read-only on-screen view (used for viewers, athletes, public share links)
export function readOnlyPractice(p) {
  let t = 0;
  const total = practiceDuration(p);
  return `<div class="card pad-lg">
    <div class="tiny">${esc((p.levels || []).join(' · ') || 'All levels')}</div>
    <h1 style="font-size:32px;font-weight:900;text-transform:uppercase;font-style:italic;margin-top:6px">${esc(p.title)}</h1>
    <div class="row wrap muted small" style="margin-top:8px">
      <span>${Math.round(total / 60)} min</span><span>·</span><span>${(p.blocks || []).length} blocks</span>
      ${p.startTime ? `<span>·</span><span>${clockTimeLabel(p.startTime, 0)} – ${clockTimeLabel(p.startTime, total)}</span>` : ''}
      ${p.ownerName ? `<span>·</span><span>by ${esc(p.ownerName)}</span>` : ''}
    </div>
    ${p.notes ? `<p style="margin:14px 0 0">${esc(p.notes)}</p>` : ''}
  </div>
  <div class="blocks" style="margin-top:14px">
    ${(p.blocks || []).map((b, i) => { const s = t; t += blockDuration(b); return `
      <div class="block"><div class="stripe" style="background:${catColor(b.category)}"></div><div class="body">
        <div class="head"><div class="when">${p.startTime ? clockTimeLabel(p.startTime, s) : '+' + fmtDur(s)}</div>
          <div class="grow"><div class="t">${esc(b.type === 'rotation' ? (b.title || 'Station Rotation') : b.title)}</div>
          <div class="meta">${esc(b.category || '')} · ${esc(blockDetail(b))}</div></div>
          <span class="badge">${fmtDur(blockDuration(b))}</span></div>
        ${b.cues?.length ? `<div class="row wrap" style="margin:8px 0 0 72px">${b.cues.map(c => `<span class="badge blue">${esc(c)}</span>`).join('')}</div>` : ''}
        ${b.videoUrl ? `<div style="margin:6px 0 0 72px"><a href="${esc(b.videoUrl)}" target="_blank" rel="noopener" class="small">▶ Technique video</a></div>` : ''}
        ${b.type === 'rotation' ? `<div class="rot-grid" style="margin:10px 0 0 72px">${rotationTable(b).replace('pp-grid', '')}</div>` : ''}
      </div></div>`; }).join('')}
  </div>`;
}

export { LEVELS };
