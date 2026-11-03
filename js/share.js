import { esc, modal, toast, download } from './ui.js';
import { store, isFirebase } from './store.js';

const base = () => location.href.split('#')[0];

async function copy(text) {
  try { await navigator.clipboard.writeText(text); toast('Link copied', 'success'); }
  catch (e) { prompt('Copy this link:', text); }
}

export function openShare(p, user, onChange) {
  const draw = () => {
    const team = `${base()}#/p/${p.id}`, pub = `${base()}#/share/${p.id}`;
    return `<div class="stack">
      <div class="tiny">Who can see it</div>
      <div class="seg" style="display:flex">
        <button class="${p.visibility === 'team' ? 'on' : ''}" data-act="vis" data-v="team">Coaches & staff</button>
        <button class="${p.visibility === 'athletes' ? 'on' : ''}" data-act="vis" data-v="athletes">+ Athletes</button>
        <button class="${p.visibility === 'public' ? 'on' : ''}" data-act="vis" data-v="public">Anyone with link</button>
      </div>
      <div class="card" style="background:#0d1428">
        <div class="row between"><b>Team link</b><button class="btn sm" data-act="copy" data-url="${esc(team)}">Copy</button></div>
        <div class="small muted" style="word-break:break-all;margin-top:6px">${esc(team)}</div>
        <div class="small muted" style="margin-top:6px">Signed-in coaches and staff can open it${p.visibility !== 'team' ? ', and so can athletes' : ''}.</div>
      </div>
      ${p.visibility === 'public' ? `<div class="card" style="background:#0d1428;border-color:rgba(250,204,21,.4)">
        <div class="row between"><b>Public link</b><button class="btn sm gold" data-act="copy" data-url="${esc(pub)}">Copy</button></div>
        <div class="small muted" style="word-break:break-all;margin-top:6px">${esc(pub)}</div>
        <div class="small muted" style="margin-top:6px">Anyone can view this, including coaches from other programs. Signed-in coaches can copy it into their own program.</div>
      </div>` : ''}
      ${navigator.share ? '<button class="btn lg" style="width:100%" data-act="native">Share via text / email…</button>' : ''}
      <button class="btn" style="width:100%" data-act="file">Download as file (for programs not on this app)</button>
      ${!isFirebase ? '<div class="small" style="color:#fde68a">Local Demo mode: links only work on this device until Firebase is connected.</div>' : ''}
    </div>`;
  };
  modal({ title: `Share · ${p.title}`, body: draw(),
    onAction: async (a, el, w) => {
      if (a === 'copy') copy(el.dataset.url);
      if (a === 'vis') { p.visibility = el.dataset.v; await store.savePractice(p); w.querySelector('.mb').innerHTML = draw(); onChange && onChange(); toast('Sharing updated', 'success'); }
      if (a === 'native') navigator.share({ title: p.title, text: `Practice plan: ${p.title}`, url: p.visibility === 'public' ? `${base()}#/share/${p.id}` : `${base()}#/p/${p.id}` }).catch(() => {});
      if (a === 'file') download(`${(p.title || 'practice').replace(/[^\w-]+/g, '_')}.practice.json`, JSON.stringify({ format: 'wrestling-practice/1', practice: p }, null, 2));
    } });
}
