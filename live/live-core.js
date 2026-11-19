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

  // ---------- key signatures (added 2026-11-17): the 🎼 Key signature maker in the teacher console ----------
  // A question's ks = -7..7 (minus = flats, 0 = none) is drawn on a treble staff above the choices (student page, projector, teacher).
  // Drawing follows Scale Quest (positions count lines and spaces up from C4; bottom line E4 = 2, top line F5 = 10; one space = 20).
  const KS_MAJ = { '-7': 'C♭', '-6': 'G♭', '-5': 'D♭', '-4': 'A♭', '-3': 'E♭', '-2': 'B♭', '-1': 'F', 0: 'C', 1: 'G', 2: 'D', 3: 'A', 4: 'E', 5: 'B', 6: 'F♯', 7: 'C♯' };
  const KS_MIN = { '-7': 'A♭', '-6': 'E♭', '-5': 'B♭', '-4': 'F', '-3': 'C', '-2': 'G', '-1': 'D', 0: 'A', 1: 'E', 2: 'B', 3: 'F♯', 4: 'C♯', 5: 'G♯', 6: 'D♯', 7: 'A♯' };
  const KS_ORDER = [0, 1, 2, 3, 4, 5, 6, 7, -1, -2, -3, -4, -5, -6, -7];   // the teacher's buttons: C, the sharp keys, then the flat keys
  const ksOk = n => Number.isInteger(n) && n >= -7 && n <= 7;
  const ksName = (n, minor) => (minor ? KS_MIN : KS_MAJ)[n] + (minor ? ' minor' : ' major');
  const ksCount = n => n === 0 ? 'No sharps or flats' : Math.abs(n) + (n > 0 ? ' sharp' : ' flat') + (Math.abs(n) > 1 ? 's' : '');
  const SHARP_POS = [10, 7, 11, 8, 5, 9, 6], FLAT_POS = [6, 9, 5, 8, 4, 7, 3];   // F C G D A E B / B E A D G C F
  const ksY = p => 170 - p * 10;
  const SHARP = '<path d="M-4 -17V15M4 -15V17" stroke-width="2.2"/><path d="M-9 -3 9 -8M-9 8 9 3" stroke-width="4.5"/>';
  const FLAT = '<path d="M-5 -24V8" stroke-width="2.4"/><path d="M-5 8C4 3 10 -2 7 -6 4 -9-2 -6-5 -2" stroke-width="3.2"/>';
  // Clefs (2026-11-17, David): treble, bass or alto. A key signature sits 2 steps lower in bass clef and 1 lower in alto (as in Scale Quest).
  const KS_CLEFS = { treble: { sh: 0, name: 'Treble' }, bass: { sh: -2, name: 'Bass' }, alto: { sh: -1, name: 'Alto' } };
  const clefOk = c => c === 'treble' || c === 'bass' || c === 'alto';
  const CLEF_SVG = {
    // The treble clef curls around the second staff line (G).
    treble: `<g transform="translate(30 ${ksY(4)})" fill="#1d2433"><path d="M-3 16C-15 13-20 3-17-8C-14-20-3-27 7-37C17-47 20-61 15-68C9-65 6-55 7-44C8-24 12-3 16 16C19 32 24 43 18 51C14 58 4 60-2 55C-9 50-7 41 0 39C8 37 12 47 5 52C10 54 15 50 16 45C17 37 13 27 11 16C7-4 3-25 2-43C1-58 6-73 15-81C22-78 26-65 24-55C22-43 14-33 5-25C-4-16-11-9-12 0C-12 8-8 13-3 16Z"/><path d="M-3 17C-11 12-11 0-4-6C4-13 17-10 22-1C28 10 21 23 8 24C0 25-8 21-12 16C-5 21 3 22 10 19C17 16 19 10 16 4C13-2 6-4 1 0C-4 3-5 12-3 17Z"/></g>`,
    // The bass clef's curl and dots mark the fourth staff line (F).
    bass: `<g transform="translate(18 ${ksY(8)})" fill="#1d2433"><path d="M1 1C-2-9 8-18 20-18C34-18 42-9 42 2C42 20 23 35 0 46L-1 44C18 32 32 15 32 0C32-9 28-15 20-15C11-15 5-8 6 0Z"/><circle cx="9" cy="0" r="8"/><circle cx="49" cy="-10" r="4"/><circle cx="49" cy="10" r="4"/></g>`,
    alto: `<text x="14" y="${170 - 2 * 10 + 1}" font-size="80" fill="#1d2433" style="font-family:'Noto Music','Apple Symbols','Segoe UI Symbol',serif">𝄡</text>` };
  function ksStaff(n, label, clef) {
    if (!ksOk(n)) return '';
    const C = clefOk(clef) ? clef : 'treble', sh = KS_CLEFS[C].sh;
    const lines = [2, 4, 6, 8, 10].map(p => `<line x1="6" x2="250" y1="${ksY(p)}" y2="${ksY(p)}" stroke="#1d2433" stroke-width="1.6"/>`).join('');
    let acc = '';
    for (let i = 0; i < Math.abs(n); i++) acc += `<g transform="translate(${88 + i * 20} ${ksY((n > 0 ? SHARP_POS : FLAT_POS)[i] + sh)}) scale(.9)" fill="none" stroke="#1d2433">${n > 0 ? SHARP : FLAT}</g>`;
    return `<div class="ksbox"><svg viewBox="0 30 256 172" role="img" aria-label="${esc(label || KS_CLEFS[C].name + ' clef, key signature: ' + ksCount(n).toLowerCase())}">${lines}<line x1="6" x2="6" y1="${ksY(10)}" y2="${ksY(2)}" stroke="#1d2433" stroke-width="1.6"/>${CLEF_SVG[C]}${acc}</svg></div>`;
  }
  const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  // Wrong choices that catch real mistakes: one accidental more or less, the same number of the other accidental,
  // and on minor keys the relative major (reading the signature as major). Then a little further away if a key is at the edge.
  function ksNear(n, minor) {
    const near = shuffle([n + 1, n - 1].concat(n ? [-n] : [])), far = [n + 2, n - 2, n + 3, n - 3];
    return (minor ? [{ n, minor: false }] : []).concat(near.concat(far).filter(ksOk).map(k => ({ n: k, minor })));
  }
  // style 'name' = the staff is shown, pick the key; 'count' = no staff, pick how many sharps or flats
  function ksQuestion(n, minor, style, clef) {
    const kind = minor ? 'minor' : 'major';
    if (style === 'count') {
      const right = ksCount(n), wrong = [];
      for (const k of ksNear(n, false)) { const t = ksCount(k.n); if (t !== right && !wrong.includes(t)) wrong.push(t); if (wrong.length === 3) break; }
      return { type: 'mc', q: `How many sharps or flats are in ${ksName(n, minor)}?`, opts: shuffle([right, ...wrong]), correct: right, skills: ['keys'], ks: null, clef: 'treble' };
    }
    const right = ksName(n, minor), wrong = [];
    for (const k of ksNear(n, minor)) { const t = ksName(k.n, k.minor); if (t !== right && !wrong.includes(t)) wrong.push(t); if (wrong.length === 3) break; }
    return { type: 'mc', q: `This is the key signature for which ${kind} key?`, opts: shuffle([right, ...wrong]), correct: right, skills: ['keys'], ks: n, clef: clefOk(clef) ? clef : 'treble' };
  }

  // ---------- Game questions (2026-11-17, David 'go'): pick a game, then Warm-up / Challenge / Brutal, press Go ----------
  // Spec: the Claude Doc "Live Class: game question sets and Stars". Each maker returns a ready multiple-choice question with its
  // correct answer and, for every wrong choice, why it is tempting (shown to the teacher after the lock). Wrong choices are real mistakes.
  const DIFFS = { warmup: 'Warm-up', challenge: 'Challenge', brutal: 'Brutal' };
  const rnd = a => a[Math.floor(Math.random() * a.length)];
  const ORD = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th'];
  const LETTERS = 'CDEFGAB';
  // the 7 notes of a key: letter names from the tonic, with the key signature's sharps or flats
  function keyNotes(n, minor) {
    const tonic = (minor ? KS_MIN : KS_MAJ)[n], i = LETTERS.indexOf(tonic[0]), acc = {};
    (n > 0 ? 'FCGDAEB' : 'BEADGCF').slice(0, Math.abs(n)).split('').forEach(c => { acc[c] = n > 0 ? '♯' : '♭'; });
    return [0, 1, 2, 3, 4, 5, 6].map(k => { const c = LETTERS[(i + k) % 7]; return c + (acc[c] || ''); });
  }
  const flipAcc = t => t.length === 1 ? t + (Math.random() < .5 ? '♯' : '♭') : t[0];   // D♯ -> D, D -> D♯ or D♭
  const ENH = { 'C♯': 'D♭', 'D♯': 'E♭', 'F♯': 'G♭', 'G♯': 'A♭', 'A♯': 'B♭', 'D♭': 'C♯', 'E♭': 'D♯', 'G♭': 'F♯', 'A♭': 'G♯', 'B♭': 'A♯', 'E♯': 'F', 'B♯': 'C', 'C♭': 'B', 'F♭': 'E' };
  // right + up to 3 wrong [text, why] pairs (duplicates and the right answer itself are skipped) -> a question
  function mcq(q, right, wrongs, extra) {
    const why = {}, opts = [right];
    for (const [t, w] of wrongs) { if (opts.length === 4) break; if (!t || opts.includes(t)) continue; opts.push(t); why[t] = w; }
    return { type: 'mc', q, opts: shuffle(opts), correct: right, why, skills: ['keys'], ks: null, clef: 'treble', ...(extra || {}) };
  }
  const ksWhy = (n, minor, k) => k.minor !== minor ? 'That is the relative ' + (k.minor ? 'minor' : 'major') + ': it shares this key signature.'
    : k.n === -n ? 'Same number of accidentals, but ' + (n > 0 ? 'flats instead of sharps.' : 'sharps instead of flats.') : 'Off by one: count the ' + (n > 0 ? 'sharps' : 'flats') + ' again.';
  function ksMC(n, minor, clef, q) {
    return mcq(q || `This is the key signature for which ${minor ? 'minor' : 'major'} key?`, ksName(n, minor),
      ksNear(n, minor).map(k => [ksName(k.n, k.minor), n === 0 && k.n !== 0 ? 'C has no sharps or flats.' : ksWhy(n, minor, k)]), { ks: n, clef });
  }
  // Customize (2026-11-17, step 3): OPT holds the teacher's choices while a question is made. clef: any | treble | bass | alto;
  // acc: both | sharps | flats; mode: both | major | minor; type: mix | name | spell | count | relative | odd (Scale Quest).
  const OPT_DEF = { nl: 'any', na: 'any', where: 'any', clef: 'any', acc: 'both', mode: 'both', type: 'mix', play: 'mix', ivs: [], chords: [], inv: 'root', root: 'any', range: 'mid', timer: 30 };
  let OPT = OPT_DEF;
  const anyClef = def => OPT.clef !== 'any' ? OPT.clef : def || rnd(['treble', 'treble', 'bass', 'alto']);
  const accOk = n => OPT.acc === 'sharps' ? n >= 0 : OPT.acc === 'flats' ? n <= 0 : true;
  const nOf = (lo, hi) => { let l = KS_ORDER.filter(n => Math.abs(n) >= lo && Math.abs(n) <= hi && accOk(n) && (OPT.acc === 'both' || n !== 0 || lo === 0 && hi < 1));
    if (!l.length) l = KS_ORDER.filter(n => Math.abs(n) >= lo && Math.abs(n) <= hi); return rnd(l); };
  const isMinor = p => OPT.mode === 'major' ? false : OPT.mode === 'minor' ? true : Math.random() < p;
  function spell(n, minor) {   // "What is the 6th note of E♭ major?"
    const N = keyNotes(n, minor), k = 1 + Math.floor(Math.random() * 6), right = N[k], key = ksName(n, minor);
    return mcq(`What is the ${ORD[k]} note of ${key}?`, right, [
      [flipAcc(right), right.length > 1 ? 'Right letter, but this key has ' + right + '.' : 'Right letter, but there is no sharp or flat on ' + right + ' in this key.'],
      [N[k - 1], 'One step low: the key note counts as 1st.'], [N[(k + 1) % 7], 'One step high: the key note counts as 1st.'], [ENH[right], 'Sounds the same, but the letter name is wrong in this key.']]);
  }
  function relative(n, minor) {   // both ways: relative minor of a major key, or relative major of a minor key (minor given = that way)
    if (minor === false || minor !== true && Math.random() < .5) {
      const maj = KS_MAJ[n], right = KS_MIN[n] + ' minor', N = keyNotes(n, false);
      return mcq(`What is the relative minor of ${maj} major?`, right, [[maj + ' minor', 'That is the parallel minor (same starting note, different key signature).'],
        [N[2] + ' minor', 'The relative minor starts on the 6th note, not the 3rd.'], [ksOk(n + 1) ? KS_MIN[n + 1] + ' minor' : '', 'Off by one key.'], [ksOk(n - 1) ? KS_MIN[n - 1] + ' minor' : '', 'Off by one key.'], [ksOk(n + 2) ? KS_MIN[n + 2] + ' minor' : KS_MIN[n - 2] + ' minor', 'Off by two keys.']]);
    }
    const mi = KS_MIN[n], right = KS_MAJ[n] + ' major', N = keyNotes(n, true);
    return mcq(`What is the relative major of ${mi} minor?`, right, [[mi + ' major', 'That is the parallel major (same starting note, different key signature).'],
      [N[5] + ' major', 'The relative major starts on the 3rd note of the minor key, not the 6th.'], [ksOk(n + 1) ? KS_MAJ[n + 1] + ' major' : '', 'Off by one key.'], [ksOk(n - 1) ? KS_MAJ[n - 1] + ' major' : '', 'Off by one key.'], [ksOk(n + 2) ? KS_MAJ[n + 2] + ' major' : KS_MAJ[n - 2] + ' major', 'Off by two keys.']]);
  }
  function enharmonic(fix, fixMinor) {   // B = C♭, F♯ = G♭, C♯ = D♭ (and their relative minors); fix = ask about that key
    const pairs = [[5, -7], [6, -6], [7, -5], [-7, 5], [-6, 6], [-5, 7]].filter(([a0, b0]) => fix != null ? a0 === fix : accOk(b0)), [a, b] = rnd(pairs), minor = fixMinor != null ? fixMinor : isMinor(.4);
    const from = ksName(a, minor), right = ksName(b, minor), with_ = b < 0 ? 'flats' : 'sharps';
    return mcq(`Which key sounds the same as ${from} but is written with ${with_}?`, right,
      [[ksOk(b + 1) ? ksName(b + 1, minor) : '', 'A different key: one accidental off.'], [ksOk(b - 1) ? ksName(b - 1, minor) : '', 'A different key: one accidental off.'],
       [from[0] + ' ' + (minor ? 'minor' : 'major'), 'Same letter, but the natural key does not sound the same.'], [ksName(-a, minor), 'Same number of accidentals, but that is a different key.']]);
  }
  function oddOne(n, minor) {   // "Which note is NOT in B major?" (minor: natural minor)
    const N = keyNotes(n, !!minor), key = ksName(n, !!minor), accd = N.filter(x => x.length > 1), base = rnd(accd.length ? accd : N);
    const trap = Math.random() < .5 && ENH[base] ? ENH[base] : flipAcc(base);
    const ins = shuffle(N.filter(x => x !== base)).slice(0, 3);
    return { ...mcq(`Which note is NOT in ${key}?`, trap, ins.map(x => [x, x + ' is in ' + key + '.'])), why: Object.fromEntries(ins.map(x => [x, x + ' is in ' + key + ': check every note against the key signature.'])) };
  }
  // ---------- Tidal Tones (2026-11-17, step 4): notes and intervals on the staff ----------
  // A note = p (letter steps from middle C: C4 = 0, D4 = 1 … B3 = -1) + acc (-1 flat, 0, +1 sharp), kept in bc_live.gen.n as p * 3 + acc + 1.
  // Drawn with the key signature staff: dp = p + the clef's shift (treble 0, alto 6, bass 12); dp 2..10 = on the staff, ledger lines outside.
  const CLEF_SHIFT = { treble: 0, alto: 6, bass: 12 };
  const enc = (p, acc) => p * 3 + acc + 1, dec = c => { if (c >= 10000) { const v = c - 10000, w = v % 8; return { p: Math.floor(v / 8) - 60, acc: 0, w }; } const acc = ((c % 3) + 3) % 3 - 1; return { p: (c - acc - 1) / 3, acc }; };
  // 2026-11-18 (David: Tidal Brutal with key signatures, 'accidentals of doom' style): a note can carry a WRITTEN accidental that works
  // together with the key signature. w: 0 none (the key signature decides), 1 natural, 2 sharp, 3 flat, 4 double sharp, 5 double flat.
  const encW = (p, w) => 10000 + (p + 60) * 8 + w;
  const W_ACC = [null, 0, 1, -1, 2, -2];
  const SHARP_L = [3, 0, 4, 1, 5, 2, 6], FLAT_L = [6, 2, 5, 1, 4, 0, 3];   // F C G D A E B / B E A D G C F as letter indexes (C = 0)
  const keyAcc = (p, ks) => { const L = ((p % 7) + 7) % 7; return ks > 0 && SHARP_L.slice(0, ks).includes(L) ? 1 : ks < 0 && FLAT_L.slice(0, -ks).includes(L) ? -1 : 0; };
  const realAcc = (p, w, ks) => w ? W_ACC[w] : keyAcc(p, ks);
  const NATURAL = '<path d="M-4 -17V8M4 -8V17" stroke-width="2.2"/><path d="M-4 -3 4 -7M-4 8 4 4" stroke-width="4.2"/>';
  const DSHARP = '<path d="M-6 -6 6 6M-6 6 6 -6" stroke-width="3.2"/><rect x="-8" y="-8" width="4" height="4" fill="#1d2433"/><rect x="4" y="-8" width="4" height="4" fill="#1d2433"/><rect x="-8" y="4" width="4" height="4" fill="#1d2433"/><rect x="4" y="4" width="4" height="4" fill="#1d2433"/>';
  const accGlyph = w => w === 1 ? NATURAL : w === 2 ? SHARP : w === 3 ? FLAT : w === 4 ? DSHARP : w === 5 ? `<g transform="translate(-10 0)">${FLAT}</g>${FLAT}` : '';
  const SEMI = [0, 2, 4, 5, 7, 9, 11];
  const pitch = (p, acc) => 12 * Math.floor(p / 7) + SEMI[((p % 7) + 7) % 7] + acc;
  const noteName = (p, acc) => LETTERS[((p % 7) + 7) % 7] + (acc >= 2 ? '𝄪' : acc <= -2 ? '𝄫' : acc > 0 ? '♯' : acc < 0 ? '♭' : '');
  const NOTE = '<ellipse rx="11.5" ry="8.2" transform="rotate(-20)" fill="none" stroke="#1d2433" stroke-width="4.2"/>';
  function noteStaff(codes, clef, ks) {
    const C = clefOk(clef) ? clef : 'treble', sh = CLEF_SHIFT[C], N = (codes || []).map(dec), K = ksOk(ks) ? ks : 0, x0 = K ? 88 + Math.abs(K) * 20 + 50 : 130, WD = Math.max(256, x0 + (N.length - 1) * 70 + 40);
    if (!N.length) return '';
    const lines = [2, 4, 6, 8, 10].map(p => `<line x1="6" x2="${WD - 6}" y1="${ksY(p)}" y2="${ksY(p)}" stroke="#1d2433" stroke-width="1.6"/>`).join('');
    let body = '';
    for (let i = 0; i < Math.abs(K); i++) body += `<g transform="translate(${88 + i * 20} ${ksY((K > 0 ? SHARP_POS : FLAT_POS)[i] + KS_CLEFS[C].sh)}) scale(.9)" fill="none" stroke="#1d2433">${K > 0 ? SHARP : FLAT}</g>`;
    const dps = N.map(n => n.p + sh), lo = Math.min(2, ...dps), hi = Math.max(10, ...dps), top = Math.min(30, ksY(hi) - 26), bot = Math.max(202, ksY(lo) + 26);
    N.forEach((n, i) => {
      const x = K ? x0 + i * 70 : N.length === 1 ? 160 : 130 + i * 70, dp = n.p + sh, y = ksY(dp);
      for (let l = 0; l >= dp; l -= 2) body += `<line x1="${x - 17}" x2="${x + 17}" y1="${ksY(l)}" y2="${ksY(l)}" stroke="#1d2433" stroke-width="1.6"/>`;
      for (let l = 12; l <= dp; l += 2) body += `<line x1="${x - 17}" x2="${x + 17}" y1="${ksY(l)}" y2="${ksY(l)}" stroke="#1d2433" stroke-width="1.6"/>`;
      if (n.w) body += `<g transform="translate(${x - 28} ${y}) scale(.9)" fill="none" stroke="#1d2433">${accGlyph(n.w)}</g>`;
      else if (n.acc) body += `<g transform="translate(${x - 28} ${y}) scale(.9)" fill="none" stroke="#1d2433">${n.acc > 0 ? SHARP : FLAT}</g>`;
      body += `<g transform="translate(${x} ${y})">${NOTE}</g>`;
    });
    return `<div class="ksbox${WD > 256 ? ' wide' : ''}"><svg viewBox="0 ${top} ${WD} ${bot - top}" role="img" aria-label="${esc(KS_CLEFS[C].name + ' clef' + (K ? ', key signature ' + ksCount(K).toLowerCase() + ',' : '') + ' with ' + (N.length === 1 ? 'one note' : 'two notes'))}">${lines}<line x1="6" x2="6" y1="${ksY(10)}" y2="${ksY(2)}" stroke="#1d2433" stroke-width="1.6"/>${CLEF_SVG[C]}${body}</svg></div>`;
  }
  // ---------- Sound questions (2026-11-17, step 5): Earshot Saloon intervals and Brainwaves chords ----------
  // bc_live.gen.m = up to 4 MIDI notes, gen.p = how they play: up | down | together | chord (together, then one at a time).
  // The class hears them from the projector (or the teacher's computer when no projector is open); phones stay silent.
  let AC = null;
  const audio = () => { try { AC = AC || new (window.AudioContext || window.webkitAudioContext)(); if (AC.state === 'suspended') AC.resume(); } catch (e) {} return AC; };
  const unlocked = () => !!AC && AC.state === 'running';
  function tone(ctx, midi, t, dur) {   // a soft piano-like note: two sines and a triangle with a quick attack and a long fade
    const f = 440 * Math.pow(2, (midi - 69) / 12), g = ctx.createGain(), out = ctx.createGain();
    out.gain.value = .22; g.connect(out); out.connect(ctx.destination);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(1, t + .012); g.gain.exponentialRampToValueAtTime(.35, t + .35); g.gain.exponentialRampToValueAtTime(.001, t + dur);
    [[f, 'triangle', .6], [f * 2, 'sine', .25], [f * 3, 'sine', .08]].forEach(([fr, ty, v]) => { const o = ctx.createOscillator(), og = ctx.createGain(); o.type = ty; o.frequency.value = fr; og.gain.value = v; o.connect(og); og.connect(g); o.start(t); o.stop(t + dur + .05); });
  }
  function play(m, how) {
    const ctx = audio(); if (!ctx || !Array.isArray(m) || !m.length) return 0;
    const t0 = ctx.currentTime + .08, L = m.slice().sort((a, b) => a - b);
    if (how === 'together') { L.forEach(n => tone(ctx, n, t0, 2.2)); return 2300; }
    if (how === 'chord') { L.forEach(n => tone(ctx, n, t0, 1.6)); L.forEach((n, i) => tone(ctx, n, t0 + 1.8 + i * .55, 1.1)); return 1900 + L.length * 550 + 900; }
    if (how === 'uptog' || how === 'downtog') { const s = how === 'downtog' ? L.slice().reverse() : L; s.forEach((n, i) => tone(ctx, n, t0 + i * .6, 1.0)); const tb = t0 + s.length * .6 + .5; L.forEach(n => tone(ctx, n, tb, 2.0)); return s.length * 600 + 500 + 2100; }
    const seq = how === 'down' ? L.slice().reverse() : L; seq.forEach((n, i) => tone(ctx, n, t0 + i * .8, 1.3)); return seq.length * 800 + 900;
  }
  const isSound = x => !!(x && x.gen && Array.isArray(x.gen.m) && x.gen.m.length);
  // how it plays (like musictheory.net's Play Mode, 2026-11-17): harmonic, melodic up or down, or melodic then harmonic
  const HOW = { up: 'melodic, going up', down: 'melodic, going down', together: 'harmonic (all together)', chord: 'harmonic, then melodic going up', uptog: 'melodic going up, then harmonic', downtog: 'melodic going down, then harmonic' };
  const PLAY_OPTS = [['mix', 'Mix'], ['together', 'Harmonic'], ['up', 'Melodic ↑'], ['down', 'Melodic ↓'], ['uptog', 'Melodic ↑ then harmonic'], ['downtog', 'Melodic ↓ then harmonic']];
  // whatever picture a question has: a speaker (sound), notes (Tidal Tones), else a key signature. where = 'proj' | 'teach' | phone
  const staffFor = (x, where) => isSound(x) ? `<div class="listenbox"><span class="lb-ic">🔊</span><div><b>${where === 'proj' || where === 'teach' ? 'Listen' : 'Listen to the class speaker'}</b><small>${esc(HOW[x.gen.p] || '')}</small></div>${where === 'proj' || where === 'teach' ? '<button type="button" class="btn pri" data-play="1">▶ Play' + (where === 'proj' ? ' again' : '') + '</button>' : ''}</div>`
    : x && x.gen && Array.isArray(x.gen.r) && x.gen.r.length ? rhythmStaff(x.gen.r, x.gen.t)
    : x && x.gen && Array.isArray(x.gen.n) && x.gen.n.length ? noteStaff(x.gen.n, x.clef, x.ks) : ksStaff(x && x.ks, '', x && x.clef);
  // ---------- Rhythm questions (2026-11-17, step 6): The Big Score and Rooftop Runner ----------
  // A bar = a list of notes and rests in sixteenths (16 = whole, 12 = dotted half, 8 = half, 6 = dotted quarter, 4 = quarter,
  // 3 = dotted eighth, 2 = eighth, 1 = sixteenth). bc_live.gen.r keeps each as units * 2 + (1 for a rest); gen.t = the time signature shown ('' = none).
  const MF = "font-family:'Noto Music','Apple Symbols','Segoe UI Symbol',serif";
  const NGLYPH = { 16: '\u{1D15D}', 8: '\u{1D15E}', 4: '\u{1D15F}', 2: '\u{1D160}', 1: '\u{1D161}' }, RGLYPH = { 16: '\u{1D13B}', 8: '\u{1D13C}', 4: '\u{1D13D}', 2: '\u{1D13E}', 1: '\u{1D13F}' };
  const baseOf = u => NGLYPH[u] ? [u, false] : [u * 2 / 3, true];   // 6 = dotted quarter -> [4, dot]
  function rhythmStaff(codes, ts) {
    const E = (codes || []).map(c => ({ u: c >> 1, rest: !!(c & 1) })); if (!E.length) return '';
    const lines = [2, 4, 6, 8, 10].map(p => `<line x1="6" x2="W" y1="${ksY(p)}" y2="${ksY(p)}" stroke="#1d2433" stroke-width="1.6"/>`).join('');
    let x = ts ? 70 : 30, body = '';
    if (ts) { const [a, b] = ts.split('/'); body += `<text x="22" y="${ksY(8) + 11}" font-size="38" font-weight="800" fill="#1d2433" style="font-family:Georgia,serif">${esc(a)}</text><text x="22" y="${ksY(4) + 11}" font-size="38" font-weight="800" fill="#1d2433" style="font-family:Georgia,serif">${esc(b)}</text>`; }
    const y0 = ksY(6), K = '#1d2433';   // notes sit on the middle line, stems up; drawn with paths so every computer shows the same thing
    E.forEach(e => {
      const [b, dot] = baseOf(e.u);
      if (e.rest) {
        if (b === 16) body += `<rect x="${x - 9}" y="${ksY(8)}" width="18" height="8" fill="${K}"/>`;
        else if (b === 8) body += `<rect x="${x - 9}" y="${y0 - 8}" width="18" height="8" fill="${K}"/>`;
        else if (b === 4) body += `<path d="M${x - 4} ${y0 - 24} l9 11 l-8 8 l9 11 c-8 -4 -12 2 -5 10" fill="none" stroke="${K}" stroke-width="3.4" stroke-linejoin="round" stroke-linecap="round"/>`;
        else { const fl = (yy) => `<circle cx="${x - 4}" cy="${yy}" r="3.6" fill="${K}"/><path d="M${x - 4} ${yy + 1} q7 2 11 -5" fill="none" stroke="${K}" stroke-width="2.4"/>`;
          body += fl(y0 - 10) + (b === 1 ? fl(y0 + 2) : '') + `<line x1="${x + 7}" y1="${y0 - 15}" x2="${x - 1}" y2="${y0 + (b === 1 ? 22 : 14)}" stroke="${K}" stroke-width="2.4"/>`; }
      } else {
        body += `<g transform="translate(${x} ${y0}) rotate(-20)"><ellipse rx="8" ry="5.8" fill="${b >= 8 ? 'none' : K}" stroke="${K}" stroke-width="${b >= 8 ? 2.6 : 1}"/></g>`;
        if (b < 16) {
          // Meet the rim of the hollow half note without entering its opening.
          const stemX = x + (b === 8 ? 8 : 7), stemBottom = y0 - (b === 8 ? 4 : 1);
          body += `<line x1="${stemX}" y1="${y0 - 44}" x2="${stemX}" y2="${stemBottom}" stroke="${K}" stroke-width="2"/>`;
        }
        if (b <= 2) body += `<path d="M${x + 7} ${y0 - 44} c2 10 14 12 9 27" fill="none" stroke="${K}" stroke-width="3"/>`;
        if (b === 1) body += `<path d="M${x + 7} ${y0 - 34} c2 10 14 12 9 27" fill="none" stroke="${K}" stroke-width="3"/>`;
      }
      if (dot) body += `<circle cx="${x + (e.rest ? 14 : 17)}" cy="${ksY(7)}" r="3.4" fill="${K}"/>`;
      x += 28 + Math.min(44, e.u * 4) + (dot ? 8 : 0);
    });
    const W = x + 14;
    return `<div class="ksbox rbox"><svg viewBox="0 30 ${W + 6} 172" role="img" aria-label="A bar of rhythm">${lines.replace(/x2="W"/g, `x2="${W}"`)}<line x1="6" x2="6" y1="${ksY(10)}" y2="${ksY(2)}" stroke="#1d2433" stroke-width="1.6"/><line x1="${W}" x2="${W}" y1="${ksY(10)}" y2="${ksY(2)}" stroke="#1d2433" stroke-width="2.4"/>${body}</svg></div>`;
  }
  const rEnc = (u, rest) => u * 2 + (rest ? 1 : 0);
  // beat-sized pieces in sixteenths; a bar is filled beat by beat so it always reads cleanly
  const CHUNKS = { warmup: [[4], [4], [8]], challenge: [[4], [2, 2], [8], [6, 2], [12], [4]], brutal: [[4], [2, 2], [1, 1, 2], [3, 1], [2, 1, 1], [1, 1, 1, 1], [6, 2], [8], [2, 4, 2]] };
  function fillBar(units, d, rests) {
    const out = []; let left = units, guard = 0;
    while (left > 0 && guard++ < 50) {
      const ok = CHUNKS[d].filter(c => c.reduce((a, b) => a + b, 0) <= left && (left % 4 === 0 || c.reduce((a, b) => a + b, 0) <= left));
      let c = rnd(ok.length ? ok : [[left >= 4 ? 4 : left >= 2 ? 2 : 1]]); if (c.reduce((a, b) => a + b, 0) > left) c = [left >= 4 ? 4 : left >= 2 ? 2 : 1];
      c.forEach(u => out.push({ u, rest: rests && (u === 4 || u === 2) && Math.random() < .18 })); left -= c.reduce((a, b) => a + b, 0);
    }
    return out;
  }
  const TS_UNITS = { '2/4': 8, '3/4': 12, '4/4': 16, '5/4': 20, '3/8': 6, '6/8': 12, '9/8': 18, '12/8': 24, '5/8': 10, '7/8': 14 };
  const beatsTxt = u => { const b = u / 4; return (b === .25 ? '¼' : b === .5 ? '½' : b === .75 ? '¾' : b === 1.5 ? '1½' : String(b)) + (b > 1 ? ' beats' : ' beat'); };
  function tsQ(d) {   // The Big Score: which time signature fits this bar?
    const pool = d === 'warmup' ? ['2/4', '3/4', '4/4'] : d === 'challenge' ? ['2/4', '3/4', '4/4', '6/8'] : ['3/4', '4/4', '5/4', '6/8', '9/8', '7/8', '5/8'];
    const right = rnd(pool), T = TS_UNITS[right]; let bar = fillBar(T, d, d !== 'warmup');
    for (let k = 0; k < 30 && bar.length > 12; k++) bar = fillBar(T, d, d !== 'warmup');   // keep the bar readable (12 notes at most)
    if (bar.length > 12) bar = fillBar(T, 'challenge', true);
    const noDot = bar.reduce((a, e) => a + baseOf(e.u)[0], 0), noRest = bar.reduce((a, e) => a + (e.rest ? 0 : e.u), 0);
    const all = Object.keys(TS_UNITS).filter(t => TS_UNITS[t] !== T);
    const why = t => TS_UNITS[t] === noDot && noDot !== T ? 'That total leaves out the dots: a dot adds half the note.' : TS_UNITS[t] === noRest && noRest !== T ? 'That total skips the rests: rests count too.' : 'Add up every note and rest: this bar has ' + beatsTxt(T).replace('beats', 'quarter-note beats') + '.';
    const near = all.sort((a, b) => Math.abs(TS_UNITS[a] - T) - Math.abs(TS_UNITS[b] - T)).filter((t, i, l) => l.findIndex(x => TS_UNITS[x] === TS_UNITS[t]) === i);
    const pick = [...all.filter(t => TS_UNITS[t] === noDot || TS_UNITS[t] === noRest), ...near].filter((t, i, l) => l.indexOf(t) === i && (d === 'brutal' || pool.includes(t) || ['2/4', '3/4', '4/4', '5/4'].includes(t)));
    return mcq('Which time signature fits this bar?', right, pick.map(t => [t, why(t)]), { skills: ['time', 'rhythm'], ks: null, gen_r: bar.map(e => rEnc(e.u, e.rest)), gen_t: '' });
  }
  const NAMES = { 16: 'Whole', 12: 'Dotted half', 8: 'Half', 6: 'Dotted quarter', 4: 'Quarter', 3: 'Dotted eighth', 2: 'Eighth', 1: 'Sixteenth' };
  function valueQ(d) {   // Rooftop Runner: name it (warm-up), how many beats (challenge), is the bar complete (brutal)
    if (d === 'warmup') {
      const rest = Math.random() < .3, u = rnd(rest ? [16, 8, 4, 2] : [16, 8, 4, 2]), kind = rest ? ' rest' : ' note', right = NAMES[u] + kind;
      const WHY = { 16: rest ? 'A whole rest hangs DOWN from a line.' : 'A whole note is hollow with no stem.', 8: rest ? 'A half rest sits UP on a line.' : 'A half note is hollow WITH a stem.', 4: rest ? 'A quarter rest is the zigzag.' : 'A quarter note is filled in with a stem.', 2: rest ? 'An eighth rest has one little flag.' : 'An eighth note has one flag.' };
      return mcq(`What is this ${rest ? 'rest' : 'note'} called?`, right, [16, 8, 4, 2].filter(x => x !== u).map(x => [NAMES[x] + kind, WHY[x]]), { skills: ['rhythm'], ks: null, gen_r: [rEnc(u, rest)], gen_t: '' });
    }
    if (d === 'challenge') {
      const u = rnd([16, 12, 8, 6, 4, 3, 2]), rest = !NGLYPH[u] ? false : Math.random() < .25, right = beatsTxt(u), [b, dot] = baseOf(u);
      const w = [[beatsTxt(b), dot ? 'That leaves out the dot: a dot adds half the note.' : ''], [beatsTxt(u * 2), 'Twice too long: count the note value again.'], [beatsTxt(u / 2), 'Half too short: count the note value again.'], [beatsTxt(u + (u >= 4 ? 4 : 2)), 'Too long: count it again.'], [beatsTxt(Math.max(1, u - 2)), 'Too short: count it again.'], ...[16, 12, 8, 6, 4, 2].filter(x => x !== u).map(x => [beatsTxt(x), 'Count the note value again: a dot adds half.'])];
      return mcq(`In 4/4, how many beats does this ${rest ? 'rest' : 'note'} get?`, right, w.filter(x => x[1]), { skills: ['rhythm'], ks: null, gen_r: [rEnc(u, rest)], gen_t: '4/4' });
    }
    const ts = rnd(['3/4', '4/4', '2/4']), T = TS_UNITS[ts], off = rnd([0, 0, -1, -2, -4, 2, 1]), bar = fillBar(T + off, 'brutal', true);
    const LABEL = { 0: 'Complete', '-1': 'A sixteenth short', '-2': 'Half a beat short', '-4': 'One beat short', 2: 'Half a beat too many', 1: 'A sixteenth too many', 4: 'One beat too many' };
    const total = bar.reduce((a, e) => a + e.u, 0), real = total - T, right = LABEL[real] || 'Complete';
    return mcq(`This bar is in ${ts}. Is it complete?`, right, Object.keys(LABEL).filter(k => +k !== real).sort((a, b) => Math.abs(a - real) - Math.abs(b - real)).map(k => [LABEL[k], 'Count again: a dot adds half, rests count, and a dotted eighth + sixteenth = 1 beat.']), { skills: ['rhythm', 'time'], ks: null, gen_r: bar.map(e => rEnc(e.u, e.rest)), gen_t: ts });
  }
  const IV = [['Unison', 0], ['Minor 2nd', 1], ['Major 2nd', 2], ['Minor 3rd', 3], ['Major 3rd', 4], ['Perfect 4th', 5], ['Tritone', 6], ['Perfect 5th', 7], ['Minor 6th', 8], ['Major 6th', 9], ['Minor 7th', 10], ['Major 7th', 11], ['Octave', 12]];
  const ivBy = s => IV.find(x => x[1] === s)[0];
  const IV_WHY = s => ({ 6: 'The tritone is the tense one, right between a 4th and a 5th.', 7: 'A 5th sounds open and hollow, like a power chord.', 5: 'A 4th is the start of "Here Comes the Bride".', 12: 'An octave sounds like the same note, higher.' })[s] || 'One half step makes the difference: sing it back before you answer.';
  // range (musictheory.net style): where the notes sit. low C3-C4, mid C3-C5, high C4-C6 (MIDI 48-60, 48-72, 60-84)
  const RANGES = { low: [48, 60], mid: [48, 72], high: [60, 84] };
  const RANGE_OPTS = [['mid', 'Middle (C3–C5)'], ['low', 'Low (C3–C4)'], ['high', 'High (C4–C6)']];
  const rootIn = span => { const [lo, hi] = RANGES[OPT.range] || RANGES.mid; return lo + Math.floor(Math.random() * Math.max(1, hi - lo - span + 1)); };
  function earQ(d) {
    const how = OPT.play && OPT.play !== 'mix' ? OPT.play : d === 'brutal' ? rnd(['down', 'together', 'up']) : 'up';
    const sel = (OPT.ivs || []).map(Number).filter(x => x >= 0 && x <= 12);   // the teacher's chosen intervals (none = the difficulty's set)
    const pool = sel.length ? sel : d === 'warmup' ? [2, 4, 7, 12] : d === 'challenge' ? [1, 2, 3, 4, 5, 7, 8, 9, 10, 11, 12] : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
    const s = rnd(pool), root = rootIn(s), right = ivBy(s);
    const near = [s - 1, s + 1, s === 6 ? 5 : s === 5 ? 6 : s === 8 ? 9 : s === 9 ? 8 : s + 2, s - 2, s + 3, s - 3].filter(x => x >= 0 && x <= 12);
    const wr = sel.length > 1 ? shuffle(sel.filter(x => x !== s)) : d === 'warmup' && !sel.length ? pool.filter(x => x !== s) : near;
    return mcq(`Which interval do you hear? (${HOW[how]})`, right, wr.map(x => [ivBy(x), Math.abs(x - s) === 1 ? 'One half step away: ' + IV_WHY(x) : IV_WHY(x)]),
      { skills: ['intervals', 'ear'], ks: null, gen_m: [root, root + s], gen_p: how });
  }
  const TRI = { Major: [0, 4, 7], Minor: [0, 3, 7], Diminished: [0, 3, 6], Augmented: [0, 4, 8] };
  const SEV = { 'Major 7th': [0, 4, 7, 11], 'Dominant 7th': [0, 4, 7, 10], 'Minor 7th': [0, 3, 7, 10], 'Half-diminished 7th': [0, 3, 6, 10], 'Diminished 7th': [0, 3, 6, 9], 'Minor-major 7th': [0, 3, 7, 11] };
  const CH_WHY = { Major: 'Major sounds bright and settled.', Minor: 'Minor sounds darker: its middle note is a half step lower.', Diminished: 'Diminished sounds tense and small: two minor 3rds stacked.', Augmented: 'Augmented sounds stretched and dreamy: two major 3rds stacked.',
    'Major 7th': 'Major 7th sounds soft and jazzy (the top note is a half step under the octave).', 'Dominant 7th': 'Dominant 7th sounds like it wants to move on (bluesy).', 'Minor 7th': 'Minor 7th sounds mellow and dark.', 'Half-diminished 7th': 'Half-diminished sounds tense but softer than diminished.', 'Diminished 7th': 'Diminished 7th is the spooky one: every note is a minor 3rd apart.', 'Minor-major 7th': 'Minor-major 7th is the spy-movie sound: a minor chord with a major 7th on top.' };
  const ROOTS = [['C', 'C'], ['C#', 'C♯'], ['D', 'D'], ['Eb', 'E♭'], ['E', 'E'], ['F', 'F'], ['F#', 'F♯'], ['G', 'G'], ['Ab', 'A♭'], ['A', 'A'], ['Bb', 'B♭'], ['B', 'B']];
  function chordQ(d) {
    // Customize: chords = the teacher's chosen chords (1 = always that one; 2+ = only those, and only those as choices),
    // root = its starting note, inv = root position or inversions too, range = where it sits (musictheory.net style)
    const ALL = { ...TRI, ...SEV }, sel = (OPT.chords || []).filter(n => ALL[n]), t = OPT.type, pickC = sel.length === 1 ? sel[0] : '';
    let names, right, seventh;
    if (sel.length > 1) { right = rnd(sel); names = sel; seventh = !!SEV[right]; }
    else {
      seventh = pickC ? !!SEV[pickC] : t === 'seventh' || (t !== 'triad' && d === 'brutal' && Math.random() < .7);
      const set = seventh ? SEV : d === 'warmup' && (!pickC || pickC === 'Major' || pickC === 'Minor') ? { Major: TRI.Major, Minor: TRI.Minor } : TRI;
      names = Object.keys(set); right = pickC || rnd(names);
    }
    let notes = ALL[right].slice();
    const inv = OPT.inv === 'any' ? Math.floor(Math.random() * notes.length) : 0;
    for (let k = 0; k < inv; k++) notes.push(notes.shift() + 12);   // an inversion: the bottom notes move up an octave
    const ri = ROOTS.findIndex(r => r[0] === OPT.root), [lo, hi] = RANGES[OPT.range] || RANGES.mid, span = notes[notes.length - 1];
    let root = rootIn(span);
    if (ri >= 0) { root = lo + ((ri - lo) % 12 + 12) % 12; if (root + span > hi + 12) root -= 12; }
    const wrong = sel.length > 1 ? shuffle(sel.filter(n => n !== right)) : shuffle(names.filter(n => n !== right)).concat(shuffle(Object.keys(seventh ? SEV : TRI)).filter(n => n !== right));
    return mcq(`What kind of chord do you hear?${inv ? ' (it may be inverted)' : ''}`, right, wrong.map(n => [n, CH_WHY[n]]),
      { skills: ['chords', 'ear'], ks: null, gen_m: notes.map(x => root + x), gen_p: OPT.play && OPT.play !== 'mix' ? OPT.play : d === 'warmup' || seventh ? 'chord' : rnd(['chord', 'together']) });
  }
  const tClef = d => OPT.clef !== 'any' ? OPT.clef : d === 'warmup' ? 'treble' : d === 'challenge' ? rnd(['treble', 'bass']) : rnd(['treble', 'bass', 'alto']);
  // a staff position (dp) range for each difficulty: warm-up on the staff, challenge 1-2 ledger lines, brutal 3+ ledger lines
  function tPos(d) {
    if (d === 'warmup') return 2 + Math.floor(Math.random() * 9);
    if (d === 'challenge') return rnd([-2, -1, 0, 1, 11, 12, 13, 14].concat([2, 3, 4, 5, 6, 7, 8, 9, 10]));
    return rnd([-6, -5, -4, -3, 15, 16, 17, 18]);
  }
  // The teacher picks the note (2026-11-19, David): OPT.nl = letter 0-6 (C-B), OPT.na = accidental -2..2 (𝄫 ♭ ♮ ♯ 𝄪), OPT.where = staff | below | above.
  // Wrong choices stay close: same letter with the next accidental, one line/space up and down, the same sound with another letter, the other clef's name.
  const pickedNote = () => OPT.nl !== 'any' || OPT.na !== 'any' || OPT.where !== 'any';
  function pickNoteQ(d) {
    const clef = OPT.clef !== 'any' ? OPT.clef : 'treble', sh = CLEF_SHIFT[clef];
    const acc = OPT.na !== 'any' ? Number(OPT.na) : rnd([0, 0, 1, -1, 2, -2]);
    const span = { staff: [2, 10], below: [-5, 1], above: [11, 17] }[OPT.where] || [-3, 15];
    const dps = []; for (let dp = span[0]; dp <= span[1]; dp++) if (OPT.nl === 'any' || ((dp - sh) % 7 + 7) % 7 === Number(OPT.nl)) dps.push(dp);
    const p = rnd(dps.length ? dps : [6]) - sh, right = noteName(p, acc);
    const toward = acc > 0 ? acc - 1 : acc < 0 ? acc + 1 : rnd([1, -1]);   // the same letter, one accidental closer to natural (a natural gets a sharp or flat)
    const enhP = p + (acc > 0 ? 1 : -1), enhA = pitch(p, acc) - pitch(enhP, 0);   // the same sound spelled with the next letter
    const other = clef === 'treble' ? 'bass' : 'treble', misread = noteName(p + sh - CLEF_SHIFT[other], acc);
    const AW = a => a >= 2 ? 'double sharp' : a <= -2 ? 'double flat' : a > 0 ? 'sharp' : a < 0 ? 'flat' : 'natural';
    const wrong = [[noteName(p, toward), `Right letter, but look again: it has a ${AW(acc)}${acc ? '' : ' (no sharp or flat)'}.`],
      [noteName(p + 1, acc), 'One step too high: check line or space.'], [noteName(p - 1, acc), 'One step too low: check line or space.'],
      [acc && Math.abs(enhA) <= 2 ? noteName(enhP, enhA) : '', 'Same sound, but the letter name is wrong: read the note head first.'],
      [misread, `That is the name in ${other} clef. This is ${KS_CLEFS[clef].name.toLowerCase()} clef.`], [noteName(p + 2, acc), 'Off by a line (or a space).']];
    const w = { 1: 2, '-1': 3, 2: 4, '-2': 5 }[acc] || 0;
    return mcq('Which note is this?', right, d === 'warmup' ? [wrong[1], wrong[2], wrong[0], wrong[3]] : Math.abs(acc) === 2 ? [wrong[0], wrong[3], wrong[1], wrong[2], wrong[4]] : wrong, { skills: ['notes'], clef, ks: null, gen_n: [w ? encW(p, w) : enc(p, 0)] });
  }
  function noteQ(d) {
    if (pickedNote()) return pickNoteQ(d);
    const clef = tClef(d), sh = CLEF_SHIFT[clef], p = tPos(d) - sh, acc = d === 'brutal' && Math.random() < .5 ? rnd([-1, 1]) : 0, right = noteName(p, acc);
    const other = clef === 'treble' ? 'bass' : 'treble', misread = noteName(p + sh - CLEF_SHIFT[other], acc);
    return mcq('Which note is this?', right, [[noteName(p + 1, acc), 'One step too high: check line or space.'], [noteName(p - 1, acc), 'One step too low: check line or space.'],
      [misread, `That is the name in ${other} clef. This is ${KS_CLEFS[clef].name.toLowerCase()} clef.`], [noteName(p + 2, acc), 'Off by a line (or a space): count again from a note you know.'],
      [acc ? noteName(p, 0) : '', 'Right letter, but look at the ' + (acc > 0 ? 'sharp.' : 'flat.')]], { skills: ['notes'], clef, ks: null, gen_n: [enc(p, acc)] });
  }
  const NUMS = ['', 'unison', '2nd', '3rd', '4th', '5th', '6th', '7th', 'octave'];
  const PERFECT = { 1: 0, 4: 5, 5: 7, 8: 12 }, MAJOR = { 2: 2, 3: 4, 6: 9, 7: 11 };
  function quality(num, semis) {
    if (PERFECT[num] != null) { const d = semis - PERFECT[num]; return d === 0 ? 'Perfect' : d === 1 ? 'Augmented' : d === -1 ? 'Diminished' : null; }
    const d = semis - MAJOR[num]; return d === 0 ? 'Major' : d === -1 ? 'Minor' : d === 1 ? 'Augmented' : d === -2 ? 'Diminished' : null;
  }
  const ivName = (q, num) => q + ' ' + NUMS[num];
  // Brutal intervals (2026-11-18): a key signature (2-7 sharps or flats) plus written naturals, sharps, flats, double sharps and double flats.
  // Every question has at least one note the key signature changes or a natural that cancels it, so reading the key signature matters.
  // Wrong choices: the answer you get if you forget the key signature, the one if you miss the natural, then other qualities and same-sound names.
  function doomQ(clef) {
    const sh = CLEF_SHIFT[clef];
    for (let tries = 0; tries < 400; tries++) {
      const ks = rnd([2, 3, 4, 5, 6, 7, -2, -3, -4, -5, -6, -7]), num = 2 + Math.floor(Math.random() * 7);
      const lowDp = -1 + Math.floor(Math.random() * (14 - num)), p1 = lowDp - sh, p2 = p1 + num - 1;
      const pickW = p => { const k = keyAcc(p, ks), r = Math.random(); if (r < .45) return 0; const c = [1, 2, 3, 4, 5].filter(w => W_ACC[w] !== k && (w < 4 || r > .8)); return rnd(c); };
      const w1 = pickW(p1), w2 = pickW(p2);
      const matters = [[p1, w1], [p2, w2]].some(([p, w]) => (w === 0 && keyAcc(p, ks) !== 0) || (w === 1 && keyAcc(p, ks) !== 0));
      if (!matters) continue;
      const a1 = realAcc(p1, w1, ks), a2 = realAcc(p2, w2, ks), semis = pitch(p2, a2) - pitch(p1, a1), q = quality(num, semis);
      if (!q) continue;
      const right = ivName(q, num), wrongs = [];
      const qNoKs = quality(num, pitch(p2, w2 ? W_ACC[w2] : 0) - pitch(p1, w1 ? W_ACC[w1] : 0));   // read without the key signature
      if (qNoKs && qNoKs !== q) wrongs.push([ivName(qNoKs, num), 'That is what you get without the key signature (' + ksCount(ks).toLowerCase() + '). It changes every note it names.']);
      const qNoNat = quality(num, pitch(p2, w2 === 1 ? keyAcc(p2, ks) : a2) - pitch(p1, w1 === 1 ? keyAcc(p1, ks) : a1));   // missed a natural
      if ((w1 === 1 || w2 === 1) && qNoNat && qNoNat !== q) wrongs.push([ivName(qNoNat, num), 'The natural sign cancels the key signature for that note.']);
      const others = PERFECT[num] != null ? ['Perfect', 'Augmented', 'Diminished'] : ['Major', 'Minor', 'Augmented', 'Diminished'];
      shuffle(others.filter(x => x !== q)).forEach(x => wrongs.push([ivName(x, num), 'Right number, wrong quality: apply the key signature, then count the half steps (' + semis + ').']));
      for (const n2 of [num - 1, num + 1]) { if (n2 < 2 || n2 > 8) continue; const q2 = quality(n2, semis); if (q2) wrongs.push([ivName(q2, n2), 'It sounds the same, but count the letter names: this is a ' + NUMS[num] + '.']); }
      [num - 1, num + 1].filter(x => x >= 2 && x <= 8).forEach(x => wrongs.push([ivName(PERFECT[x] != null ? 'Perfect' : 'Major', x), 'Count the letter names again: this is a ' + NUMS[num] + '.']));
      return mcq('What interval is this? (mind the key signature)', right, wrongs, { skills: ['intervals'], clef, ks, gen_n: [encW(p1, w1), encW(p2, w2)] });
    }
    return null;
  }
  function intervalQ(d) {
    const clef = tClef(d), sh = CLEF_SHIFT[clef];
    if (d === 'brutal') { const q = doomQ(clef); if (q) return q; }
    for (let tries = 0; tries < 200; tries++) {
      const num = d === 'warmup' ? 2 + Math.floor(Math.random() * 4) : 2 + Math.floor(Math.random() * 7);
      const lowDp = d === 'warmup' ? 2 + Math.floor(Math.random() * (9 - num)) : d === 'challenge' ? -1 + Math.floor(Math.random() * (14 - num)) : -4 + Math.floor(Math.random() * (20 - num));
      const p1 = lowDp - sh, p2 = p1 + num - 1;
      if (d === 'warmup') {   // number only: count letter names
        const near = [num + 1, num - 1, num + 2, num - 2, num + 3, num - 3].filter(x => x >= 2 && x <= 8);
        return mcq('What interval is this? (count the letter names)', NUMS[num], near.map(x => [NUMS[x], Math.abs(x - num) === 1 ? 'Off by one: count both notes, the bottom one is 1.' : 'Count every line AND space, both notes included.']), { skills: ['intervals'], clef, ks: null, gen_n: [enc(p1, 0), enc(p2, 0)] });
      }
      if (d === 'challenge') {
        const accidentals = shuffle([[0, 0], [0, 0], [-1, 0], [1, 0], [0, -1], [0, 1]]);
        for (const [a1, a2] of accidentals) {
          const semis = pitch(p2, a2) - pitch(p1, a1), q = quality(num, semis);
          if (!['Major', 'Minor', 'Perfect'].includes(q)) continue;
          const sameSize = q === 'Major' ? 'Minor' : q === 'Minor' ? 'Major' : num === 5 ? 'Diminished' : 'Augmented';
          const near = [num - 1, num + 1, num - 2, num + 2].filter(n => n >= 2 && n <= 8);
          return mcq('What interval is this? (name it fully)', ivName(q, num), [
            [ivName(sameSize, num), 'Right number, wrong quality: count the half steps (' + semis + ').'],
            ...near.map(n => [ivName(PERFECT[n] != null ? 'Perfect' : rnd(['Major', 'Minor']), n), 'Count the letter names again: this is a ' + NUMS[num] + '.']),
          ], { skills: ['intervals'], clef, ks: null, gen_n: [enc(p1, a1), enc(p2, a2)] });
        }
        continue;
      }
      const a1 = rnd([-1, 0, 0, 1]), a2 = rnd([-1, 0, 0, 1]), semis = pitch(p2, a2) - pitch(p1, a1), q = quality(num, semis);
      if (!q || (q !== 'Augmented' && q !== 'Diminished' && Math.random() < .4)) continue;   // brutal leans on augmented and diminished
      const right = ivName(q, num), others = PERFECT[num] != null ? ['Perfect', 'Augmented', 'Diminished'] : ['Major', 'Minor', 'Augmented', 'Diminished'];
      const enh = [];   // same sound, different number (an enharmonic spelling)
      for (const n2 of [num - 1, num + 1]) { if (n2 < 2 || n2 > 8) continue; for (const q2 of ['Perfect', 'Major', 'Minor', 'Augmented', 'Diminished']) { const base = PERFECT[n2] != null ? PERFECT[n2] : MAJOR[n2]; const ok = quality(n2, semis); if (ok === q2) enh.push(ivName(q2, n2)); } }
      return mcq('What interval is this? (name it fully)', right, [
        ...shuffle(others.filter(x => x !== q)).map(x => [ivName(x, num), 'Right number, wrong quality: count the half steps (' + semis + ').']),
        ...enh.map(x => [x, 'It sounds the same, but count the letter names: this is a ' + NUMS[num] + '.'])].sort(() => Math.random() - .5)
          .concat([num - 1, num + 1].filter(x => x >= 2 && x <= 8).map(x => [ivName(PERFECT[x] != null ? 'Perfect' : 'Major', x), 'Count the letter names again: this is a ' + NUMS[num] + '.'])),
        { skills: ['intervals'], clef, ks: null, gen_n: [enc(p1, a1), enc(p2, a2)] });
    }
    return noteQ(d);
  }
  // Question types for the two key tiles (2026-11-18). 'same' only works for keys that have a same-sound partner (5-7 sharps or flats).
  const KQ = [['name', 'Name the key'], ['count', 'How many ♯/♭?'], ['spell', 'Spell a note'], ['odd', 'Odd one out'], ['relative', 'Relative key'], ['same', 'Same-sound key']];
  const ENH_OF = { 5: -7, 6: -6, 7: -5, '-7': 5, '-6': 6, '-5': 7 };
  const keyCycles = new Map();
  function keyPickQ(def) {
    const picked = (OPT.keys || []).map(Number).filter(ksOk);
    const list = picked.length ? KS_ORDER.filter(n => picked.includes(n)) : KS_ORDER;
    let types = (OPT.qt || []).filter(t => KQ.some(k => k[0] === t)); if (!types.length) types = def;
    const canEnharmonic = list.some(n => ENH_OF[n] != null);
    // Share the rotation between the two key tiles, with separate rotations for previews and each class.
    const sequence = OPT.keySequence || 'preview';
    const pool = canEnharmonic && types.every(t => t === 'same') ? list.filter(n => ENH_OF[n] != null) : list;
    const poolId = pool.join(',');
    let cycle = keyCycles.get(sequence);
    if (!cycle || cycle.poolId !== poolId) {
      cycle = { poolId, left: [], last: null };
      keyCycles.set(sequence, cycle);
    }
    if (!cycle.left.length) cycle.left = shuffle(pool);
    if (types.length > 1 && !cycle.left.some(n => ENH_OF[n] != null)) types = types.filter(t => t !== 'same');
    const t = rnd(types);
    const eligible = t === 'same' && canEnharmonic ? cycle.left.filter(n => ENH_OF[n] != null) : cycle.left;
    const n = eligible.find(n => n !== cycle.last) ?? eligible[0];
    cycle.left.splice(cycle.left.indexOf(n), 1);
    cycle.last = n;
    const minor = OPT.mode === 'minor' ? true : OPT.mode === 'major' ? false : Math.random() < .5;
    const clef = OPT.clef === 'any' ? rnd(['treble', 'bass', 'alto']) : OPT.clef;
    if (t === 'count') return { ...ksQuestion(n, minor, 'count'), why: {} };
    if (t === 'spell') return spell(n, minor);
    if (t === 'odd') return oddOne(n, minor);
    if (t === 'relative') return relative(n, minor);
    if (t === 'same' && ENH_OF[n] != null) return enharmonic(n, minor);
    return ksMC(n, minor, clef);
  }
  const QGAMES = [
    // Scale Quest and Key signatures (2026-11-18, David: no levels for these two): the teacher taps the keys (none = all 15), Major / Minor / Both,
    // the clef and the question types (none = the tile's own mix). OPT.keys, OPT.mode, OPT.clef (any = mixed), OPT.qt = list of KQ ids.
    { id: 'scale', name: 'Scale Quest', what: 'Keys and scales: you pick', url: '/scale-quest/', pick: true, opts: {}, qdef: ['name', 'count', 'spell', 'odd', 'relative', 'same'], make() { return keyPickQ(this.qdef); } },
    { id: 'keysig', name: 'Key signatures', what: 'You pick the keys and the clef', url: '/scale-quest/', game: 'Scale Quest', pick: true, opts: {}, qdef: ['name', 'count'], make() { return keyPickQ(this.qdef); } },
    { id: 'tidal', name: 'Tidal Tones', what: 'Notes and intervals on the staff', url: '/tidal-tones/',
      opts: { type: [['mix', 'Mix'], ['note', 'Name the note'], ['interval', 'Name the interval']], clef: [['any', 'Any'], ['treble', '𝄞 Treble'], ['bass', '𝄢 Bass'], ['alto', '𝄡 Alto']],
        nl: [['any', 'Any']].concat(['C', 'D', 'E', 'F', 'G', 'A', 'B'].map((l, i) => [String(i), l])),
        na: [['any', 'Any'], ['0', '♮ Natural'], ['1', '♯ Sharp'], ['-1', '♭ Flat'], ['2', '𝄪 Double sharp'], ['-2', '𝄫 Double flat']],
        where: [['any', 'Any'], ['staff', 'On the staff'], ['below', 'Ledger lines below'], ['above', 'Ledger lines above']] },
      make(d) { const t = OPT.type; return pickedNote() || t === 'note' ? noteQ(d) : t === 'interval' ? intervalQ(d) : Math.random() < .55 ? noteQ(d) : intervalQ(d); } },
    { id: 'bigscore', name: 'The Big Score', what: 'Time signatures and counting', url: '/rhythm-trainer/', opts: {}, make(d) { return tsQ(d); } },
    { id: 'rooftop', name: 'Rooftop Runner', what: 'Reading rhythms', url: '/rooftop-runner/', opts: {}, make(d) { return valueQ(d); } },
    { id: 'earshot', name: 'Earshot Saloon', what: 'Intervals by ear', url: '/earshot-saloon/', sound: true,
      opts: { play: PLAY_OPTS, ivs: IV.map(([n, s]) => [s, n]), range: RANGE_OPTS }, multi: ['ivs'],
      make(d) { return earQ(d); } },
    { id: 'brainwaves', name: 'Brainwaves', what: 'Chords by ear', url: '/brainwaves/', sound: true,
      opts: { type: [['mix', 'Mix'], ['triad', 'Triads'], ['seventh', '7th chords']], play: PLAY_OPTS, chords: Object.keys(TRI).concat(Object.keys(SEV)).map(n => [n, n]), inv: [['root', 'Root position'], ['any', 'Inversions too']], root: [['any', 'Any']].concat(ROOTS), range: RANGE_OPTS }, multi: ['chords'],

      make(d) { return chordQ(d); } },
  ];
  const qgame = id => QGAMES.find(g => g.id === id) || null;
  // one question, tagged with where it came from (bc_live.gen = { g, d })
  function makeQ(g, d, o) { const G = qgame(g) || QGAMES[0], D = DIFFS[d] ? d : 'challenge'; OPT = { ...OPT_DEF, ...(o || {}) }; let q; try { q = G.make(D); } finally { OPT = OPT_DEF; }
    const { gen_n, gen_m, gen_p, gen_r, gen_t, ...rest } = q, gen = { g: G.id, d: D }; if (gen_n) gen.n = gen_n; if (gen_m) { gen.m = gen_m; gen.p = gen_p; } if (gen_r) { gen.r = gen_r; gen.t = gen_t || ''; }
    return { ...rest, skills: q.skills || ['keys'], gen }; }

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
    if (big) {   // short answers on the class screen once revealed (David, 2026-11-17): what students typed, no names, same answers grouped
      const cnt = {}, shown = {}; A.forEach(t => { const k = t.trim().toLowerCase().replace(/\s+/g, ' '); if (!k) return; cnt[k] = (cnt[k] || 0) + 1; if (!shown[k]) shown[k] = t.trim(); });
      const ok = k => correct && k === String(correct).trim().toLowerCase().replace(/\s+/g, ' ');
      return `<div class="typed">${Object.entries(cnt).sort((a, b) => b[1] - a[1]).slice(0, 30).map(([k, c]) => `<div class="typed-a${ok(k) ? ' correct' : ''}"><span>${ok(k) ? '✓ ' : ''}${esc(shown[k])}</span>${c > 1 ? `<b class="mono">×${c}</b>` : ''}</div>`).join('')}</div>`;
    }
    return `<div class="row"><span class="big">${A.length}</span><span class="muted">written answer${A.length === 1 ? '' : 's'} in.${opt.hint ? ' Spotlight one to share it with the class.' : ''}</span></div>`;
  }
  // newest answer per student, newest first
  function latest(list) {
    const by = {}; list.forEach(a => { if (!by[a.sid] || (a.at || 0) > (by[a.sid].at || 0)) by[a.sid] = a; });
    return Object.values(by).sort((a, b) => (b.at || 0) - (a.at || 0));
  }
  const left = live => live && live.open && live.ends_at ? Math.max(0, Math.ceil((live.ends_at - Date.now()) / 1000)) : null;
  // Showdown game-show mode (2026-11-18): bc_live.show = { st: lobby | play | done, n: questions in the game, i: this one, at: when answers open
  // (ms, the teacher's clock; the 3-2-1 runs until then), who: the waiting room [{ n: name, s: sid }] }. cdNum = the 3-2-1 number now (0 = go).
  const cdNum = L => L && L.show && L.show.at && L.open ? Math.max(0, Math.ceil((L.show.at - Date.now()) / 1000)) : 0;
  // every player's place in a Showdown (2026-11-18): bc_live.places = { <hid(sid)>: place }; hid = a short hash, so ids are not shown
  const hid = s => { let h = 5381; for (const ch of String(s || '')) h = (h * 33 + ch.charCodeAt(0)) >>> 0; return 'p' + h.toString(36); };
  const isLobby = L => !!(L && L.show && L.show.st === 'lobby');
  const clock = s => s == null ? '' : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  const ERR = e => { const c = String(e && (e.code || e.message) || e); return /permission/i.test(c) ? 'Live Class is not switched on yet (the new database rules are not in place).' : /offline|unavailable|timeout/i.test(c) ? 'No connection. Check the wifi and try again.' : 'Something went wrong: ' + c; };

  return { hid, cdNum, isLobby, KQ, play, audio, unlocked, isSound, staffFor, noteStaff, OPT_DEF, DIFFS, QGAMES, qgame, makeQ, keyNotes, KS_ORDER, KS_CLEFS, clefOk, ksOk, ksName, ksCount, ksStaff, ksQuestion, PREVIEW, Q, esc, TYPES, EMOJIS, REACTS, BANK, NOW, at, newKey, roundId, flagged, db, fbAuth, results, latest, left, clock, ERR };
})();
