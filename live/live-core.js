/* Live Class shared code (added 2026-11-12, plan: BACKCHANNEL-PLAN.md). Used by live/index.html (student page and
   ?screen=1 projector) and live/teach.html (the teacher console, shown in the All games dashboard's Live tab).
   Data (rules: the Live Class block in shared/firestore.rules):
     bc_live/<class code>          the live screen: { round, q, type, opts, skills, open, ends_at, spot, updated_at }. Anyone with the code reads it.
     bc_live/<code>/reacts/<round>_<sid>  one emoji per student on the spotlight { round, to (0 or 1), e, at }
     bc_answers/<id>               one answer (add only; only the class's teacher reads them)
     bc_pulse/<key>                one per student device: "I'm lost" and confidence (only the teacher reads)
     bc_private/<id>               a private question to the teacher (only the teacher reads)
   ?preview=1 keeps everything in this browser (localStorage mtg_live_preview_v1), so a teacher tab and a student tab
   opened side by side talk to each other with no Firebase at all. */
window.LC = (() => {
  const CFG = { apiKey: 'AIzaSyDU9vbCWJ4yWuD8bAX984DmQF4dvo13BHs', authDomain: 'rhythm-trainer-fc313.firebaseapp.com', projectId: 'rhythm-trainer-fc313', appId: '1:956677028482:web:c3ec72a279e61b6f6c929b' };
  const SDK = 'https://www.gstatic.com/firebasejs/10.12.2/';
  const Q = new URLSearchParams(location.search);
  const PREVIEW = Q.get('preview') === '1';
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

  const TYPES = { mc: 'Multiple choice', yn: 'Yes or no', text: 'Short answer', num: 'Number', word: 'One word', emoji: 'Emoji check-in' };
  const EMOJIS = ['😀', '🙂', '😐', '😕', '😵'];
  const REACTS = ['👍', '🤯', '😂', '💡'];
  const BAD = ['damn', 'hell', 'crap', 'stupid', 'idiot', 'sucks', 'shut up', 'dumb'];
  const flagged = t => { const s = ' ' + String(t).toLowerCase().replace(/[^a-z ]/g, ' ') + ' '; return BAD.some(w => s.includes(' ' + w + ' ')); };
  const NOW = { __now: 1 };                       // "server time" in a write
  const at = ms => ({ __at: ms });                 // a timestamp in a write
  const newKey = () => { const a = 'abcdefghijklmnopqrstuvwxyz0123456789'; let s = ''; const r = crypto.getRandomValues(new Uint8Array(20)); r.forEach(x => { s += a[x % 36]; }); return s; };
  const roundId = () => 'r' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6);

  // Starter questions (music). Skills are stored with the question for step 2 (skills map and report cards).
  const BANK = [
    { type: 'mc', q: 'How many half steps are in a perfect 5th?', opts: ['5', '6', '7', '8'], correct: '7', skills: ['intervals'] },
    { type: 'mc', q: 'Which major key has 2 sharps?', opts: ['G major', 'D major', 'A major', 'F major'], correct: 'D major', skills: ['keys'] },
    { type: 'yn', q: 'In 4/4, does a dotted half note last 3 beats?', correct: 'Yes', skills: ['rhythm', 'time'] },
    { type: 'num', q: 'How many eighth notes fit in one bar of 3/4?', correct: '6', skills: ['rhythm', 'time'] },
    { type: 'mc', q: 'On the treble staff, which line is G?', opts: ['1st line', '2nd line', '3rd line', '4th line'], correct: '2nd line', skills: ['notes'] },
    { type: 'mc', q: 'Which major scale has no sharps or flats?', opts: ['C major', 'G major', 'F major', 'D major'], correct: 'C major', skills: ['scales', 'keys'] },
    { type: 'text', q: 'What does crescendo mean?', skills: ['terms'] },
    { type: 'text', q: 'What is the difference between a major and a minor triad?', skills: ['chords'] },
    { type: 'mc', q: 'A major 3rd above C is…', opts: ['D', 'E♭', 'E', 'F'], correct: 'E', skills: ['intervals'] },
    { type: 'mc', q: 'Which note is on the top line of the bass staff?', opts: ['F', 'A', 'G', 'E'], correct: 'A', skills: ['notes'] },
    { type: 'num', q: 'How many beats does a whole note get in 4/4?', correct: '4', skills: ['rhythm'] },
    { type: 'word', q: 'One word: how does a minor chord sound to you?', skills: ['ear'] },
    { type: 'emoji', q: 'How are you feeling about intervals today?', skills: [] },
    { type: 'mc', q: 'Which interval opens "Here Comes the Bride"?', opts: ['Major 2nd', 'Perfect 4th', 'Perfect 5th', 'Octave'], correct: 'Perfect 4th', skills: ['ear', 'intervals'] },
    { type: 'text', q: 'Explain how you find a perfect 5th above any note.', skills: ['intervals'] },
    { type: 'mc', q: 'In 6/8, which note gets one count?', opts: ['Quarter note', 'Eighth note', 'Half note', 'Sixteenth note'], correct: 'Eighth note', skills: ['time'] },
    { type: 'yn', q: 'Is F♯ the first sharp in a key signature?', correct: 'Yes', skills: ['keys'] },
  ];

  // ---------- Firestore (real) ----------
  let fbP = null, authP = null;
  function fb() {
    fbP = fbP || Promise.all([import(SDK + 'firebase-app.js'), import(SDK + 'firebase-firestore.js')])
      .then(([a, fs]) => ({ a, fs, db: fs.getFirestore(a.getApps().find(x => x.name === '[DEFAULT]') || a.initializeApp(CFG)) }))
      .catch(e => { fbP = null; throw e; });
    return fbP;
  }
  function fbAuth() {
    authP = authP || Promise.all([fb(), import(SDK + 'firebase-auth.js')]).then(([f, am]) => ({ ...f, am, auth: am.getAuth(f.db.app) }))
      .catch(e => { authP = null; throw e; });
    return authP;
  }
  const toMs = v => v && typeof v.toMillis === 'function' ? v.toMillis() : v;
  const fromFs = d => { const o = {}; for (const [k, v] of Object.entries(d || {})) o[k] = toMs(v); return o; };
  const toFs = (fs, d) => { const o = {}; for (const [k, v] of Object.entries(d)) o[k] = v === NOW ? fs.serverTimestamp() : v && v.__at != null ? fs.Timestamp.fromMillis(v.__at) : v; return o; };
  const real = {
    async watchDoc(path, cb, err) { const { fs, db } = await fb(); return fs.onSnapshot(fs.doc(db, path), s => cb(s.exists() ? fromFs(s.data({ serverTimestamps: 'estimate' })) : null), err || (() => {})); },
    async watchCol(col, where, cb, err) {
      const { fs, db } = await fb();
      const q = fs.query(fs.collection(db, col), ...Object.entries(where).map(([k, v]) => fs.where(k, '==', v)));
      return fs.onSnapshot(q, s => cb(s.docs.map(d => ({ id: d.id, ...fromFs(d.data({ serverTimestamps: 'estimate' })) }))), err || (() => {}));
    },
    async getDoc(path) { const { fs, db } = await fb(); const s = await fs.getDoc(fs.doc(db, path)); return s.exists() ? fromFs(s.data()) : null; },
    async set(path, d) { const { fs, db } = await fb(); return fs.setDoc(fs.doc(db, path), toFs(fs, d)); },
    async add(col, d) { const { fs, db } = await fb(); return (await fs.addDoc(fs.collection(db, col), toFs(fs, d))).id; },
    async update(path, d) { const { fs, db } = await fb(); return fs.updateDoc(fs.doc(db, path), toFs(fs, d)); },
    async del(path) { const { fs, db } = await fb(); return fs.deleteDoc(fs.doc(db, path)); },
  };

  // ---------- preview: the same calls, kept in this browser ----------
  const MK = 'mtg_live_preview_v1';
  const subs = new Set();
  const readAll = () => { try { return JSON.parse(localStorage.getItem(MK) || '{}'); } catch { return {}; } };
  const writeAll = o => { try { localStorage.setItem(MK, JSON.stringify(o)); } catch {} subs.forEach(f => f()); };
  window.addEventListener('storage', e => { if (e.key === MK) subs.forEach(f => f()); });
  const memVal = d => { const o = {}; for (const [k, v] of Object.entries(d)) o[k] = v === NOW ? Date.now() : v && v.__at != null ? v.__at : v; return o; };
  const inCol = (path, col) => path.startsWith(col + '/') && path.slice(col.length + 1).indexOf('/') < 0;
  const mem = {
    async watchDoc(path, cb) { const f = () => cb(readAll()[path] || null); subs.add(f); f(); return () => subs.delete(f); },
    async watchCol(col, where, cb) {
      const f = () => { const all = readAll(); cb(Object.keys(all).filter(p => inCol(p, col) && Object.entries(where).every(([k, v]) => all[p][k] === v)).map(p => ({ id: p.split('/').pop(), ...all[p] }))); };
      subs.add(f); f(); return () => subs.delete(f);
    },
    async getDoc(path) { return readAll()[path] || null; },
    async set(path, d) { const o = readAll(); o[path] = memVal(d); writeAll(o); },
    async add(col, d) { const id = Math.random().toString(36).slice(2, 12); await mem.set(col + '/' + id, d); return id; },
    async update(path, d) { const o = readAll(); if (!o[path]) throw new Error('not-found'); o[path] = { ...o[path], ...memVal(d) }; writeAll(o); },
    async del(path) { const o = readAll(); delete o[path]; writeAll(o); },
    reset() { writeAll({}); },
  };
  const db = PREVIEW ? mem : real;

  // ---------- results (teacher console and projector; counts only, never names) ----------
  // ans = the latest answer from each student: [{ text, sid, ... }]
  function results(live, ans, opt = {}) {
    const A = ans.map(a => String(a.text)), big = !!opt.big, correct = opt.correct || '';
    if (!A.length) return '<p class="muted empty">Answers will appear here as they come in.</p>';
    const bar = (lab, c, max, ok) => `<div class="bar${ok ? ' correct' : ''}"><span class="lab">${ok ? '✓ ' : ''}${esc(lab)}</span><span class="tr"><i style="width:${100 * c / max}%"></i></span><b class="mono">${c}</b></div>`;
    if (live.type === 'mc' || live.type === 'yn') {
      const opts = live.type === 'yn' ? ['Yes', 'No'] : (live.opts || []);
      const max = Math.max(1, ...opts.map(o => A.filter(x => x === o).length));
      return `<div class="bars">${opts.map(o => bar(o, A.filter(x => x === o).length, max, correct && o === correct)).join('')}</div>`;
    }
    if (live.type === 'num') {
      const cnt = {}; A.map(Number).filter(n => !isNaN(n)).forEach(n => { cnt[n] = (cnt[n] || 0) + 1; });
      const keys = Object.keys(cnt).sort((a, b) => a - b), max = Math.max(1, ...Object.values(cnt));
      return `<div class="bars">${keys.map(k => bar(k, cnt[k], max, correct !== '' && Number(k) === Number(correct))).join('')}</div>`;
    }
    if (live.type === 'word') {
      const cnt = {}; A.forEach(w => { const k = w.toLowerCase().trim(); if (k) cnt[k] = (cnt[k] || 0) + 1; });
      const max = Math.max(1, ...Object.values(cnt)), cols = ['var(--mint)', 'var(--sky)', 'var(--violet)', 'var(--gold)', 'var(--rose)'];
      return `<div class="cloud">${Object.entries(cnt).sort((a, b) => b[1] - a[1]).slice(0, 40).map(([w, c], i) => `<span style="font-size:${(big ? 22 : 15) + (big ? 54 : 28) * (c / max)}px;color:${cols[i % 5]}">${esc(w)}</span>`).join('')}</div>`;
    }
    if (live.type === 'emoji') return `<div class="emo">${EMOJIS.map(e => `<div><b>${e}</b><span class="mono">${A.filter(x => x === e).length}</span></div>`).join('')}</div>`;
    return `<div class="row"><span class="big">${A.length}</span><span class="muted">written answer${A.length === 1 ? '' : 's'} in.${opt.hint ? ' Spotlight one to share it with the class.' : ''}</span></div>`;
  }
  // newest answer per student, newest first
  function latest(list) {
    const by = {}; list.forEach(a => { if (!by[a.sid] || (a.at || 0) > (by[a.sid].at || 0)) by[a.sid] = a; });
    return Object.values(by).sort((a, b) => (b.at || 0) - (a.at || 0));
  }
  const left = live => live && live.open && live.ends_at ? Math.max(0, Math.ceil((live.ends_at - Date.now()) / 1000)) : null;
  const clock = s => s == null ? '' : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  const ERR = e => { const c = String(e && (e.code || e.message) || e); return /permission/i.test(c) ? 'Live Class is not switched on yet (the new database rules are not in place).' : /offline|unavailable|timeout/i.test(c) ? 'No connection. Check the wifi and try again.' : 'Something went wrong: ' + c; };

  return { PREVIEW, Q, esc, TYPES, EMOJIS, REACTS, BANK, NOW, at, newKey, roundId, flagged, db, fbAuth, results, latest, left, clock, ERR };
})();
