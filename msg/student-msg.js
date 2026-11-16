/* Message my teacher (added 2026-11-16; spec hub/docs/student-messages-spec.md)
   Used by the home page (hub index.html) and My Report (hub report/). A page puts <span id="mtg-msg-slot" data-btn="ghost"></span>
   where the button goes (data-btn = the button's class) and loads this file.
   - Shows "💬 Message my teacher" only for a signed-in student whose active class has messages on (classes/<code>.sm_on).
   - The conversation is sm_threads/<device key>_<class code> (+ msgs/<id>). The device key is the same random 20-character
     key Live Class keeps in localStorage mtg_bc_v1:<sid>, so only this device can open it. Rules: shared/firestore.rules.
   - Reads: the class doc and the thread doc once per 3 minutes per tab (sessionStorage), the messages only when the box opens.
   - ?msgpreview=1: sample conversation in memory, nothing sent.
*/
(function () {
var cssDone = false, lastTid = '';
function boot() {
  var slot = document.getElementById('mtg-msg-slot'); if (!slot) return;
  var PREVIEW = /[?&]msgpreview=1/.test(location.search);
  var CFG = { apiKey: 'AIzaSyDU9vbCWJ4yWuD8bAX984DmQF4dvo13BHs', authDomain: 'rhythm-trainer-fc313.firebaseapp.com', projectId: 'rhythm-trainer-fc313', appId: '1:956677028482:web:c3ec72a279e61b6f6c929b' };
  var SDK = 'https://www.gstatic.com/firebasejs/10.12.2/';
  function prof() {
    try { if (sessionStorage.getItem('music_guest') === '1') return null; } catch (e) {}
    try { var p = JSON.parse(localStorage.getItem('rdt_profile_v1') || 'null'); return p && p.first && p.init && p.classCode ? p : null; } catch (e) { return null; }
  }
  var p = prof(); if (!p) { slot.innerHTML = ''; lastTid = ''; return; }
  var sid = (p.first + p.init).toLowerCase().replace(/[^a-z]/g, '');
  var f = String(p.first), name = (f.charAt(0).toUpperCase() + f.slice(1) + ' ' + p.init + '.').slice(0, 24);
  var code = p.classCode, owner = p.classOwner || '';
  // the Live Class device key (same storage and shape as live/index.html loadMe)
  var LK = 'mtg_bc_v1:' + sid, me = null;
  try { me = JSON.parse(localStorage.getItem(LK) || 'null'); } catch (e) {}
  if (!me || !/^[a-z0-9]{20}$/.test(me.key)) {
    var a = 'abcdefghijklmnopqrstuvwxyz0123456789', s = '', r = crypto.getRandomValues(new Uint8Array(20));
    r.forEach(function (x) { s += a[x % 36]; });
    me = { key: s, lost: false, conf: 3, hist: [], react: null };
    try { localStorage.setItem(LK, JSON.stringify(me)); } catch (e) {}
  }
  var TID = me.key + '_' + code;
  if (TID === lastTid) return; lastTid = TID;
  var esc = function (v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var fbP = null;
  function fb() {
    fbP = fbP || Promise.all([import(SDK + 'firebase-app.js'), import(SDK + 'firebase-firestore.js')]).then(function (m) {
      var app; try { app = m[0].getApp('mtg-msg'); } catch (e) { app = m[0].initializeApp(CFG, 'mtg-msg'); }
      return { fs: m[1], db: m[1].getFirestore(app) };
    }).catch(function (e) { fbP = null; throw e; });
    return fbP;
  }
  var ms = function (v) { return v && v.toMillis ? v.toMillis() : +v || 0; };
  var PV = { on: true, thread: { unread_student: 1 }, msgs: [
    { from: 'student', text: "I don't get why F major has a B flat.", at: Date.now() - 30 * 36e5 },
    { from: 'teacher', text: "Count the steps: F G A, then the 4th note is a half step above A. That's B♭!", at: Date.now() - 20 * 36e5 }] };

  // ---- state check: is messaging on for this class, and is there a reply waiting? ----
  var ST = { on: false, blocked: false, thread: null };
  var CK = 'mtg_msg_state_v1:' + TID;
  function check() {
    if (PREVIEW) { ST.on = true; ST.thread = PV.thread; return Promise.resolve(); }
    try { var c = JSON.parse(sessionStorage.getItem(CK) || 'null'); if (c && Date.now() - c.t < 180000) { ST = c.st; return Promise.resolve(); } } catch (e) {}
    return fb().then(function (x) {
      return Promise.all([x.fs.getDoc(x.fs.doc(x.db, 'classes', code)), x.fs.getDoc(x.fs.doc(x.db, 'sm_threads', TID))]);
    }).then(function (d) {
      var c = d[0].exists() ? d[0].data() : {};
      owner = c.ownerEmail || owner;
      ST = { on: c.sm_on === true, blocked: Array.isArray(c.sm_blocked) && c.sm_blocked.indexOf(sid) >= 0, thread: d[1].exists() ? { unread_student: +d[1].data().unread_student || 0 } : null };
      try { sessionStorage.setItem(CK, JSON.stringify({ t: Date.now(), st: ST })); } catch (e) {}
    });
  }
  function save() { try { sessionStorage.setItem(CK, JSON.stringify({ t: Date.now(), st: ST })); } catch (e) {} }

  // ---- the button ----
  var css = cssDone ? null : document.createElement('style'); if (css) {
  css.textContent = '#mtg-msg-btn{position:relative;cursor:pointer}#mtg-msg-btn.pill{background:transparent;padding-right:16px}#mtg-msg-btn .mm-dot{position:absolute;top:4px;right:6px;width:10px;height:10px;border-radius:50%;background:#e2483d;box-shadow:0 0 0 2px rgba(0,0,0,.35)}'
    + '#mtg-msg{position:fixed;inset:0;z-index:9999;background:rgba(5,8,14,.6);display:flex;align-items:center;justify-content:center;padding:16px}'
    + '#mtg-msg .mm-box{width:min(460px,100%);max-height:min(640px,calc(100vh - 32px));display:flex;flex-direction:column;background:#141d2c;color:#f1ece0;border:1px solid #33445f;border-radius:18px;box-shadow:0 20px 60px rgba(0,0,0,.5);font-family:"Josefin Sans",system-ui,sans-serif}'
    + '#mtg-msg .mm-hd{flex:none;display:flex;align-items:center;gap:10px;padding:14px 16px 10px;border-bottom:1px solid #26344b}#mtg-msg .mm-hd h2{margin:0;font-size:19px;flex:1}'
    + '#mtg-msg .mm-x{background:none;border:0;color:#9aa7bb;font-size:22px;cursor:pointer;line-height:1}#mtg-msg .mm-x:hover{color:#fff}'
    + '#mtg-msg .mm-log{flex:1 1 auto;overflow-y:auto;padding:14px 16px;display:flex;flex-direction:column;gap:8px;min-height:120px}'
    + '#mtg-msg .mm-b{max-width:82%;padding:9px 12px 6px;border-radius:14px;line-height:1.35;font-size:15px;white-space:pre-wrap;overflow-wrap:anywhere}'
    + '#mtg-msg .mm-b small{display:block;color:#9aa7bb;font-size:11px;margin-top:3px}#mtg-msg .mm-me{align-self:flex-end;background:#2a3b58}#mtg-msg .mm-them{align-self:flex-start;background:#1d2a40;border:1px solid #33445f}'
    + '#mtg-msg .mm-empty{margin:auto;color:#9aa7bb;text-align:center;max-width:300px;font-size:15px}'
    + '#mtg-msg .mm-ft{flex:none;padding:10px 16px 14px;border-top:1px solid #26344b}#mtg-msg textarea{width:100%;box-sizing:border-box;min-height:56px;resize:vertical;border-radius:12px;border:1px solid #33445f;background:#0d1420;color:#f1ece0;font:500 16px/1.4 "Josefin Sans",system-ui,sans-serif;padding:9px 11px}'
    + '#mtg-msg textarea:focus{outline:2px solid #ffc85c;outline-offset:1px}#mtg-msg .mm-bar{display:flex;align-items:center;gap:10px;margin-top:8px}#mtg-msg .mm-bar small{flex:1;color:#9aa7bb;font-size:12.5px;line-height:1.3}'
    + '#mtg-msg .mm-send{border:0;border-radius:999px;background:#ffc85c;color:#10131a;font:700 15px "Josefin Sans",system-ui,sans-serif;padding:9px 18px 7px;cursor:pointer}#mtg-msg .mm-send:disabled{opacity:.5;cursor:default}'
    + '#mtg-msg .mm-err{color:#ff8a7a;font-size:13px;margin:6px 0 0}';
  document.head.appendChild(css); cssDone = true; }
  function drawBtn() {
    if (!ST.on) { slot.innerHTML = ''; return; }
    var n = ST.thread && ST.thread.unread_student;
    slot.innerHTML = '<button type="button" id="mtg-msg-btn" class="' + esc(slot.dataset.btn || '') + '" data-tip="Send your teacher a message. Only your teacher can read it.">'
      + '<span aria-hidden="true">💬</span> Message my teacher' + (n ? '<i class="mm-dot" aria-label="Your teacher replied"></i>' : '') + '</button>';
    document.getElementById('mtg-msg-btn').onclick = open;
  }

  // ---- the box ----
  var MSGS = [], busy = false;
  function fmt(t) { var d = new Date(t); return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }) + ', ' + d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }); }
  function drawLog() {
    var log = document.querySelector('#mtg-msg .mm-log'); if (!log) return;
    log.innerHTML = MSGS.length ? MSGS.map(function (m) {
      return '<div class="mm-b ' + (m.from === 'student' ? 'mm-me' : 'mm-them') + '">' + esc(m.text) + '<small>' + (m.from === 'teacher' ? 'Your teacher · ' : '') + esc(fmt(m.at)) + '</small></div>';
    }).join('') : '<p class="mm-empty">Ask a question or tell your teacher something. Your teacher will reply here.</p>';
    log.scrollTop = log.scrollHeight;
  }
  function close() { var el = document.getElementById('mtg-msg'); if (el) el.remove(); document.removeEventListener('keydown', onKey); var b = document.getElementById('mtg-msg-btn'); if (b) b.focus(); }
  function onKey(e) { if (e.key === 'Escape') close(); }
  function open() {
    if (document.getElementById('mtg-msg')) return;
    var el = document.createElement('div'); el.id = 'mtg-msg';
    el.innerHTML = '<div class="mm-box" role="dialog" aria-modal="true" aria-labelledby="mtg-msg-h"><div class="mm-hd"><h2 id="mtg-msg-h">💬 Message my teacher</h2><button type="button" class="mm-x" aria-label="Close">×</button></div>'
      + '<div class="mm-log" tabindex="0"><p class="mm-empty">Loading…</p></div>'
      + (ST.blocked ? '<div class="mm-ft"><p class="mm-empty" style="margin:0">Your teacher has turned off messages for you. Talk to them in class.</p></div>'
        : '<div class="mm-ft"><textarea maxlength="300" placeholder="Write to your teacher (300 characters)" aria-label="Your message"></textarea>'
        + '<div class="mm-bar"><small>Only your teacher can read this. Be kind; your teacher may share messages with your school.</small><button type="button" class="mm-send">Send</button></div><p class="mm-err" hidden></p></div>')
      + '</div>';
    document.body.appendChild(el);
    el.addEventListener('click', function (e) { if (e.target === el || e.target.closest('.mm-x')) close(); });
    document.addEventListener('keydown', onKey);
    var send = el.querySelector('.mm-send'), ta = el.querySelector('textarea');
    if (send) { send.onclick = doSend; ta.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); doSend(); } }); ta.focus(); }
    loadMsgs();
  }
  function loadMsgs() {
    if (PREVIEW) { MSGS = PV.msgs.slice(); drawLog(); markRead(); return; }
    fb().then(function (x) {
      return x.fs.getDocs(x.fs.query(x.fs.collection(x.db, 'sm_threads', TID, 'msgs'), x.fs.orderBy('at')));
    }).then(function (snap) {
      MSGS = snap.docs.map(function (d) { var v = d.data(); return { from: v.from, text: v.text, at: ms(v.at) }; });
      drawLog(); markRead();
    }).catch(function () { MSGS = []; drawLog(); });
  }
  function markRead() {
    if (!ST.thread || !ST.thread.unread_student) return;
    ST.thread.unread_student = 0; save(); drawBtn();
    if (PREVIEW) return;
    fb().then(function (x) { return x.fs.updateDoc(x.fs.doc(x.db, 'sm_threads', TID), { unread_student: 0 }); }).catch(function () {});
  }
  function doSend() {
    var el = document.getElementById('mtg-msg'); if (!el || busy) return;
    var ta = el.querySelector('textarea'), btn = el.querySelector('.mm-send'), err = el.querySelector('.mm-err');
    var text = ta.value.trim().slice(0, 300); if (!text) return;
    busy = true; btn.disabled = true; err.hidden = true;
    var done = function () { MSGS.push({ from: 'student', text: text, at: Date.now() }); ta.value = ''; drawLog(); ST.thread = ST.thread || { unread_student: 0 }; save(); };
    if (PREVIEW) { done(); busy = false; btn.disabled = false; return; }
    fb().then(function (x) {
      var fs = x.fs, db = x.db, w = fs.writeBatch(db), ref = fs.doc(db, 'sm_threads', TID), ts = fs.serverTimestamp(), last = text.slice(0, 120);
      if (!ST.thread) w.set(ref, { class_code: code, owner: owner, sid: sid, name: name, key: me.key, created_at: ts, last_at: ts, last_from: 'student', last_text: last, unread_teacher: 1, unread_student: 0 });
      else w.update(ref, { last_at: ts, last_from: 'student', last_text: last, unread_teacher: fs.increment(1), unread_student: 0 });
      w.set(fs.doc(fs.collection(db, 'sm_threads', TID, 'msgs')), { from: 'student', text: text, at: ts });
      return w.commit();
    }).then(done).catch(function () {
      err.textContent = 'That did not send. Your teacher may have turned messages off. Try again in a moment.'; err.hidden = false;
      try { sessionStorage.removeItem(CK); } catch (e) {}
      check().catch(function () {});   // fresh state for the next try (for example the conversation already existed)
    }).then(function () { busy = false; btn.disabled = false; });
  }

  check().then(drawBtn).catch(function () {});
}
window.MTGMsgBoot = boot;   // the home page calls it again after a student signs in or switches class
boot();
})();
