export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

let toastTimer;
export function toast(msg, type = 'info') {
  const el = $('#toast');
  el.style.background = type === 'error' ? '#b91c1c' : type === 'success' ? '#15803d' : '#1d4ed8';
  el.textContent = msg; el.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 3200);
}

// Simple modal: returns { el, close }. `onAction(action, el)` gets data-act clicks.
export function modal({ title, body, footer = '', wide = false, onAction, onClose }) {
  const wrap = document.createElement('div');
  wrap.className = 'overlay';
  wrap.innerHTML = `<div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true">
    <div class="mh"><h2>${esc(title)}</h2><button class="btn ghost icon" data-act="close" aria-label="Close">✕</button></div>
    <div class="mb">${body}</div>${footer ? `<div class="mf">${footer}</div>` : ''}</div>`;
  const close = () => { wrap.remove(); document.removeEventListener('keydown', onKey); onClose && onClose(); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  wrap.addEventListener('click', (e) => {
    if (e.target === wrap) return close();
    const a = e.target.closest('[data-act]'); if (!a) return;
    if (a.dataset.act === 'close') return close();
    onAction && onAction(a.dataset.act, a, wrap, close);
  });
  document.body.appendChild(wrap);
  const first = wrap.querySelector('input, textarea, select'); if (first && window.innerWidth > 760) setTimeout(() => first.focus(), 30);
  return { el: wrap, close };
}

export function confirmBox(title, text, okLabel = 'Confirm', danger = true) {
  return new Promise(res => {
    let done = false;
    const m = modal({ title, body: `<p class="muted">${esc(text)}</p>`,
      footer: `<button class="btn" data-act="close">Cancel</button><button class="btn ${danger ? 'danger' : 'primary'}" data-act="ok">${esc(okLabel)}</button>`,
      onAction: (a, el, w, close) => { if (a === 'ok') { done = true; close(); res(true); } },
      onClose: () => { if (!done) res(false); } });
  });
}

// ---- Settings (per device) ------------------------------------------
const SKEY = 'practice-settings-v1';
export const DEFAULT_SETTINGS = {
  sound: true, style: 'buzzer', volume: 1, countdown: true, voice: true, voiceName: '', voiceRate: 1.05,
  warn30: true, previewNext: true, voiceMode: 'ai', aiVoice: 'Fenrir', aiStyle: 'hype', leadIn: 10, readDescription: false, voiceCommands: false,
};
export function getSettings() { try { return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(SKEY) || '{}') }; } catch (e) { return { ...DEFAULT_SETTINGS }; } }
export function setSettings(patch) { const s = { ...getSettings(), ...patch }; localStorage.setItem(SKEY, JSON.stringify(s)); return s; }

export function download(name, text, type = 'application/json') {
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export function timeAgo(ms) {
  if (!ms) return '';
  const s = (Date.now() - ms) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)}d ago`;
  return new Date(ms).toLocaleDateString();
}

export const toMs = (v) => (v && typeof v.toMillis === 'function') ? v.toMillis() : (v || 0);
