/* Student messages + notification bell (Message my teacher 2026-11-16; replies to feedback and the 🔔 2026-11-16)
   Specs: hub/docs/student-messages-spec.md, hub/docs/notifications-spec.md. Loaded by the home page and My Report (hub), and by
   every game through the MTG_BELL snippet (shared/mtg-bell.snippet.html).
   - Home / My Report put <span id="mtg-msg-slot" data-btn="ghost|pill" data-popup="1"></span>: the 🔔, "💬 Message my teacher"
     (only when the class has messages on) and, once per new reply, a pop-up card. Games have no slot: the 🔔 goes beside the
     .mtg-home pills and there is no pop-up, so a run is never interrupted.
   - Conversations: with the teacher, sm_threads/<device key>_<class code>; with Music Theory Academy (replies to feedback),
     fb_threads/<device key> and, for older notes, fb_threads/<class code>_<sid>. The device key is the random 20-character key
     Live Class keeps in localStorage mtg_bc_v1:<sid>. Rules: shared/firestore.rules.
   - Reads: the class doc + those 3 thread docs once per 2 minutes (localStorage cache, shared by every tab and game), messages
     only when the box opens. Nothing listens.
   - ?msgpreview=1: sample conversations in memory, nothing sent.
*/
(function () {
var cssDone = false, lastSig = '';
var PREVIEW = /[?&]msgpreview=1/.test(location.search);
var CFG = { apiKey: 'AIzaSyDU9vbCWJ4yWuD8bAX984DmQF4dvo13BHs', authDomain: 'rhythm-trainer-fc313.firebaseapp.com', projectId: 'rhythm-trainer-fc313', appId: '1:956677028482:web:c3ec72a279e61b6f6c929b' };
var SDK = 'https://www.gstatic.com/firebasejs/10.12.2/';
var esc = function (v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
var ms = function (v) { return v && v.toMillis ? v.toMillis() : +v || 0; };
var fbP = null;
function fb() {
  fbP = fbP || Promise.all([import(SDK + 'firebase-app.js'), import(SDK + 'firebase-firestore.js')]).then(function (m) {
    var app; try { app = m[0].getApp('mtg-msg'); } catch (e) { app = m[0].initializeApp(CFG, 'mtg-msg'); }
    return { fs: m[1], db: m[1].getFirestore(app) };
  }).catch(function (e) { fbP = null; throw e; });
  return fbP;
}
function prof() {
  try { if (sessionStorage.getItem('music_guest') === '1') return null; } catch (e) {}
  try { var p = JSON.parse(localStorage.getItem('rdt_profile_v1') || 'null'); return p && p.first && p.init && p.classCode ? p : null; } catch (e) { return null; }
}
function css() {
  if (cssDone) return; cssDone = true;
  var el = document.createElement('style');
  el.textContent = '#mtg-msg-btn{position:relative;cursor:pointer}#mtg-msg-btn.pill{background:transparent;padding-right:16px}'
    + '.mtg-bell{position:relative;display:inline-grid;place-items:center;width:38px;height:38px;border-radius:50%;border:1px solid rgba(255,255,255,.22);background:rgba(13,20,32,.85);color:#f1ece0;font-size:18px;line-height:1;cursor:pointer;padding:0;vertical-align:middle;flex:none}'
    + '.mtg-bell:hover{border-color:#ffc85c}.mtg-bell:focus-visible{outline:2px solid #ffc85c;outline-offset:2px}'
    + '.mtg-bell .mm-n{position:absolute;top:-6px;right:-7px;min-width:21px;height:21px;padding:0 6px;border-radius:999px;background:#ff3b47;color:#fff;font:700 12px/21px system-ui,sans-serif;text-align:center;box-shadow:0 0 0 2px #0d1420;animation:mmpop 1.6s ease-in-out infinite}'
    + '@keyframes mmpop{0%,100%{transform:scale(1)}50%{transform:scale(1.15)}}@media (prefers-reduced-motion:reduce){.mtg-bell .mm-n{animation:none}}'
    + '#mtg-msg,#mtg-msg-pop{position:fixed;inset:0;z-index:9999;background:rgba(5,8,14,.6);display:flex;align-items:center;justify-content:center;padding:16px;font-family:"Josefin Sans",system-ui,sans-serif}'
    + '#mtg-msg .mm-box{width:min(460px,100%);max-height:min(640px,calc(100vh - 32px));display:flex;flex-direction:column;background:#141d2c;color:#f1ece0;border:1px solid #33445f;border-radius:18px;box-shadow:0 20px 60px rgba(0,0,0,.5)}'
    + '#mtg-msg .mm-hd{flex:none;display:flex;align-items:center;gap:10px;padding:14px 16px 10px;border-bottom:1px solid #26344b}#mtg-msg .mm-hd h2{margin:0;font-size:19px;flex:1}'
    + '#mtg-msg .mm-x{background:none;border:0;color:#9aa7bb;font-size:22px;cursor:pointer;line-height:1}#mtg-msg .mm-x:hover{color:#fff}'
    + '#mtg-msg .mm-tabs{flex:none;display:flex;gap:6px;flex-wrap:wrap;padding:10px 16px 0}#mtg-msg .mm-tab{border:1px solid #33445f;border-radius:999px;background:none;color:#f1ece0;font:700 13.5px "Josefin Sans",system-ui,sans-serif;padding:6px 12px 4px;cursor:pointer}'
    + '#mtg-msg .mm-tab[aria-pressed="true"]{background:#ffc85c;border-color:#ffc85c;color:#10131a}#mtg-msg .mm-tab i{font-style:normal;display:inline-block;margin-left:6px;background:#ff3b47;color:#fff;border-radius:999px;font-size:11px;padding:1px 6px 0}'
    + '#mtg-msg .mm-log{flex:1 1 auto;overflow-y:auto;padding:14px 16px;display:flex;flex-direction:column;gap:8px;min-height:120px}'
    + '#mtg-msg .mm-b{max-width:82%;padding:9px 12px 6px;border-radius:14px;line-height:1.35;font-size:15px;white-space:pre-wrap;overflow-wrap:anywhere}'
    + '#mtg-msg .mm-b small{display:block;color:#9aa7bb;font-size:11px;margin-top:3px}#mtg-msg .mm-me{align-self:flex-end;background:#2a3b58}#mtg-msg .mm-them{align-self:flex-start;background:#1d2a40;border:1px solid #33445f}'
    + '#mtg-msg .mm-empty{margin:auto;color:#9aa7bb;text-align:center;max-width:300px;font-size:15px}'
    + '#mtg-msg .mm-ft{flex:none;padding:10px 16px 14px;border-top:1px solid #26344b}#mtg-msg textarea{width:100%;box-sizing:border-box;min-height:56px;resize:vertical;border-radius:12px;border:1px solid #33445f;background:#0d1420;color:#f1ece0;font:500 16px/1.4 "Josefin Sans",system-ui,sans-serif;padding:9px 11px}'
    + '#mtg-msg textarea:focus{outline:2px solid #ffc85c;outline-offset:1px}#mtg-msg .mm-bar{display:flex;align-items:center;gap:10px;margin-top:8px}#mtg-msg .mm-bar small{flex:1;color:#9aa7bb;font-size:12.5px;line-height:1.3}'
    + '#mtg-msg .mm-send{border:0;border-radius:999px;background:#ffc85c;color:#10131a;font:700 15px "Josefin Sans",system-ui,sans-serif;padding:9px 18px 7px;cursor:pointer}#mtg-msg .mm-send:disabled{opacity:.5;cursor:default}'
    + '#mtg-msg .mm-err{color:#ff8a7a;font-size:13px;margin:6px 0 0}'
    + '#mtg-msg-pop .mm-card{width:min(360px,100%);background:#1a2538;color:#f1ece0;border:2px solid #ffc85c;border-radius:18px;padding:20px;text-align:center;box-shadow:0 18px 50px rgba(0,0,0,.6)}'
    + '#mtg-msg-pop .mm-big{font-size:36px}#mtg-msg-pop h2{margin:6px 0 4px;font-size:20px}#mtg-msg-pop p{margin:0 0 16px;color:#9aa7bb;font-size:15px;line-height:1.35}'
    + '#mtg-msg-pop button{border:0;border-radius:999px;font:700 15px "Josefin Sans",system-ui,sans-serif;padding:10px 18px 8px;cursor:pointer;margin:0 4px}#mtg-msg-pop .mm-go{background:#ffc85c;color:#10131a}#mtg-msg-pop .mm-later{background:none;border:1px solid #33445f;color:#f1ece0}';
  document.head.appendChild(el);
}

function boot() {
  var slot = document.getElementById('mtg-msg-slot');
  var home = slot ? null : document.querySelector('.mtg-home');   // games: the 🔔 goes beside the Music Theory Academy pills
  var p = prof();
  if (!p || (!slot && !home)) { if (slot) slot.innerHTML = ''; var ob = document.getElementById('mtg-bell-game'); if (ob) ob.remove(); lastSig = ''; return; }
  var sid = (p.first + p.init).toLowerCase().replace(/[^a-z]/g, '');
  var f = String(p.first), name = (f.charAt(0).toUpperCase() + f.slice(1) + ' ' + p.init + '.').slice(0, 24);
  var code = p.classCode, owner = p.classOwner || '';
  var LK = 'mtg_bc_v1:' + sid, me = null;
  try { me = JSON.parse(localStorage.getItem(LK) || 'null'); } catch (e) {}
  if (!me || !/^[a-z0-9]{20}$/.test(me.key)) {
    var a = 'abcdefghijklmnopqrstuvwxyz0123456789', s = '', r = crypto.getRandomValues(new Uint8Array(20));
    r.forEach(function (x) { s += a[x % 36]; });
    me = { key: s, lost: false, conf: 3, hist: [], react: null };
    try { localStorage.setItem(LK, JSON.stringify(me)); } catch (e) {}
  }
  var sig = me.key + '|' + code + '|' + (slot ? 'slot' : 'game');
  if (sig === lastSig) return; lastSig = sig;
  css();
  // the conversations this device may have: teacher, support by device key, support by class + name (older feedback notes)
  var CONV = [
    { id: 'teacher', col: 'sm_threads', tid: me.key + '_' + code, label: 'Your teacher', from: 'teacher' },
    { id: 'support', col: 'fb_threads', tid: me.key, label: 'Music Theory Academy', from: 'support' },
    { id: 'support2', col: 'fb_threads', tid: code + '_' + sid, label: 'Music Theory Academy', from: 'support' }];
  var ST = { on: false, blocked: false, t: {} };   // t[conv id] = { unread, last_text, last_from } for threads that exist
  var CK = 'mtg_msg_state_v2:' + sig;
  var PV = { teacher: [{ from: 'student', text: "I don't get why F major has a B flat.", at: Date.now() - 30 * 36e5 }, { from: 'teacher', text: "Count the steps: F G A, then the 4th note is a half step above A. That's B♭!", at: Date.now() - 20 * 36e5 }],
    support: [{ from: 'support', text: 'Thanks for the feedback! I found the leaderboard bug and fixed it.', at: Date.now() - 2 * 36e5 }], support2: [] };
  function save() { try { localStorage.setItem(CK, JSON.stringify({ t: Date.now(), st: ST })); } catch (e) {} }
  function check(force) {
    if (PREVIEW) { ST = { on: true, blocked: false, t: { teacher: { unread: 1, last_text: PV.teacher[1].text, last_from: 'teacher' }, support: { unread: 1, last_text: PV.support[0].text, last_from: 'support', note_text: 'the game is amazing but my 248k score did not load on the leader board :c' } } }; return Promise.resolve(); }
    if (!force) { try { var c = JSON.parse(localStorage.getItem(CK) || 'null'); if (c && Date.now() - c.t < 120000) { ST = c.st; return Promise.resolve(); } } catch (e) {} }
    return fb().then(function (x) {
      return Promise.all([x.fs.getDoc(x.fs.doc(x.db, 'classes', code))].concat(CONV.map(function (cv) { return x.fs.getDoc(x.fs.doc(x.db, cv.col, cv.tid)).catch(function () { return null; }); })));
    }).then(function (d) {
      var c = d[0].exists() ? d[0].data() : {}; owner = c.ownerEmail || owner;
      ST = { on: c.sm_on === true, blocked: Array.isArray(c.sm_blocked) && c.sm_blocked.indexOf(sid) >= 0, t: {} };
      CONV.forEach(function (cv, i) { var s = d[i + 1]; if (s && s.exists()) { var v = s.data(); ST.t[cv.id] = { unread: +v.unread_student || 0, last_text: v.last_text || '', last_from: v.last_from || '', note_text: v.note_text || '' }; } });
      save();
    });
  }
  var unread = function () { return Object.keys(ST.t).reduce(function (a, k) { return a + (ST.t[k].unread || 0); }, 0); };
  var shown = function () { return CONV.filter(function (cv) { return ST.t[cv.id] || (cv.id === 'teacher' && ST.on); }); };

  // ---- bell, button, pop-up ----
  function draw() {
    var n = unread(), any = shown().length;
    var bell = any ? '<button type="button" class="mtg-bell" data-mm-bell="1" aria-label="' + (n ? n + ' new message' + (n > 1 ? 's' : '') : 'Messages') + '" data-tip="' + (n ? 'You have ' + n + ' new message' + (n > 1 ? 's' : '') : 'Your messages') + '">🔔' + (n ? '<span class="mm-n">' + (n > 9 ? '9+' : n) + '</span>' : '') + '</button>' : '';
    if (slot) {
      slot.style.display = 'inline-flex'; slot.style.gap = '8px'; slot.style.alignItems = 'center';
      slot.innerHTML = bell + (ST.on ? '<button type="button" id="mtg-msg-btn" class="' + esc(slot.dataset.btn || '') + '" data-tip="Send your teacher a message. Only your teacher can read it."><span aria-hidden="true">💬</span> Message my teacher</button>' : '');
      var b = document.getElementById('mtg-msg-btn'); if (b) b.onclick = function () { open('teacher'); };
    } else {
      var g = document.getElementById('mtg-bell-game');
      if (!bell) { if (g) g.remove(); }
      else { if (!g) { g = document.createElement('span'); g.id = 'mtg-bell-game'; g.style.cssText = 'display:inline-flex;margin-left:8px;vertical-align:middle'; home.appendChild(g); } g.innerHTML = bell; }
    }
    document.querySelectorAll('[data-mm-bell]').forEach(function (el) { el.onclick = function () { open(); }; });
    if (slot && slot.dataset.popup === '1' && n) popup();
  }
  function newest() {   // the conversation with an unread reply (teacher first), else the first one shown
    var u = shown().filter(function (cv) { return ST.t[cv.id] && ST.t[cv.id].unread; });
    return (u[0] || shown()[0] || CONV[0]).id;
  }
  function popup() {
    var key = 'mtg_msg_pop_v1:' + sig, stamp = JSON.stringify(Object.keys(ST.t).map(function (k) { return [k, ST.t[k].unread, ST.t[k].last_text]; }));
    try { if (sessionStorage.getItem(key) === stamp) return; sessionStorage.setItem(key, stamp); } catch (e) {}
    if (document.getElementById('mtg-msg-pop') || document.getElementById('mtg-msg')) return;
    var id = newest(), cv = CONV.filter(function (c) { return c.id === id; })[0], t = ST.t[id] || {};
    var el = document.createElement('div'); el.id = 'mtg-msg-pop';
    el.innerHTML = '<div class="mm-card" role="dialog" aria-modal="true" aria-labelledby="mm-pop-h"><div class="mm-big" aria-hidden="true">💬</div><h2 id="mm-pop-h">You have a reply from ' + esc(cv.label === 'Your teacher' ? 'your teacher' : cv.label) + '</h2>'
      + (t.last_text ? '<p>"' + esc(t.last_text.length > 110 ? t.last_text.slice(0, 108) + '…' : t.last_text) + '"</p>' : '<p>Open it to read it.</p>')
      + '<button type="button" class="mm-go">Read it</button><button type="button" class="mm-later">Later</button></div>';
    document.body.appendChild(el);
    var closeP = function () { el.remove(); };
    el.querySelector('.mm-go').onclick = function () { closeP(); open(id); };
    el.querySelector('.mm-later').onclick = closeP;
    el.addEventListener('click', function (e) { if (e.target === el) closeP(); });
    el.querySelector('.mm-go').focus();
  }

  // ---- the message box ----
  var CUR = null, MSGS = [], busy = false;
  function fmt(t) { var d = new Date(t); return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }) + ', ' + d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }); }
  function cv(id) { return CONV.filter(function (c) { return c.id === id; })[0]; }
  function canWrite(c) { return c.id === 'teacher' ? ST.on && !ST.blocked : !!ST.t[c.id]; }
  function drawBox() {
    var el = document.getElementById('mtg-msg'); if (!el) return;
    var c = cv(CUR), tabs = shown();
    el.querySelector('.mm-tabs').innerHTML = tabs.length > 1 ? tabs.map(function (t) { var u = ST.t[t.id] && ST.t[t.id].unread; return '<button type="button" class="mm-tab" data-mm-tab="' + t.id + '" aria-pressed="' + (t.id === CUR) + '">' + esc(t.label) + (u ? '<i>' + u + '</i>' : '') + '</button>'; }).join('') : '';
    el.querySelector('.mm-hd h2').textContent = c.id === 'teacher' ? '💬 Message my teacher' : '💬 Music Theory Academy';
    var log = el.querySelector('.mm-log'), t = ST.t[c.id];
    var first = c.from === 'support' && t && t.note_text ? '<div class="mm-b mm-me">' + esc(t.note_text) + '<small>Your feedback</small></div>' : '';
    log.innerHTML = first + (MSGS.length ? MSGS.map(function (m) {
      return '<div class="mm-b ' + (m.from === 'student' ? 'mm-me' : 'mm-them') + '">' + esc(m.text) + '<small>' + (m.from === 'student' ? '' : (m.from === 'teacher' ? 'Your teacher · ' : 'Music Theory Academy · ')) + esc(fmt(m.at)) + '</small></div>';
    }).join('') : (first ? '' : '<p class="mm-empty">' + (c.id === 'teacher' ? 'Ask a question or tell your teacher something. Your teacher will reply here.' : 'No messages yet.') + '</p>'));
    log.scrollTop = log.scrollHeight;
    var ft = el.querySelector('.mm-ft');
    ft.innerHTML = canWrite(c) ? '<textarea maxlength="300" placeholder="' + (c.id === 'teacher' ? 'Write to your teacher' : 'Answer Music Theory Academy') + ' (300 characters)" aria-label="Your message"></textarea>'
      + '<div class="mm-bar"><small>' + (c.id === 'teacher' ? 'Only your teacher can read this.' : 'Only Music Theory Academy can read this.') + ' Be kind; messages may be shared with your school.</small><button type="button" class="mm-send">Send</button></div><p class="mm-err" hidden></p>'
      : '<p class="mm-empty" style="margin:0">' + (c.id === 'teacher' && ST.blocked ? 'Your teacher has turned off messages for you. Talk to them in class.' : 'Messages to your teacher are turned off right now.') + '</p>';
    var send = ft.querySelector('.mm-send'), ta = ft.querySelector('textarea');
    if (send) { send.onclick = doSend; ta.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); doSend(); } }); ta.focus(); }
  }
  function close() { var el = document.getElementById('mtg-msg'); if (el) el.remove(); document.removeEventListener('keydown', onKey); var b = document.querySelector('[data-mm-bell]'); if (b) b.focus(); }
  function onKey(e) { if (e.key === 'Escape') close(); }
  function open(id) {
    if (!document.getElementById('mtg-msg')) {
      var el = document.createElement('div'); el.id = 'mtg-msg';
      el.innerHTML = '<div class="mm-box" role="dialog" aria-modal="true" aria-labelledby="mtg-msg-h"><div class="mm-hd"><h2 id="mtg-msg-h"></h2><button type="button" class="mm-x" aria-label="Close">×</button></div>'
        + '<div class="mm-tabs"></div><div class="mm-log" tabindex="0"></div><div class="mm-ft"></div></div>';
      document.body.appendChild(el);
      el.addEventListener('click', function (e) { var tb = e.target.closest('[data-mm-tab]'); if (tb) return load(tb.dataset.mmTab); if (e.target === el || e.target.closest('.mm-x')) close(); });
      document.addEventListener('keydown', onKey);
    }
    load(id || newest());
  }
  function load(id) {
    CUR = id; MSGS = []; drawBox();
    var c = cv(id); if (!ST.t[id]) return;
    var done = function (list) { MSGS = list; drawBox(); markRead(id); };
    if (PREVIEW) return done((PV[id] || []).slice());
    fb().then(function (x) { return x.fs.getDocs(x.fs.query(x.fs.collection(x.db, c.col, c.tid, 'msgs'), x.fs.orderBy('at'))); })
      .then(function (snap) { done(snap.docs.map(function (d) { var v = d.data(); return { from: v.from, text: v.text, at: ms(v.at) }; })); })
      .catch(function () { done([]); });
  }
  function markRead(id) {
    var t = ST.t[id]; if (!t || !t.unread) return;
    t.unread = 0; save(); draw(); drawBox();
    if (PREVIEW) return;
    var c = cv(id);
    fb().then(function (x) { return x.fs.updateDoc(x.fs.doc(x.db, c.col, c.tid), { unread_student: 0 }); }).catch(function () {});
  }
  function doSend() {
    var el = document.getElementById('mtg-msg'); if (!el || busy) return;
    var c = cv(CUR), ta = el.querySelector('textarea'), btn = el.querySelector('.mm-send'), err = el.querySelector('.mm-err');
    var text = ta.value.trim().slice(0, 300); if (!text) return;
    busy = true; btn.disabled = true; err.hidden = true;
    var done = function () { MSGS.push({ from: 'student', text: text, at: Date.now() }); ta.value = ''; ST.t[c.id] = ST.t[c.id] || { unread: 0 }; ST.t[c.id].last_text = text.slice(0, 120); ST.t[c.id].last_from = 'student'; save(); drawBox(); draw(); };
    if (PREVIEW) { done(); busy = false; btn.disabled = false; return; }
    fb().then(function (x) {
      var fs = x.fs, db = x.db, w = fs.writeBatch(db), ref = fs.doc(db, c.col, c.tid), ts = fs.serverTimestamp(), last = text.slice(0, 120);
      if (c.id === 'teacher') {
        if (!ST.t.teacher) w.set(ref, { class_code: code, owner: owner, sid: sid, name: name, key: me.key, created_at: ts, last_at: ts, last_from: 'student', last_text: last, unread_teacher: 1, unread_student: 0 });
        else w.update(ref, { last_at: ts, last_from: 'student', last_text: last, unread_teacher: fs.increment(1), unread_student: 0 });
      } else w.update(ref, { last_at: ts, last_from: 'student', last_text: last, unread_admin: fs.increment(1), unread_student: 0 });
      w.set(fs.doc(fs.collection(db, c.col, c.tid, 'msgs')), { from: 'student', text: text, at: ts });
      return w.commit();
    }).then(done).catch(function () {
      err.textContent = 'That did not send. Try again in a moment.'; err.hidden = false;
      try { localStorage.removeItem(CK); } catch (e) {}
      check(true).catch(function () {});
    }).then(function () { busy = false; btn.disabled = false; });
  }

  check().then(draw).catch(function () {});
}
window.MTGMsgBoot = boot;   // the home page calls it again after a student signs in or switches class
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
