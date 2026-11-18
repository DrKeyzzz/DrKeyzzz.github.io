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
    treble: `<text x="16" y="${170 - 2 * 10 + 13}" font-size="86" fill="#1d2433" style="font-family:'Noto Music','Apple Symbols','Segoe UI Symbol',serif">𝄞</text>`,
    bass: `<text x="14" y="${170 - 2 * 10 - 3}" font-size="76" fill="#1d2433" style="font-family:'Noto Music','Apple Symbols','Segoe UI Symbol',serif">𝄢</text>`,
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
  const OPT_DEF = { clef: 'any', acc: 'both', mode: 'both', type: 'mix', timer: 30 };
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
  function relative(n) {   // both ways: relative minor of a major key, or relative major of a minor key
    if (Math.random() < .5) {
      const maj = KS_MAJ[n], right = KS_MIN[n] + ' minor', N = keyNotes(n, false);
      return mcq(`What is the relative minor of ${maj} major?`, right, [[maj + ' minor', 'That is the parallel minor (same starting note, different key signature).'],
        [N[2] + ' minor', 'The relative minor starts on the 6th note, not the 3rd.'], [ksOk(n + 1) ? KS_MIN[n + 1] + ' minor' : '', 'Off by one key.'], [ksOk(n - 1) ? KS_MIN[n - 1] + ' minor' : '', 'Off by one key.'], [ksOk(n + 2) ? KS_MIN[n + 2] + ' minor' : KS_MIN[n - 2] + ' minor', 'Off by two keys.']]);
    }
    const mi = KS_MIN[n], right = KS_MAJ[n] + ' major', N = keyNotes(n, true);
    return mcq(`What is the relative major of ${mi} minor?`, right, [[mi + ' major', 'That is the parallel major (same starting note, different key signature).'],
      [N[5] + ' major', 'The relative major starts on the 3rd note of the minor key, not the 6th.'], [ksOk(n + 1) ? KS_MAJ[n + 1] + ' major' : '', 'Off by one key.'], [ksOk(n - 1) ? KS_MAJ[n - 1] + ' major' : '', 'Off by one key.'], [ksOk(n + 2) ? KS_MAJ[n + 2] + ' major' : KS_MAJ[n - 2] + ' major', 'Off by two keys.']]);
  }
  function enharmonic() {   // B = C♭, F♯ = G♭, C♯ = D♭ (and their relative minors)
    const pairs = [[5, -7], [6, -6], [7, -5], [-7, 5], [-6, 6], [-5, 7]].filter(([, b]) => accOk(b)), [a, b] = rnd(pairs), minor = isMinor(.4);
    const from = ksName(a, minor), right = ksName(b, minor), with_ = b < 0 ? 'flats' : 'sharps';
    return mcq(`Which key sounds the same as ${from} but is written with ${with_}?`, right,
      [[ksOk(b + 1) ? ksName(b + 1, minor) : '', 'A different key: one accidental off.'], [ksOk(b - 1) ? ksName(b - 1, minor) : '', 'A different key: one accidental off.'],
       [from[0] + ' ' + (minor ? 'minor' : 'major'), 'Same letter, but the natural key does not sound the same.'], [ksName(-a, minor), 'Same number of accidentals, but that is a different key.']]);
  }
  function oddOne(n) {   // "Which note is NOT in B major?"
    const N = keyNotes(n, false), key = ksName(n, false), accd = N.filter(x => x.length > 1), base = rnd(accd.length ? accd : N);
    const trap = Math.random() < .5 && ENH[base] ? ENH[base] : flipAcc(base);
    const ins = shuffle(N.filter(x => x !== base)).slice(0, 3);
    return { ...mcq(`Which note is NOT in ${key}?`, trap, ins.map(x => [x, x + ' is in ' + key + '.'])), why: Object.fromEntries(ins.map(x => [x, x + ' is in ' + key + ': check every note against the key signature.'])) };
  }
  const QGAMES = [
    { id: 'scale', name: 'Scale Quest', what: 'Key signatures and scales', url: '/scale-quest/', 
      // the choices Customize offers for this game, first = default
      opts: { type: [['mix', 'Mix'], ['name', 'Name the key'], ['spell', 'Spell a note'], ['count', 'How many?'], ['relative', 'Relative & same-sound keys'], ['odd', 'Odd one out']],
        clef: [['any', 'Any'], ['treble', '𝄞 Treble'], ['bass', '𝄢 Bass'], ['alto', '𝄡 Alto']], acc: [['both', 'Both'], ['sharps', '♯ Sharps'], ['flats', '♭ Flats']],
        mode: [['both', 'Both'], ['major', 'Major'], ['minor', 'Minor']] },
      make(d) {
      const [lo, hi] = d === 'warmup' ? [0, 3] : d === 'challenge' ? [0, 7] : [3, 7], t = OPT.type;
      const nameQ = () => { const m = isMinor(d === 'warmup' ? 0 : d === 'challenge' ? .35 : .7); return ksMC(nOf(m && d === 'brutal' ? 4 : lo, hi), m, anyClef(d === 'warmup' ? 'treble' : null), m && d === 'brutal' ? 'This key signature is for which MINOR key?' : null); };
      const spellQ = () => spell(nOf(lo, Math.min(hi, d === 'challenge' ? 5 : 7)), isMinor(d === 'brutal' ? .5 : d === 'challenge' ? .2 : 0));
      const countQ = () => ({ ...ksQuestion(nOf(Math.max(1, lo), hi), isMinor(d === 'warmup' ? 0 : .35), 'count'), why: {} });
      const relQ = () => Math.random() < .6 || OPT.acc !== 'both' && d !== 'brutal' ? relative(nOf(Math.max(2, lo), hi)) : enharmonic();
      const oddQ = () => oddOne(nOf(Math.max(2, lo), hi));
      const by = { name: nameQ, spell: spellQ, count: countQ, relative: relQ, odd: oddQ };
      if (by[t]) return by[t]();
      if (d === 'warmup') return nameQ();
      const r = Math.random();
      if (d === 'challenge') return r < .45 ? nameQ() : r < .8 ? spellQ() : countQ();
      return r < .25 ? nameQ() : r < .5 ? relative(nOf(2, 7)) : r < .7 ? enharmonic() : r < .85 ? oddQ() : spellQ();
    } },
  ];
  const qgame = id => QGAMES.find(g => g.id === id) || null;
  // one question, tagged with where it came from (bc_live.gen = { g, d })
  function makeQ(g, d, o) { const G = qgame(g) || QGAMES[0], D = DIFFS[d] ? d : 'challenge'; OPT = { ...OPT_DEF, ...(o || {}) }; let q; try { q = G.make(D); } finally { OPT = OPT_DEF; } return { ...q, skills: q.skills || ['keys'], gen: { g: G.id, d: D } }; }

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
  const clock = s => s == null ? '' : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  const ERR = e => { const c = String(e && (e.code || e.message) || e); return /permission/i.test(c) ? 'Live Class is not switched on yet (the new database rules are not in place).' : /offline|unavailable|timeout/i.test(c) ? 'No connection. Check the wifi and try again.' : 'Something went wrong: ' + c; };

  return { OPT_DEF, DIFFS, QGAMES, qgame, makeQ, keyNotes, KS_ORDER, KS_CLEFS, clefOk, ksOk, ksName, ksCount, ksStaff, ksQuestion, PREVIEW, Q, esc, TYPES, EMOJIS, REACTS, BANK, NOW, at, newKey, roundId, flagged, db, fbAuth, results, latest, left, clock, ERR };
})();
