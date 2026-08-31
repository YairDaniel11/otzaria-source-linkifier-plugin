/* ===========================================================================
 *  מקשר מקורות — תוסף לאוצריא
 *  מזהה ציטוטי מקורות בסוגריים (עגולות / מרובעות / מסולסלות) ומקשר לאוצריא.
 *  לוגיקת הזיהוי מבוססת על common.js מתוסף הביוגרפיות (Yair Daniel).
 * =========================================================================== */

const PLUGIN_VERSION = '1.0.1';

/* ===== ערכי גימטריה ===== */
const GEM = {
  א:1,ב:2,ג:3,ד:4,ה:5,ו:6,ז:7,ח:8,ט:9,י:10,
  כ:20,ך:20,ל:30,מ:40,ם:40,נ:50,ן:50,ס:60,ע:70,
  פ:80,ף:80,צ:90,ץ:90,ק:100,ר:200,ש:300,ת:400
};
function gem(s) {
  let n = 0;
  for (const ch of String(s || '')) { if (GEM[ch] == null) break; n += GEM[ch]; }
  return n;
}

/* ===== קיצורי שמות ספרים ===== */
const SRC_EXPAND = {
  'ב"ב': 'בבא בתרא', 'ב"מ': 'בבא מציעא', 'ב"ק': 'בבא קמא',
  'ע"ז': 'עבודה זרה', 'מו"ק': 'מועד קטן', 'ר"ה': 'ראש השנה',
  'מע"ש': 'מעשר שני', 'קדושין': 'קידושין'
};

/* ===== escape HTML ===== */
function esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

/* ===== זיהוי מקור אמיתי בסוגריים =====
 * חייב: אות עברית + גרשיים (" או ') — סימן שזה ציטוט ולא הסבר חופשי.
 */
function isSource(inner) {
  const s = inner.trim();
  if (/^\d+$/.test(s)) return false;
  if (/^ע"ע/.test(s)) return false;
  if (/^(שם|עיין שם|ע"ש|וכו'?|כנ"ל|וע"ע)$/.test(s)) return false;
  return /[א-ת]/.test(s);
}

/* ===== מפת סוגריים: פותח -> סוגר ===== */
const BRACKET_MAP = {
  round:  { open: '(',  close: ')',  esc_o: '\\(',  esc_c: '\\)',  inner: '[^)]+' },
  square: { open: '[',  close: ']',  esc_o: '\\[',  esc_c: '\\]',  inner: '[^\\]]+' },
  curly:  { open: '{',  close: '}',  esc_o: '\\{',  esc_c: '\\}',  inner: '[^}]+' }
};

/* ===== המרת טקסט ל-HTML עם קישורים =====
 * selectedTypes: מערך של 'round' | 'square' | 'curly'
 */
function renderText(raw, selectedTypes) {
  let s = esc(raw);
  const store = [];
  const hold = html => { store.push(html); return '\x00' + (store.length - 1) + '\x00'; };

  for (const type of selectedTypes) {
    const b = BRACKET_MAP[type];
    const re = new RegExp(b.esc_o + '(' + b.inner + ')' + b.esc_c, 'g');
    s = s.replace(re, (m, inner) => {
      if (!isSource(inner)) return m;
      return b.open +
        hold('<a class="src" data-src="' + encodeURIComponent(inner) + '">' + inner + '</a>') +
        b.close;
    });
  }

  s = s.replace(/\x00(\d+)\x00/g, (_, i) => store[+i]);
  return s;
}

/* ===== נרמול ref לדף בבלי ===== */
function normRef(s) {
  return String(s || '')
    .replace(/ע["'׳״]+\s*א(?![א-ת])/g, '.').replace(/ע["'׳״]+\s*ב(?![א-ת])/g, ':')
    .replace(/עמוד\s*א\b/g, '.').replace(/עמוד\s*ב\b/g, ':')
    .replace(/דף/g, '').replace(/[׳״"'`]/g, '').replace(/\s+/g, '');
}

/* ===== חילוץ פרק/הלכה/משנה מ-ref ===== */
function refNums(ref) {
  const toks = String(ref || '').replace(/[׳״"'`]/g, '').trim().split(/\s+/);
  let perek = null, sub = null;
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    if (perek === null) {
      const mp = t.match(/^(?:ריש|סוף|פרק|רפ|ספ|פ)(.*)$/);
      if (mp) { let r = mp[1]; if (!r && toks[i+1]) r = toks[++i]; const g = gem(r); if (g) { perek = g; continue; } }
    }
    if (sub === null) {
      const mh = t.match(/^(?:הלכה|משנה|ה|מ)(.*)$/);
      if (mh) { let r = mh[1]; if (!r && toks[i+1]) r = toks[++i]; const g = gem(r); if (g) { sub = g; continue; } }
    }
  }
  return { perek, sub };
}

/* ===== חיפוש רשומה ב-TOC =====
 * מחזיר את רשומת ה-TOC עצמה ({text, index, level}) — ה-index משמש לפתיחה
 * בקורא (reader.openBook), וה-text משמש לשליפת תוכן (getBookContent.section).
 */
function findTocEntry(toc, ref) {
  if (!Array.isArray(toc) || !ref) return null;
  const r = normRef(ref);
  if (r) {
    const cands = [r];
    if (!/[.:]/.test(r)) cands.push(r + '.', r + ':');
    for (const e of toc) { if (cands.indexOf(normRef(e.text)) !== -1) return e; }
  }
  const rn = refNums(ref);
  if (rn.perek != null) {
    let perekOnly = null;
    for (const e of toc) {
      const en = refNums(e.text);
      if (en.perek === rn.perek) {
        if (rn.sub != null && en.sub === rn.sub) return e;
        if (en.sub == null && perekOnly === null) perekOnly = e;
        if (rn.sub == null) return e;
      }
    }
    if (perekOnly) return perekOnly;
  }
  if (r && r.length >= 2) { for (const e of toc) { if (normRef(e.text).indexOf(r) !== -1) return e; } }
  return null;
}

function findTocIndex(toc, ref) {
  const e = findTocEntry(toc, ref);
  return e ? e.index : null;
}

/* ===== פענוח מחרוזת מקור לשם ספר + ref + קורפוס ===== */
function parseSource(src) {
  const toks = String(src).trim().split(/\s+/);
  const first = (toks[0] || '').replace(/[,.]/g, '');
  let q, ref, bookName;
  if (first === "ירו'" || first === 'ירושלמי') {
    const tr = (toks[1] || '').replace(/[,.]/g, '');
    bookName = SRC_EXPAND[tr] || tr;
    q = 'ירושלמי ' + bookName;
    ref = toks.slice(2).join(' ');
  } else {
    bookName = SRC_EXPAND[first] || first;
    q = bookName;
    ref = toks.slice(1).join(' ');
  }

  let corpus = '';
  if (first === "ירו'" || first === 'ירושלמי' || /ה["'׳]\s*[א-ת]|הלכה/.test(ref)) corpus = 'ירושלמי';
  else if (/מ["'׳]\s*[א-ת]|משנה/.test(ref)) corpus = 'משנה';
  else if (/ע["'׳״]\s*[אב]|[.:]/.test(ref)) corpus = 'בבלי';

  return { q, ref, bookName, corpus };
}

/* ===== בחירת הספר המתאים ביותר מתוצאות החיפוש ===== */
const NORM = s => String(s || '').replace(/[׳״"'`\s]/g, '');
const OTHER_CORPUS = {
  'בבלי': /משנה|ירושלמי|תוספתא/,
  'ירושלמי': /משנה|בבלי|תוספתא/,
  'משנה': /ירושלמי|בבלי|תוספתא/
};

async function resolveBook(parsed) {
  const { q, bookName, corpus } = parsed;
  const r = await window.Otzaria.call('library.findBooks', { query: q, limit: 15 });
  const books = (r && r.success) ? r.data : null;
  if (!books || !books.length) return null;

  const baseName = NORM(bookName);
  const score = b => {
    const t = NORM(b.title); let s = 0;
    if (t === NORM(q)) s += 100;
    if (baseName && t.indexOf(baseName) !== -1) s += 25;
    if (corpus && t.indexOf(NORM(corpus)) !== -1) s += 50;
    if (corpus && OTHER_CORPUS[corpus] && OTHER_CORPUS[corpus].test(b.title)) s -= 40;
    return s;
  };
  return books.slice().sort((a, b) => score(b) - score(a))[0];
}

/* ===== פתיחת מקור באוצריא ===== */
async function openInOtzaria(src) {
  if (typeof window.Otzaria === 'undefined' || !window.Otzaria.call) {
    toast('⚠️ לא זוהה חיבור לאוצריא');
    return;
  }
  const parsed = parseSource(src);
  const ref = parsed.ref;

  try {
    toast('⏳ מחפש באוצריא...');
    const book = await resolveBook(parsed);
    if (!book) {
      await window.Otzaria.call('ui.showMessage', { message: 'לא נמצא מקור באוצריא: ' + src });
      return;
    }
    const bookId = book.bookId;

    if (ref) {
      try {
        const t = await window.Otzaria.call('library.getBookToc', { bookId });
        const toc = (t && t.success) ? t.data : null;
        const idx = findTocIndex(toc, ref);
        if (idx != null) {
          const ro = await window.Otzaria.call('reader.openBook', { bookId, index: idx });
          if (ro && ro.success) return;
        }
      } catch (e) { /* fallback */ }
    }
    const r2 = await window.Otzaria.call('reader.openBookAtRef', { bookId, ref, index: 0 });
    if (!(r2 && r2.success && r2.data)) {
      await window.Otzaria.call('reader.openBook', { bookId, index: 0 });
    }
  } catch (e) { /* שקט */ }
}

/* ===== טוסט ===== */
let _toastTimer = null;
function toast(msg, duration = 2400) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => el.classList.remove('show'), duration);
}

/* ===== ערכת נושא מאוצריא ===== */
function applyTheme(theme) {
  if (!theme) return;
  const cs = theme.colorScheme || theme;
  const r = document.documentElement;
  const set = (k, v) => { if (v) r.style.setProperty(k, v); };
  set('--c-primary', cs.primary);
  set('--c-surface', cs.surface);
  set('--c-on-surface', cs.onSurface);
  set('--c-surface-2', cs.surfaceContainerHighest);
  set('--c-outline', cs.outline);
  set('--c-error', cs.error);
  if (cs.primary && /^#[0-9a-fA-F]{6}$/.test(cs.primary)) {
    const m = cs.primary.slice(1);
    const R = parseInt(m.substr(0,2),16), G = parseInt(m.substr(2,2),16), B = parseInt(m.substr(4,2),16);
    r.style.setProperty('--c-primary-subtle', 'rgba('+R+','+G+','+B+',.12)');
    r.style.setProperty('--c-link', cs.primary);
    r.style.setProperty('--c-link-bg', 'rgba('+R+','+G+','+B+',.09)');
    r.style.setProperty('--c-link-hover', cs.primary);
  }
  document.body.classList.toggle('dark', theme.mode === 'dark');
}

/* ===== אלמנטים ===== */
const inputText   = document.getElementById('inputText');
const linkifyBtn  = document.getElementById('linkifyBtn');
const clearBtn    = document.getElementById('clearBtn');
const result      = document.getElementById('result');
const resultCont  = document.getElementById('resultContainer');
const placeholder = document.getElementById('placeholder');
const statsEl     = document.getElementById('stats');
const badge       = document.getElementById('badge');

/* ===== טוגלי סוגריים ===== */
const TOGGLES = [
  { id: 'round',  chk: document.getElementById('chk-round'),  tog: document.getElementById('tog-round') },
  { id: 'square', chk: document.getElementById('chk-square'), tog: document.getElementById('tog-square') },
  { id: 'curly',  chk: document.getElementById('chk-curly'),  tog: document.getElementById('tog-curly') }
];

TOGGLES.forEach(({ chk, tog, id }) => {
  tog.addEventListener('click', () => {
    // מניעת deselect אחרון
    const active = TOGGLES.filter(t => t.chk.checked);
    if (chk.checked && active.length === 1) return; // חייב לפחות אחד
    chk.checked = !chk.checked;
    tog.classList.toggle('active', chk.checked);
  });
});

function getSelectedBrackets() {
  return TOGGLES.filter(t => t.chk.checked).map(t => t.id);
}

/* ===== לוגיקה ראשית ===== */
linkifyBtn.addEventListener('click', () => {
  const raw = inputText.value;
  if (!raw.trim()) { toast('אין טקסט — הדבק משהו קודם'); return; }

  const types = getSelectedBrackets();
  const html = renderText(raw, types);
  const n = (html.match(/class="src"/g) || []).length;

  result.innerHTML = html;
  resultCont.style.display = 'block';
  placeholder.style.display = 'none';
  clearBtn.disabled = false;

  if (n === 0) {
    statsEl.textContent = 'לא נמצאו ציטוטי מקורות. זכור: הסוגריים חייבים להכיל גרשיים, למשל (שבת י"א.)';
    badge.textContent = '0 קישורים';
  } else {
    statsEl.textContent = `נמצאו ${n} ציטוט${n === 1 ? '' : 'ים'} — לחץ עליהם לפתיחה באוצריא`;
    badge.textContent = n + ' קישורים';
  }
  badge.classList.add('show');
});

clearBtn.addEventListener('click', () => {
  inputText.value = '';
  resultCont.style.display = 'none';
  placeholder.style.display = 'flex';
  badge.classList.remove('show');
  clearBtn.disabled = true;
  inputText.focus();
});

result.addEventListener('click', ev => {
  const a = ev.target.closest('a.src');
  if (!a) return;
  ev.preventDefault();
  openInOtzaria(decodeURIComponent(a.dataset.src));
});

/* ===== טולטיפ תצוגה מקדימה ===== */
const tooltip   = document.getElementById('src-tooltip');
const ttTitle   = document.getElementById('tt-title');
const ttBody    = document.getElementById('tt-body');

let ttHideTimer  = null;
let ttShowTimer  = null;
let ttCache      = {};   // src -> טקסט (cache למניעת קריאות כפולות)

function positionTooltip(anchor) {
  const rect = anchor.getBoundingClientRect();
  const TT_W = 340, GAP = 8;
  let top  = rect.bottom + GAP;
  let left = rect.right - TT_W;
  if (left < 8) left = 8;
  if (left + TT_W > window.innerWidth - 8) left = window.innerWidth - TT_W - 8;
  // אם אין מקום מתחת — הצג מעל
  if (top + 200 > window.innerHeight) top = rect.top - 200 - GAP;
  tooltip.style.top  = top  + 'px';
  tooltip.style.left = left + 'px';
}

function showTooltip(anchor) {
  const src = decodeURIComponent(anchor.dataset.src);
  ttTitle.textContent = src;
  ttBody.className = 'tt-body loading';
  ttBody.textContent = 'טוען...';
  positionTooltip(anchor);
  tooltip.classList.add('visible');

  // אם כבר במטמון
  if (ttCache[src] !== undefined) {
    ttBody.className = 'tt-body';
    ttBody.textContent = ttCache[src];
    return;
  }

  // שליפת תוכן מאוצריא
  fetchPreview(src).then(text => {
    ttCache[src] = text;
    // טולטיפ עדיין מוצג לאותו מקור?
    if (tooltip.classList.contains('visible') && ttTitle.textContent === src) {
      ttBody.className = text ? 'tt-body' : 'tt-body error';
      ttBody.textContent = text || '(לא ניתן לטעון תצוגה מקדימה)';
    }
  });
}

function hideTooltip() {
  tooltip.classList.remove('visible');
}

/* שליפת קטע גולמי מהספר */
async function getContent(bookId, params) {
  try {
    const c = await window.Otzaria.call('library.getBookContent', { bookId, limit: 1000, ...params });
    if (c && c.success && c.data) {
      const raw = typeof c.data === 'string' ? c.data : (c.data.text || c.data.content || '');
      return raw.trim() ? raw : '';
    }
  } catch (e) { /* שקט */ }
  return '';
}

const toPlain = raw => String(raw).replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

/* שליפת תוכן: findBooks -> getBookToc -> getBookContent
 * חשוב: `offset` ב-getBookContent הוא היסט בתווים, בעוד ש-`index` שמוחזר
 * מ-getBookToc הוא מספר שורה בקורא. ערבוב ביניהם היה מציג תמיד את תחילת
 * הספר. לכן הקפיצה לקטע נעשית דרך `section` עם טקסט הכותרת מה-TOC.
 */
async function fetchPreview(src) {
  if (typeof window.Otzaria === 'undefined' || !window.Otzaria.call) return null;

  try {
    const parsed = parseSource(src);
    const ref = parsed.ref;
    const book = await resolveBook(parsed);
    if (!book) return null;
    const bookId = book.bookId;

    // ללא ref — הצג את תחילת הספר, זו אכן התצוגה הנכונה
    if (!ref) {
      const head = await getContent(bookId, { offset: 0 });
      return toPlain(head).slice(0, 400) || null;
    }

    // כותרת הקטע מה-TOC — זהו המפתח לקפיצה המדויקת
    let tocText = '';
    try {
      const t = await window.Otzaria.call('library.getBookToc', { bookId });
      const entry = findTocEntry((t && t.success) ? t.data : null, ref);
      if (entry && entry.text) tocText = entry.text;
    } catch (e) { /* ממשיכים עם ה-ref הגולמי */ }

    // ניסיונות לפי סדר עדיפות: כותרת מדויקת מה-TOC, ואז ה-ref כפי שנכתב
    const sections = [];
    if (tocText) sections.push(tocText);
    if (ref && ref !== tocText) sections.push(ref);

    // תחילת הספר — לזיהוי מקרה שבו הקפיצה לקטע לא נתפסה והוחזרה ההתחלה
    const head = toPlain(await getContent(bookId, { offset: 0 })).slice(0, 200);

    for (const section of sections) {
      const plain = toPlain(await getContent(bookId, { section }));
      if (!plain) continue;
      if (head && plain.slice(0, 200) === head) continue; // זו תחילת הספר, לא הקטע
      return plain.slice(0, 400);
    }
    return null;

  } catch (e) {
    return null;
  }
}

/* האזנה ל-hover על קישורי מקורות בתוצאה */
result.addEventListener('mouseover', ev => {
  const a = ev.target.closest('a.src');
  if (!a) return;
  clearTimeout(ttHideTimer);
  clearTimeout(ttShowTimer);
  ttShowTimer = setTimeout(() => showTooltip(a), 300);
});

result.addEventListener('mouseout', ev => {
  const a = ev.target.closest('a.src');
  if (!a) return;
  clearTimeout(ttShowTimer);
  ttHideTimer = setTimeout(hideTooltip, 200);
});

inputText.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); linkifyBtn.click(); }
});

/* ===== גרסה ===== */
document.getElementById('versionLine').textContent = 'גרסה ' + PLUGIN_VERSION;

/* ===== חיבור לאוצריא ===== */
if (typeof window.Otzaria !== 'undefined' && window.Otzaria.on) {
  window.Otzaria.on('plugin.boot', p => { if (p && p.theme) applyTheme(p.theme); });
  window.Otzaria.on('theme.changed', t => applyTheme(t));
}
if (typeof window.Otzaria !== 'undefined' && window.Otzaria.call) {
  window.Otzaria.call('app.getTheme')
    .then(r => { if (r && r.success) applyTheme(r.data); })
    .catch(() => {});
}
