/*
 * SchoolChat: An Institutionally-Managed Group Communication and Academic Task System
 * BSIT 3-6, Cavite State University Bacoor Campus
 *
 * One file for the whole app: data, login, dashboards, chat, tasks and admin screens.
 * Screens are built as HTML strings by small functions and drawn by render().
 */
// ==============================================================
// DATA: collections, app state and the shared database
// ==============================================================
const COLS = ['users', 'groups', 'members', 'messages', 'tasks', 'subs', 'anns'],
  D = {};
COLS.forEach(c => D[c] = []);
let db = null,
  ready = false,
  me = '',
  view = {p: 'home'},
  q = '',
  nOpen = false,
  openT = '',
  pend = null,
  err = '';
const APP = 'admin';
let TOKEN = '',
  VER = 0,
  lr = 'Student',
  NEED = false,
  DOWN = false;
const LBL = {Student: 'Student ID', Teacher: 'Faculty ID'};
let replyTo = '',    // message being replied to
  rxOpen = '',       // message whose 3-emoji picker is open
  tAtt = [],         // files attached to the task being written
  schD = null,       // schedule dialog
  pmOpen = false,    // Post ▾ menu
  stickNext = false; // scroll the chat to the newest message on the next draw
let mOpen = false,   // the three-dot menu
  armed = '',        // button waiting for a second tap (reset password, archive all)
  armT = 0,
  sd = [];           // days tapped in the schedule form
try {
  TOKEN = localStorage.getItem('sc_tok_'+APP) || ''
} catch (_) {}

// ==============================================================
// HELPERS: lookups, role checks, formatting and password hashing
// ==============================================================
const $ = i => document.getElementById(i),
  app = $('app'),
  uid = () => Date.now().toString(36)+Math.random().toString(36).slice(2, 7);
const E = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const fd = t => new Date(t).toLocaleString([], {month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'});
const U = id => D.users.find(u => u.id == id),
  G = id => D.groups.find(g => g.id == id),
  nm = id => (U(id) || {name: 'Unknown'}).name,
  gn = id => id == 'all' ? 'Whole school' : (G(id) || {name: '?'}).name;
const cu = () => D.users.find(u => u.id == me && u.status == 'Active'),
  isA = () => cu().role == 'Admin',
  isT = () => cu().role == 'Teacher',
  isS = () => cu().role == 'Student';
const act = g => !g.arch,
  memIds = () => D.members.filter(m => m.u == me && m.j !== false).map(m => m.g),
  mine = () => (isA() ? D.groups : D.groups.filter(g => memIds().includes(g.id))).filter(act),
  ids = () => mine().map(g => g.id);
const mt = s => !q || String(s).toLowerCase().includes(q.toLowerCase()),
  clr = (...a) => a.forEach(i => $(i) && ($(i).value = ''));
const stat = t => {
  const s = D.subs.find(s => s.t == t.id && s.u == me);
  return s ? s.status : 'pending'
},
  badge = t => `<span class="s-${stat(t)}">${stat(t)}</span>`;
const H = async(p, s) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s+p)))].map(b => b.toString(16).padStart(2, '0')).join('');

// ==============================================================
// NAVIGATION AND RENDERING: toast, go, render
// ==============================================================
function toast(t) {
  const d = document.createElement('div');
  d.className = 'toast';
  d.textContent = t;
  document.body.append(d);
  setTimeout(() => d.remove(), 4500)
}

// ==============================================================
// SERVER CONNECTION: api calls, put / delete, create user
// ==============================================================
async function api(path, body) {
  try {
    const r = await fetch('/api/'+path, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({...body, token: TOKEN})});
    if (r.status == 401) {
      endSession('Your session ended. If your account was banned, contact the administrator.');
      return null
    }
    return await r.json()
  } catch (e) {
    return{error: 'Cannot reach the server. Is it running?'}
  }
}

async function put(c, o) {
  const i = D[c].findIndex(x => x.id == o.id),
    v = {...o};
  delete v.pw;
  i < 0 ? D[c].push(v) : D[c][i] = v;
  render();
  const r = await api('put', {col: c, doc: o});
  if (r && r.error) toast(r.error);
  VER = 0;
  sync()
}

async function del(c, id) {
  D[c] = D[c].filter(x => x.id != id);
  render();
  const r = await api('del', {col: c, doc: {id}});
  if (r && r.error) toast(r.error);
  VER = 0;
  sync()
}

async function mk(sid, name, email, role, pw, sec = '') {
  const id = uid();
  await put('users', {id, sid, name, email, role, sec, status: 'Active', pw});
  return id
}

function go(p, g, tab, f) {
  view = {p, g, tab: tab || 'chat', f: f || ''};      // f = id of the message / task / announcement to show
  nOpen = mOpen = pmOpen = false;
  rxOpen = replyTo = '';
  pend = null;
  render();
  if (!f) scrollTo({top: 0, behavior: 'smooth'})
}

function render() {
  if (!ready) {
    app.innerHTML = '<p class="mu" style="padding:20px">Loading…</p>';
    return
  }
  const vals = {};
  document.querySelectorAll('#app [id]').forEach(e => {
    if ('value'in e && e.type != 'file' && e.tagName != 'BUTTON') vals[e.id] = e.value
  });
  const a = document.activeElement,
    af = a && a.id,
    ss = a && a.selectionStart,
    c0 = $('chat'),
    keep = c0 ? c0.scrollTop : 0,
    stick = stickNext || !c0 || c0.dataset.g != view.g || c0.scrollHeight-c0.scrollTop-c0.clientHeight < 80;
  stickNext = false;
  app.innerHTML = !cu() ? (DOWN ? downView() : APP == 'admin' && NEED ? regView() : login3()) : shell();
  for (const k in vals) {
    const e = $(k);
    if (e) e.value = vals[k]
  }
  if (af && $(af)) {
    $(af).focus({preventScroll: true});
    try {
      $(af).setSelectionRange(ss, ss)
    } catch (_) {}
  }
  const c = $('chat');
  if (c) c.scrollTop = stick ? c.scrollHeight : keep;       // reading older messages? stay where you are
  fitTop();
  if (view.f) {                                              // opened from a notification: show and highlight it
    const e = $(view.f);
    if (e) {
      e.scrollIntoView({block: 'center'});
      e.classList.add('flash');
      view.f = ''
    }
  }
}


// ==============================================================
// LOGIN, LOGOUT AND SESSION
// ==============================================================
const login3 = () => {
  const ad = APP == 'admin';
  return `<div class=lg>
    <div class=lh>
    <img class=lgo src=logo.png alt=""><h1>SchoolChat</h1>
    <div>${ad?'Administrator Portal':'The official class chat of your school.'}</div>
    <ul>${ad?'<li>Create accounts and build schedules</li><li>Read class chats and ban rule-breakers</li><li>Post school-wide announcements</li>':'<li>Chat, announcements and tasks in one place</li><li>Accounts managed by the school admin</li><li>Works on phone and computer</li>'}</ul></div>
    <div class=lr>
    <div class=card>${ad?'':`<div class=rt>${['Student','Teacher'].map(r=>`<button id=tab${r} class="tab ${lr==r?'on':''}" onclick="setRole('${r}')">${r=='Student'?'🎓':'👩‍🏫'} ${r}</button>`).join('')}</div>`}
    <h2 id=lt>${ad?'🛡️ Admin Login':lr+' Login'}</h2>${NEED&&!ad?'<p class=err>The school admin has not set up SchoolChat yet.</p>':''}<label id=ll>${ad?'Email':LBL[lr]}</label><input id=li autocomplete=username placeholder="${ad?'admin@school.edu':LBL[lr]}" value="${E(ss('sc_li'))}"><label>Password</label><input id=lp type=password autocomplete=current-password onkeydown="if(event.key=='Enter')doLogin()">
    <div id=le class=err>${E(err)}</div><button id=lb class=pr onclick=doLogin()>${ad?'LOGIN':'LOGIN AS '+lr.toUpperCase()}</button>
    <p class=mu>${ad?'Forgot the admin password, or no register screen? Run <b>python server.py --reset-admin</b> on the server computer.':'Accounts are created by the school administrator.'}</p></div></div></div>`
};
const ss = k => {
  try {
    return sessionStorage.getItem(k) || ''
  } catch (_) {
    return ''
  }
};
const downView = () => `<div class=lg>
  <div class=lh>
  <img class=lgo src=logo.png alt=""><h1>SchoolChat</h1>
  <div>${APP=='admin'?'Administrator Portal':'The official class chat of your school.'}</div></div>
  <div class=lr>
  <div class=card>
  <h2>⚠️ Server is not running</h2>
  <p class=mu>${location.protocol=='file:'?'You opened this page as a file. SchoolChat must be opened through its server.':'This page cannot reach the SchoolChat server.'}</p><ol>
  <li>Install Python 3 from python.org (tick “Add Python to PATH”).</li>
  <li>Open the SchoolChat folder and double-click <b>start-windows.bat</b> (Mac/Linux: <b>start.sh</b>), or run <b>python server.py</b>.</li>
  <li>Open <b>http://localhost:8000/</b> for students and teachers, or <b>http://localhost:8000/admin/</b> for the admin.</li></ol>
  <p class=mu>This screen checks again by itself every 2 seconds.</p></div></div></div>`;

function setRole(r) {
  lr = r;
  err = '';
  ['Student', 'Teacher'].forEach(x => $('tab'+x).classList.toggle('on', x == r));
  $('lt').textContent = r+' Login';
  $('ll').textContent = LBL[r];
  $('li').placeholder = LBL[r];
  $('lb').textContent = 'LOGIN AS '+r.toUpperCase();
  $('le').textContent = '';
  $('li').focus()
}
const regView = () => `<div class=lg>
  <div class=lh>
  <img class=lgo src=logo.png alt=""><h1>SchoolChat</h1>
  <div>Administrator Portal</div>
  <ul>
  <li>First-time setup</li>
  <li>Register the school administrator</li>
  <li>Then create accounts and schedules</li></ul></div>
  <div class=lr>
  <div class=card>
  <h2>🛡️ Register Admin</h2>
  <p class=mu>Create the administrator account. This is only available until the first admin is registered.</p><label>Full name</label><input id=rn autocomplete=name><label>Email</label><input id=re type=email autocomplete=email><label>Password</label><input id=rp type=password autocomplete=new-password placeholder="6+ characters" onkeydown="if(event.key=='Enter')doReg()">
  <div class=err>${E(err)}</div><button class=pr onclick=doReg()>REGISTER</button></div></div></div>`;

async function post(path, body) {
  try {
    return await (await fetch('/api/'+path, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)})).json()
  } catch (e) {
    return{error: 'Cannot reach the server. Is it running?'}
  }
}

function signedIn(r) {
  if (r.error) {
    err = r.error;
    return render()
  }
  TOKEN = r.token;
  try {
    localStorage.setItem('sc_tok_'+APP, TOKEN);
    sessionStorage.removeItem('sc_li')
  } catch (_) {}
  err = '';
  NEED = false;
  view = {p: 'home'};
  VER = 0;
  sync()
}

async function doLogin() {
  const ad = APP == 'admin',
    i = $('li').value.trim(),
    p = $('lp').value;
  if (!i || !p) {
    err = ad ? 'Enter your email and password.' : 'Enter your '+LBL[lr]+' and password.';
    return render()
  }
  signedIn(await post('login', {id: i, pw: p, app: APP, role: lr}))
}

async function doReg() {
  const n = $('rn').value.trim(),
    e = $('re').value.trim(),
    p = $('rp').value;
  if (!n || !/^\S+@\S+\.\S+$/.test(e) || p.length < 6) {
    err = 'Enter your name, a valid email and a password of 6+ characters.';
    return render()
  }
  const r = await post('register', {name: n, email: e, pw: p});
  if (r.error) NEED = false;
  signedIn(r)
}

function endSession(msg) {
  TOKEN = '';
  me = '';
  try {
    localStorage.removeItem('sc_tok_'+APP)
  } catch (_) {}
  COLS.forEach(c => D[c] = []);
  view = {p: 'home'};
  nOpen = mOpen = pmOpen = false;
  rxOpen = replyTo = '';
  pend = null;
  tAtt = [];
  schD = null;
  closeLb();
  err = msg;
  render()
}

function logout() {
  api('logout', {});
  endSession('')
}

function ban(x) {
  const w = U(x.u) || {};
  return isA() && w.role == 'Student' && w.status == 'Active' ? `<button class=ban onclick="tog('${x.u}')">🚫 Ban</button>` : ''
}

// ==============================================================
// NOTIFICATIONS
// ==============================================================
function seen() {
  try {
    return +localStorage.getItem('sc_seen_'+me) || 0
  } catch (_) {
    return 0
  }
}

// notifications that were opened one by one are remembered here
function rdSet() {
  try {
    return new Set(JSON.parse(localStorage.getItem('sc_read_'+me) || '[]'))
  } catch (_) {
    return new Set()
  }
}

function saveRd(set) {
  try {
    localStorage.setItem('sc_read_'+me, JSON.stringify([...set].slice(-300)))
  } catch (_) {}
}

function markAll() {
  const r = rdSet();
  notes().forEach(x => r.add(x.key));
  saveRd(r);
  try {
    localStorage.setItem('sc_seen_'+me, Date.now())
  } catch (_) {}
  render()
}

// What the bell shows. Every item knows where it leads: k = m (chat message), t (task), a (announcement), d (deadline).
function notes() {
  const A = isA(),
    m = A ? ids() : memIds().filter(g => G(g) && act(G(g))),
    s = seen(),
    rd = rdSet(),
    n = Date.now(),
    o = [],
    add = x => rd.has(x.key) || o.push(x);
  D.messages.filter(x => m.includes(x.g) && x.u != me && x.at > s).forEach(x => {
    const toMe = x.rep && (D.messages.find(y => y.id == x.rep) || {}).u == me;
    add({key: 'm:'+x.id, k: 'm', id: x.id, g: x.g, at: x.at, ico: toMe ? '↩️' : '💬', h: gn(x.g), p: `${nm(x.u)}${toMe ? ' replied to you' : ''}: ${snip(x)}`})
  });
  if (!A) {
    D.tasks.filter(x => m.includes(x.g) && x.by != me && x.at > s && (!x.pub || x.pub <= n)).forEach(x => add({key: 't:'+x.id, k: 't', id: x.id, g: x.g, at: x.at, ico: '📝', h: `New task · ${gn(x.g)}`, p: x.title}));
    D.anns.filter(x => (x.g == 'all' || m.includes(x.g)) && x.by != me && x.at > s).forEach(x => add({key: 'a:'+x.id, k: 'a', id: x.id, g: x.g, at: x.at, ico: '📢', h: x.g == 'all' ? 'School announcement' : `Announcement · ${gn(x.g)}`, p: x.title}));
    if (isS()) D.tasks.filter(x => m.includes(x.g) && x.due > n && x.due-n < 1728e5 && !D.subs.some(y => y.t == x.id && y.u == me)).forEach(x => add({key: 'd:'+x.id, k: 'd', id: x.id, g: x.g, at: x.due, ico: '⏰', h: `Deadline soon · ${gn(x.g)}`, p: `${x.title} · due ${fd(x.due)}`}))
  }
  return o.sort((a, b) => b.at-a.at).slice(0, 30)
}

// tapping a notification marks it read and opens the exact message, task or announcement
function openNote(key) {
  const x = notes().find(y => y.key == key);
  nOpen = false;
  if (!x) return render();
  const r = rdSet();
  r.add(key);
  saveRd(r);
  if (x.k == 'a') go('anns', '', '', 'a_'+x.id);
  else go('group', x.g, x.k == 'm' ? 'chat' : 'tasks', (x.k == 'm' ? 'm_' : 't_')+x.id)
}

// ---- top bar: bell (notification dropdown) and three-dot menu ---------------------------
const bell = n => `<div class=nb><button id=nbtn class=tl type=button aria-haspopup=dialog aria-expanded="${nOpen}" aria-label="Notifications${n.length ? ', '+n.length+' new' : ''}" onclick="toggleNotes(event)">🔔<span class=nt> Notification</span>${n.length ? ` <i>${n.length > 99 ? '99+' : n.length}</i>` : ''}</button>
  <div id=npanel class=npanel role=dialog aria-label=Notifications${nOpen ? '' : ' hidden'}>
  <div class=nh><b>Notifications</b>${n.length ? '<button class=sm type=button onclick=markAll()>Mark all read</button>' : ''}</div>
  <div class=nlist>${n.map(x => `<button class=ni type=button onclick="openNote('${x.key}')"><i class=nico>${x.ico}</i><span class=ntx><b>${E(x.h)}</b><span>${E(x.p)}</span><small>${fd(x.at)}</small></span></button>`).join('') || '<p class=mu>You’re all caught up.</p>'}</div></div></div>`;

const kebab = u => `<div class=kb><button id=kbtn class=kbtn type=button aria-label="Account menu" aria-haspopup=menu aria-expanded="${mOpen}" onclick="toggleMenu(event)">⋮</button>
  <div id=kmenu class=kmenu role=menu${mOpen ? '' : ' hidden'}>
  <div class=kh><i class=kav>${E((u.name || '?')[0])}</i><span><b>${E(u.name)}</b><small>${u.role == 'Admin' ? 'Administrator' : `${u.role} · ${E(u.sid)}`}</small></span></div>
  <button id=kmp role=menuitem onclick="go('profile')">👤 Profile</button>
  <button id=kmo role=menuitem class=kout onclick="logout()">🚪 Log Out</button></div></div>`;

// Menus open and close by flipping the "hidden" attribute, so nothing is redrawn while you use them.
function syncPops() {
  [['kmenu', 'kbtn', mOpen], ['npanel', 'nbtn', nOpen], ['pmenu', 'pcaret', pmOpen]].forEach(([p, b, o]) => {
    if ($(p)) $(p).hidden = !o;
    if ($(b)) $(b).setAttribute('aria-expanded', o)
  })
}

function toggleMenu(ev) {
  ev.stopPropagation();
  mOpen = !mOpen;
  nOpen = pmOpen = false;
  syncPops();
  if (mOpen && ev.detail === 0 && $('kmp')) $('kmp').focus()      // opened with the keyboard: move into the menu
}

function toggleNotes(ev) {
  ev.stopPropagation();
  nOpen = !nOpen;
  mOpen = pmOpen = false;
  syncPops()
}

function closePops(back) {
  if (!mOpen && !nOpen && !pmOpen) return;
  const b = mOpen ? 'kbtn' : nOpen ? 'nbtn' : 'pcaret';
  mOpen = nOpen = pmOpen = false;
  syncPops();
  if (back && $(b)) $(b).focus()
}
document.addEventListener('click', e => {
  if ((mOpen || nOpen || pmOpen) && !e.target.closest('.kb, .nb, .split')) closePops();
  if (rxOpen && !e.target.closest('.rxp, .mact')) {
    rxOpen = '';
    render()
  }
});
document.addEventListener('focusin', e => {
  if ((mOpen || nOpen || pmOpen) && !e.target.closest('.kb, .nb, .split')) closePops()
});
document.addEventListener('keydown', e => {
  if (e.key == 'Escape') {
    if ($('lbx')) return closeLb();
    if (schD) {
      schD = null;
      return render()
    }
    if (mOpen || nOpen || pmOpen) return closePops(true);
    if (rxOpen) {
      rxOpen = '';
      return render()
    }
  }
  if ((e.key == 'ArrowDown' || e.key == 'ArrowUp') && (mOpen || nOpen)) {
    e.preventDefault();
    const it = [...document.querySelectorAll(mOpen ? '#kmenu button' : '#npanel .ni')],
      i = it.indexOf(document.activeElement),
      d = e.key == 'ArrowDown';
    if (it.length) it[i < 0 ? (d ? 0 : it.length-1) : (i+(d ? 1 : -1)+it.length) % it.length].focus()
  }
});

// on phones the sticky sidebar row sits right under the top bar, whatever height the top bar has
function fitTop() {
  const t = document.querySelector('.top');
  document.documentElement.style.setProperty('--topH', (t ? t.offsetHeight : 0)+'px')
}
addEventListener('resize', fitTop);


// ==============================================================
// APP LAYOUT AND DASHBOARD (home)
// ==============================================================
function shell() {
  const n = notes(),
    u = cu(),
    A = isA();
  return `<div class=top><b onclick="go('home')" title="Dashboard"><img class=brand-logo src=logo.png alt="">SchoolChat</b><span class=chip>${u.role} Dashboard</span><input id=sq placeholder="Search..." value="${E(q)}" oninput="q=this.value;render()">${bell(n)}${kebab(u)}</div>

    <div class=body>
    <aside>${A ? '' : '<b>MY GROUPS</b>'}${(A ? [] : mine()).filter(g => mt(g.name)).map(g => `<div class="lk ${view.p == 'group' && view.g == g.id ? 'on' : ''}" onclick="go('group','${g.id}')">💬 ${E(g.name)}</div>`).join('') || (A ? '' : '<div class=mu>None yet.</div>')}<br>${nv('home', '🏠', 'Dashboard')}${A ? '' : nv('tasks', '📝', 'Tasks')}${nv('anns', '📢', 'Announcements')}${A ? nv('admin', '⚙️', 'Manage') : ''}</aside>

    <main>${({home, group, tasks: tasksPage, anns: annsPage, admin: adminV, profile})[view.p]()}</main></div>${schD ? schedDialog() : ''}`
}

function home() {
  const i = ids(),
    an = D.anns.filter(a => vis(a) && mt(a.title+a.body)).sort((a, b) => b.at-a.at).slice(0, 4),
    tk = D.tasks.filter(t => !isA() && i.includes(t.g) && (!isT() || t.by == me) && mt(t.title) && (!isS() || stat(t) == 'pending')).sort((a, b) => a.due-b.due).slice(0, 5),
    ms = D.messages.filter(m => i.includes(m.g) && mt(m.text)).sort((a, b) => b.at-a.at).slice(0, 5);
  return `${hero()}${dash()}<b>ANNOUNCEMENT</b>
    <div class=box>${an.map(a=>`<p>${a.g=='all'?'📣':'-'} <b>${E(a.title)}</b> <small>${E(gn(a.g))}</small><br>${E(a.body)}</p>`).join('')||'<p class=mu>None yet.</p>'}</div>
${isA()?'':'<b>UPCOMING TASKS</b>'}
    <div class=box${isA()?' hidden':''}>${tk.map(t=>`<p class=lk onclick="go('group','${t.g}','tasks')">- ${E(t.title)} · ${E(gn(t.g))} · Due: ${fd(t.due)} ${isS()?badge(t):''}</p>`).join('')||'<p class=mu>No upcoming tasks.</p>'}</div>
<b>RECENT MESSAGES</b>
    <div class=box>${ms.map(m=>`<p class=lk onclick="go('group','${m.g}','chat')">- ${E(gn(m.g))}: ${E(nm(m.u))}: ${E(m.text||m.fn)}</p>`).join('')||'<p class=mu>No messages yet.</p>'}</div>`
}

// ==============================================================
// CLASS PAGE: chat, tasks and members
// ==============================================================
function group() {
  const g = G(view.g);
  if (!g || !ids().includes(g.id)) return '<p>You don’t have access to this group.</p>';
  const tabs = ['chat', ...(isA() ? [] : ['tasks']), 'members'].map(t => `<button class="tab ${view.tab==t?'on':''}" onclick="view.tab='${t}';pend=null;replyTo='';rxOpen='';render()">${t[0].toUpperCase()+t.slice(1)}</button>`).join(' ');
  return `<div class=gh><b class=lk onclick="${isA()?"manage('sched')":"go('home')"}">&lt; ${E(g.name)}</b><span>${tabs}</span></div>
    <p class=mu>${E(g.subject)} · ${E(g.time)} · Teacher: ${E(nm(g.teacher))}</p>`+({chat: g => isA() ? vMon(g) : vChat(g), tasks: vTasks, members: vMembers}[view.tab])(g)
}

// ---- files: safe previews, automatic resizing of big photos, and the image viewer ---------
const MAXB = 150e3,
  RX = ['👍', '❤️', '😂'],
  safeData = d => /^data:[\w.+\/-]+;base64,[A-Za-z0-9+\/=]*$/.test(d || '') ? d : '',
  isImgData = d => /^data:image\/(png|jpe?g|gif|webp|bmp|avif);/.test(d || ''),
  fsize = d => Math.max(1, Math.round((d.length-d.indexOf(',')) * .75 / 1024))+' KB',
  snip = m => {
    const t = m.text || (m.file ? (isImgData(m.file) ? '📷 Photo' : '📎 '+(m.fn || 'File')) : '');
    return t.length > 80 ? t.slice(0, 80)+'…' : t
  },
  // an image shows as a picture you can tap to enlarge; anything else shows as a download chip
  fileView = (data, name) => {
    const d = safeData(data);
    if (!d) return '';
    return isImgData(d)
      ? `<img class=pv src="${d}" alt="${E(name)}" title="${E(name)}" onclick="lightbox(this)">`
      : `<a class=fchip href="${d}" download="${E(name)}">📎 <span>${E(name)}</span> <small>${fsize(d)}</small></a>`
  },
  pendView = () => pend ? `<div class=pbox>${isImgData(pend.data) ? `<img class=pth src="${safeData(pend.data)}" alt="">` : '<span class=pfi>📎</span>'}<span class=pfn>${E(pend.name)}</span><button type=button class=pdx aria-label="Remove file" onclick="pend=null;render()">✕</button></div>` : '',
  clip = '<svg viewBox="0 0 24 24" width=20 height=20 fill=none stroke=currentColor stroke-width=2 stroke-linecap=round stroke-linejoin=round aria-hidden=true><path d="M21 11l-9 9a5 5 0 0 1-7-7l9-9a3.5 3.5 0 0 1 5 5l-9 9a2 2 0 0 1-3-3l8-8"/></svg>';

function lightbox(img) {
  closeLb();
  const o = document.createElement('div');
  o.id = 'lbx';
  o.className = 'lbx';
  o.setAttribute('role', 'dialog');
  o.setAttribute('aria-label', 'Image viewer');
  o.innerHTML = '<button class=lbc type=button aria-label=Close>✕</button><img alt=""><a class=lbd>⬇ Download</a>';
  const i = o.querySelector('img'),
    a = o.querySelector('a');
  i.src = img.src;
  i.alt = img.alt;
  a.href = img.src;
  a.download = img.alt || 'image';
  o.onclick = e => {
    if (e.target.tagName != 'IMG' && !e.target.closest('a')) closeLb()
  };
  document.body.append(o);
  o.querySelector('button').focus()
}
const closeLb = () => {
  const o = $('lbx');
  if (o) o.remove()
};

// Reads a file. Big photos are shrunk to fit the 150 KB limit, so phone pictures just work.
async function readFile(f) {
  const raw = await new Promise((ok, no) => {
    const r = new FileReader();
    r.onload = () => ok(r.result);
    r.onerror = no;
    r.readAsDataURL(f)
  });
  if (raw.length * .75 <= MAXB) return {name: f.name, data: raw};
  if (!/^image\/(png|jpeg|webp)$/.test(f.type)) {
    toast(`${f.name} is too large (max 150 KB).`);
    return null
  }
  const img = await new Promise((ok, no) => {
    const i = new Image();
    i.onload = () => ok(i);
    i.onerror = no;
    i.src = raw
  });
  let sc = Math.min(1, 1280 / Math.max(img.naturalWidth, img.naturalHeight)),
    q = .82;
  for (let n = 0; n < 10; n++) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(img.naturalWidth * sc));
    c.height = Math.max(1, Math.round(img.naturalHeight * sc));
    const x = c.getContext('2d');
    x.fillStyle = '#fff';
    x.fillRect(0, 0, c.width, c.height);
    x.drawImage(img, 0, 0, c.width, c.height);
    const d = c.toDataURL('image/jpeg', q);
    if (d.length * .75 <= MAXB) return {name: f.name.replace(/\.\w+$/, '')+'.jpg', data: d};
    q = Math.max(.5, q-.06);
    sc *= .85
  }
  toast('That picture is too large. Try a smaller one.');
  return null
}

// one file for a chat message or a task submission
async function pick(i) {
  const f = i.files[0];
  i.value = '';
  if (!f) return;
  const r = await readFile(f).catch(() => null);
  if (r) {
    pend = r;
    render()
  }
}

// ---- chat ---------------------------------------------------------------------------------
const quoteOf = m => `<a class=quote href="#" onclick="jumpTo('m_${m.id}');return false"><b>↩ ${E(nm(m.u))}</b><span>${E(snip(m))}</span></a>`,
  replyBar = m => `<div class=rbar><span class=rbt>↩ Replying to <b>${E(nm(m.u))}</b><q>${E(snip(m))}</q></span><button type=button class=pdx aria-label="Cancel reply" onclick="replyTo='';render()">✕</button></div>`,
  taskBub = (g, x) => `<div id="tb_${x.id}" class="bub task"><b>📝 TASK: ${E(x.title)}</b><br><small>Due: ${fd(x.due)}</small><br><a class=lk onclick="go('group','${g.id}','tasks','t_${x.id}')">[ View ]</a>${isS() ? ` <a class=lk onclick="openT='${x.id}';go('group','${g.id}','tasks','t_${x.id}')">[ Submit ]</a>` : ''}</div>`;

// reaction chips + the 🙂 picker (only three emojis, like Messenger) + the Reply button
const rxLine = (x, ro) => {
  const r = x.r || {},
    chips = RX.filter(e => (r[e] || []).length).map(e => `<button type=button class="rc${r[e].includes(me) ? ' on' : ''}"${ro ? ' disabled' : ` onclick="react('${x.id}','${e}')"`} title="${E(r[e].map(nm).join(', '))}">${e} ${r[e].length}</button>`).join('');
  if (ro) return chips ? `<div class=macts>${chips}</div>` : '';
  const mineR = RX.find(e => (r[e] || []).includes(me)),
    pk = rxOpen == x.id
      ? `<span class=rxp role=group aria-label="Pick a reaction">${RX.map(e => `<button type=button class="re${mineR == e ? ' on' : ''}" aria-label="React ${e}" onclick="react('${x.id}','${e}')">${e}</button>`).join('')}<button type=button class=rcl aria-label="Close" onclick="rxOpen='';render()">✕</button></span>`
      : `<button type=button class=mact id="rxb_${x.id}" aria-label="Add a reaction" title="React" onclick="rxOpen='${x.id}';render()">🙂</button>`;
  return `<div class=macts>${chips}${pk}<button type=button class=mact onclick="startReply('${x.id}')" title="Reply to this message">↩ Reply</button></div>`
};

const msgRow = (x, ro) => {
  const mm = x.u == me,
    q = x.rep ? D.messages.find(y => y.id == x.rep) : null;
  return `<div id="m_${x.id}" class="mrow${mm ? ' me' : ''}"><div class="bub ${mm ? 'me' : ''}"><b><i class=av>${E(nm(x.u)[0])}</i> ${E(nm(x.u))}</b> <small>(${(U(x.u) || {}).role || ''}) ${fd(x.at)}</small>${ban(x)}${q ? quoteOf(q) : x.rep ? '<div class=quote><small>Original message unavailable</small></div>' : ''}${x.text ? `<div class=mtx>${E(x.text)}</div>` : ''}${x.file ? `<div class=matt>${fileView(x.file, x.fn)}</div>` : ''}</div>${rxLine(x, ro)}</div>`
};

function vChat(g, ro) {
  const n = Date.now(),
    it = [...D.messages.filter(m => m.g == g.id).map(m => ({...m, k: 'm'})), ...D.tasks.filter(t => t.g == g.id && !isA() && (!t.pub || t.pub <= n)).map(t => ({...t, k: 't'}))].sort((a, b) => a.at-b.at),
    rep = D.messages.find(m => m.id == replyTo && m.g == g.id);
  return `<div id=chat class=chat data-g="${g.id}">${it.map(x => x.k == 't' ? taskBub(g, x) : msgRow(x, ro)).join('') || '<p class=mu>No messages yet. Say hi!</p>'}</div>`+
    (ro ? '' : `${rep ? replyBar(rep) : ''}${pendView()}
    <div class=send><label class=ibtn title="Attach a file" aria-label="Attach a file">${clip}<input type=file hidden onchange="pick(this)"></label><input id=ci placeholder="${rep ? 'Write a reply...' : 'Type a message...'}" autocomplete=off onkeydown="if(event.key=='Enter')sendMsg()"><button class=pr onclick=sendMsg()>SEND</button></div>`)
}

async function sendMsg() {
  const t = $('ci').value.trim();
  if (!t && !pend) return;
  const m = {id: uid(), g: view.g, u: me, text: t, file: pend ? pend.data : '', fn: pend ? pend.name : '', at: Date.now()};
  if (replyTo) m.rep = replyTo;
  stickNext = true;
  pend = null;
  replyTo = '';
  clr('ci');
  await put('messages', m)
}

function startReply(id) {
  replyTo = id;
  rxOpen = '';
  render();
  if ($('ci')) $('ci').focus()
}

// one reaction per person, like Messenger: tapping another emoji replaces yours, tapping the same one removes it
function react(id, e) {
  const m = D.messages.find(y => y.id == id),
    old = m.r || {},
    had = (old[e] || []).includes(me),
    r = {};
  for (const k in old) r[k] = (old[k] || []).filter(u => u != me);
  if (!had) r[e] = [...(r[e] || []), me];
  Object.keys(r).forEach(k => r[k].length || delete r[k]);
  rxOpen = '';
  put('messages', {...m, r})
}

function jumpTo(id) {
  const e = $(id);
  if (!e) return;
  e.scrollIntoView({block: 'center', behavior: 'smooth'});
  e.classList.remove('flash');
  void e.offsetWidth;
  e.classList.add('flash')
}

// ---- tasks ----------------------------------------------------------------------------------
// Instructions use a tiny, safe markup: **bold**, *italic*, __underline__ and "- " lists.
const rich = t => {
  const f = s => s.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/__(.+?)__/g, '<u>$1</u>').replace(/\*(.+?)\*/g, '<i>$1</i>');
  let h = '',
    ul = false;
  for (const l of E(t).split('\n')) {
    const li = /^\s*[-•]\s+(.*)$/.exec(l);
    if (li && !ul) {
      h += '<ul>';
      ul = true
    }
    if (!li && ul) {
      h += '</ul>';
      ul = false
    }
    h += li ? `<li>${f(li[1])}</li>` : f(l)+'<br>'
  }
  return h+(ul ? '</ul>' : '')
};

// the formatting buttons wrap the selected text in the markup above
function fmt(k) {
  const t = $('ti');
  if (!t) return;
  const a = t.selectionStart,
    b = t.selectionEnd,
    v = t.value,
    sel = v.slice(a, b),
    wrap = m => {
      t.value = v.slice(0, a)+m+sel+m+v.slice(b);
      t.setSelectionRange(a+m.length, b+m.length)
    };
  if (k == 'b') wrap('**');
  else if (k == 'i') wrap('*');
  else if (k == 'u') wrap('__');
  else if (k == 'l') {
    const ls = a ? v.lastIndexOf('\n', a-1)+1 : 0,
      bl = v.slice(ls, b).split('\n').map(x => /^\s*[-•]\s/.test(x) ? x : '- '+x).join('\n');
    t.value = v.slice(0, ls)+bl+v.slice(b);
    t.setSelectionRange(ls, ls+bl.length)
  } else {
    const c = x => x.replace(/\*\*|__|\*/g, '').replace(/^(\s*)[-•]\s+/gm, '$1');
    t.value = sel ? v.slice(0, a)+c(sel)+v.slice(b) : c(v)
  }
  t.focus()
}

async function addTaskFiles(i) {
  const fs = [...i.files];
  i.value = '';
  for (const f of fs) {
    if (tAtt.length >= 4) {
      toast('You can attach up to 4 files.');
      break
    }
    const r = await readFile(f).catch(() => null);
    if (r) tAtt.push(r)
  }
  render()
}

const rmFile = i => {
    tAtt.splice(i, 1);
    render()
  },
  upIcon = '<svg viewBox="0 0 24 24" width=20 height=20 fill=none stroke=currentColor stroke-width=2 stroke-linecap=round stroke-linejoin=round aria-hidden=true><path d="M12 16V4"/><path d="M7 9l5-5 5 5"/><path d="M4 20h16"/></svg>';

// Post ▾ menu and the schedule dialog
function togglePost(ev) {
  ev.stopPropagation();
  pmOpen = !pmOpen;
  mOpen = nOpen = false;
  syncPops()
}

function openSched(g) {
  pmOpen = false;
  if (!$('tt').value.trim()) return toast('Add a title for the task first.');
  if (!$('td').value) return toast('Set the due date and time first.');
  const d = new Date(Date.now()+864e5),
    p = n => String(n).padStart(2, '0');
  schD = {g, d: `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`, t: '08:00'};
  render();
  if ($('sd_d')) $('sd_d').focus()
}

const closeSched = () => {
    schD = null;
    render()
  },
  schedDialog = () => `<div class=mback onclick="if(event.target==this)closeSched()"><div class=mdlg role=dialog aria-modal=true aria-labelledby=sdt>
    <h3 id=sdt>Schedule task</h3>
    <div class=fld><label for=sd_d>Scheduled date</label><input id=sd_d type=date value="${schD.d}"></div>
    <div class=fld><label for=sd_t>Time</label><input id=sd_t type=time value="${schD.t}"></div>
    <p class=hint>Students will see this task from then on. Until then only you can see it.</p>
    <div class=mbtns><button type=button onclick=closeSched()>Cancel</button><button type=button class=pr onclick=doSched()>Schedule</button></div></div></div>`;

function doSched() {
  const d = $('sd_d').value,
    t = $('sd_t').value,
    ts = new Date(`${d}T${t}`).getTime();
  if (!d || !t || isNaN(ts)) return toast('Pick a date and a time.');
  if (ts <= Date.now()+30e3) return toast('Choose a time in the future.');
  postTask(schD.g, ts)
}

function cancelTask() {
  tAtt = [];
  pmOpen = false;
  clr('tt', 'ti', 'td');
  render()
}

async function postTask(g, pub) {
  pmOpen = false;
  const t = $('tt').value.trim(),
    d = new Date($('td').value).getTime();
  if (!t) return toast('Add a title for the task.');
  if (isNaN(d)) return toast('Set the due date and time.');
  if (pub && d <= pub) return toast('The due date must be after the scheduled time.');
  const doc = {id: uid(), g, title: t, ins: $('ti').value.trim(), due: d, by: me, at: pub || Date.now(), files: tAtt};
  if (pub) doc.pub = pub;
  tAtt = [];
  schD = null;
  clr('tt', 'ti', 'td');
  await put('tasks', doc);
  toast(pub ? `Task scheduled for ${fd(pub)}.` : 'Task posted.')
}

// the composer, laid out like Google Classroom: only one attach button (upload a file)
const composer = g => `<div class="box comp">
  <div class=cfor><span>For</span><span class=cchip>${E(g.name)}</span><span class="cchip soft">👥 All students</span></div>
  <input id=tt class=ctitle placeholder="Task title" autocomplete=off>
  <textarea id=ti rows=4 placeholder="Instructions (optional). Tell students what to do."></textarea>
  <div class=ctools role=toolbar aria-label="Text formatting">${[['b', '<b>B</b>', 'Bold'], ['i', '<i>I</i>', 'Italic'], ['u', '<u>U</u>', 'Underline'], ['l', '•≡', 'Bulleted list'], ['x', 'Tx', 'Clear formatting']].map(([k, l, t]) => `<button type=button class=ft title="${t}" aria-label="${t}" onmousedown="event.preventDefault()" onclick="fmt('${k}')">${l}</button>`).join('')}<span class=chint>Formatting shows after you post</span></div>
  ${tAtt.length ? `<div class=tatts>${tAtt.map((f, i) => `<div class=tat>${isImgData(f.data) ? `<img src="${safeData(f.data)}" alt="">` : '<span class=pfi>📎</span>'}<span class=pfn>${E(f.name)}</span><button type=button class=pdx aria-label="Remove ${E(f.name)}" onclick="rmFile(${i})">✕</button></div>`).join('')}</div>` : ''}
  <div class=cdue><label for=td>Due date and time</label><input id=td type=datetime-local></div>
  <div class=cbar>
    <label class=cup title="Upload file" aria-label="Upload file">${upIcon}<input type=file multiple hidden onchange="addTaskFiles(this)"></label>
    <span class=cgap></span>
    <button type=button class=cx onclick=cancelTask()>Cancel</button>
    <div class=split><button type=button class="pr sp1" onclick="postTask('${g.id}')">Post</button><button type=button id=pcaret class="pr sp2" aria-label="More posting options" aria-haspopup=menu aria-expanded="${pmOpen}" onclick="togglePost(event)">▾</button>
    <div id=pmenu class=pmenu role=menu${pmOpen ? '' : ' hidden'}><button type=button role=menuitem onclick="postTask('${g.id}')">Post now</button><button type=button role=menuitem onclick="openSched('${g.id}')">🕒 Schedule…</button></div></div>
  </div></div>`;

function vTasks(g) {
  const can = isT() && g.teacher == me,
    ts = D.tasks.filter(t => t.g == g.id && (!isT() || t.by == me)).sort((a, b) => a.due-b.due);
  return (can ? composer(g) : '')+(ts.map(t => card(t, can)).join('') || '<p class=mu>No tasks yet.</p>')
}

function card(t, can) {
  const subs = D.subs.filter(s => s.t == t.id),
    sched = t.pub && t.pub > Date.now();
  let b = '';
  if (can) b = `<div class=ov><table>
    <tr><th>Student<th>Submitted<th>Status<th>Work<th>Score</tr>
    ${subs.map(s => `<tr><td>${E(nm(s.u))}<td>${fd(s.at)}<td class="s-${s.status}">${s.status}<td>${s.text ? `<div>${E(s.text)}</div>` : ''}${fileView(s.file, s.fn)}<td><input class=sc id="sc${s.id}" value="${E(s.score)}" onchange="score('${s.id}',this.value)"></tr>`).join('')}</table></div>${subs.length ? '' : '<p class=mu>No submissions yet.</p>'}`;
  else if (isS()) {
    const s = subs.find(y => y.u == me);
    b = s ? `<div class=sub><b>Your submission</b>${s.text ? `<p>${E(s.text)}</p>` : ''}${fileView(s.file, s.fn)}<p>Score: ${E(s.score) || '—'}</p></div>`
      : openT == t.id ? `<textarea id=sa placeholder="Your answer"></textarea>${pendView()}<div class=srow><label class=ibtn title="Attach a file" aria-label="Attach a file">${clip}<input type=file hidden onchange="pick(this)"></label><button class=pr onclick="submitTask('${t.id}')">Submit</button><button onclick="openT='';pend=null;render()">Cancel</button></div>`
      : `<button onclick="openT='${t.id}';render()">Submit</button>`
  }
  return `<div id="t_${t.id}" class=box><b>${E(t.title)}</b> — Due: ${fd(t.due)} ${isS() ? badge(t) : ''}${sched ? ` <span class=tsched>🕒 Scheduled · posts ${fd(t.pub)}</span>` : ''}
    ${t.ins ? `<div class=rich>${rich(t.ins)}</div>` : ''}${t.files && t.files.length ? `<div class=tfiles>${t.files.map(f => fileView(f.data, f.name)).join('')}</div>` : ''}${b}</div>`
}

async function submitTask(id) {
  const t = D.tasks.find(x => x.id == id),
    x = $('sa').value.trim();
  if (!x && !pend) return toast('Type an answer or attach a file.');
  const now = Date.now();
  await put('subs', {id: id+'_'+me, t: id, u: me, text: x, file: pend ? pend.data : '', fn: pend ? pend.name : '', at: now, status: now > t.due ? 'late' : 'submitted', score: ''});
  pend = null;
  openT = '';
  render()
}

function score(id, v) {
  put('subs', {...D.subs.find(s => s.id == id), score: v})
}

function vMembers(g) {
  const ms = D.members.filter(m => m.g == g.id),
    add = D.users.filter(u => u.role != 'Admin' && u.status == 'Active' && !ms.some(m => m.u == u.id));
  return `<div class=ov>
    <table>
    <tr><th>Name<th>Role<th>ID<th></tr>${ms.map(m=>`<tr><td>${E(nm(m.u))}<td>${(U(m.u)||{}).role}<td>${E((U(m.u)||{}).sid)}<td>${isA()&&m.u!=g.teacher?`<button onclick="del('members','${m.id}')">Remove</button>`:''}</tr>`).join('')}
    </table></div>`+(isA() ? `<p><select id=ms>${add.map(u=>`<option value="${u.id}">${E(u.name)} (${u.role})`).join('')}</select> <button class=pr onclick="addMem('${g.id}')">Add member</button></p>` : '')
}

function addMem(g) {
  const u = $('ms').value;
  if (u) put('members', {id: g+'_'+u, g, u, j: U(u).role != 'Student', at: Date.now()})
}

// ==============================================================
// TASKS AND ANNOUNCEMENTS PAGES
// ==============================================================
function tasksPage() {
  const ts = D.tasks.filter(t => !isA() && ids().includes(t.g) && (!isT() || t.by == me) && mt(t.title)).sort((a, b) => a.due-b.due);
  return `<h3>Tasks</h3>
    <div class=ov>
    <table>
    <tr><th>Task<th>Group<th>Deadline<th>${isS()?'Status':'Submissions'}</tr>${ts.map(t=>`<tr class=lk onclick="go('group','${t.g}','tasks','t_${t.id}')"><td>${E(t.title)}${t.pub>Date.now()?' <small>🕒 scheduled</small>':''}<td>${E(gn(t.g))}<td>${fd(t.due)}<td>${isS()?badge(t):D.subs.filter(s=>s.t==t.id).length}</tr>`).join('')}
    </table></div>`
}

function annsPage() {
  const as = D.anns.filter(a => vis(a) && mt(a.title+a.body)).sort((a, b) => b.at-a.at);
  return `<h3>Announcements</h3>${isA()||isT()?`<div class=box><b>${isA()?'📣 Announce to the whole school':'Post to your students'}</b><select id=ag${isA()?' hidden':''}><option value="*">All my groups${mine().map(g=>`<option value="${g.id}">${E(g.name)}`).join('')}</select><input id=an_t placeholder="Title"><textarea id=an_b placeholder="Message"></textarea><button class=pr onclick=postAnn()>Post</button></div>`:''}${as.map(a=>`<div id="a_${a.id}" class=box${a.g=='all'?' style="border:2px solid var(--g)"':''}><b>${a.g=='all'?'📣 ':''}${E(a.title)}</b> <small>${E(gn(a.g))} · ${E(nm(a.by))} · ${fd(a.at)}</small>
      <p>${E(a.body)}</p></div>`).join('')||'<p class=mu>No announcements.</p>'}`
}

async function postAnn() {
  const t = $('an_t').value.trim(),
    b = $('an_b').value.trim(),
    s = isA() ? 'all' : $('ag').value;
  if (!t || !b) return toast('Add a title and a message.');
  for (const g of s == 'all' ? [{id: 'all'}] : s == '*' ? mine() : [G(s)]) await put('anns', {id: uid(), g: g.id, title: t, body: b, by: me, at: Date.now()});
  clr('an_t', 'an_b');
  toast('Announcement posted.')
}

// ==============================================================
// ADMIN ACTIONS AND PROFILE
// ==============================================================
function tog(id) {
  if (id == me) return toast('You can’t ban your own account.');
  const u = U(id),
    to = u.status == 'Active' ? 'Banned' : 'Active';
  put('users', {...u, status: to});
  toast(to == 'Banned' ? `${u.name} is banned and has been logged out.` : `${u.name} can log in again.`)
}

function rstAsk(id) {
  arm('rst:'+id, () => rst(id))
}

async function rst(id) {
  const u = U(id);
  await put('users', {...u, pw: u.sid});
  toast(`${u.name}’s password is now ${u.sid}. Ask them to change it in Profile.`)
}

function profile() {
  const u = cu(),
    A = u.role == 'Admin',
    role = A ? 'Administrator' : u.role,
    row = (l, v) => `<div class=prow><span>${l}</span><b>${E(v)}</b></div>`;
  return `<h3 class=ph>Profile</h3>
    <div class="box fm"><div class=pf><i class=kav>${E((u.name || '?')[0])}</i><div><b>${E(u.name)}</b><small>${role}</small></div></div>
    ${A ? row('Login email', u.email || '—') : row(LBL[u.role], u.sid)}${u.role == 'Student' ? row('Section', u.sec || '—') : ''}${row('Role', role)}</div>
    <div class="box fm"><div class=bh><b>Change password</b><small>Use 6 or more characters.</small></div>
    <div class=fg><div class=fld><label for=op>Current password</label><input id=op type=password autocomplete=current-password></div>
    <div class=fld><label for=np2>New password</label><input id=np2 type=password autocomplete=new-password placeholder="6+ characters" onkeydown="if(event.key=='Enter')chpw()"></div>
    <div class=fld><button class=pr onclick=chpw()>Update password</button></div></div></div>`
}

async function chpw() {
  const n = $('np2').value;
  if (n.length < 6) return toast('New password must be 6+ characters.');
  const r = await api('passwd', {old: $('op').value, new: n});
  if (!r || r.error) return toast((r && r.error) || 'Could not update the password.');
  clr('op', 'np2');
  toast('Password updated.')
}

// ==============================================================
// ROLE DASHBOARDS: tiles, class cards and the admin screens
// ==============================================================
const tile = (n, l, k) => `<div${k ? ` id=tile_${k.replace(/ /g, '_')}` : ''} class="tile${k ? ' lk' : ''}${k && view.l == k ? ' sel' : ''}"${k ? ` role=button tabindex=0 aria-pressed="${view.l == k}" onclick="showL('${k}')" onkeydown="if(event.key=='Enter'||event.key==' '){event.preventDefault();showL('${k}')}"` : ''}><i>${ic[l] || ''}</i><b>${n}</b><span>${l}</span></div>`;
const cdG = (g, m) => `<div class=cd style="border-top:5px solid hsl(${hh(g.subject)},55%,45%)"><b>${E(g.subject)}</b><small>${E(g.name)}</small><span>${E(g.time)}</span><span class=mu>${E(nm(g.teacher))}</span>${m&&m.j===false?`<button class=pr onclick="joinG('${m.id}')">Join Group Chat</button>`:`<button onclick="go('group','${g.id}')">Open chat</button>`}</div>`;
const joinG = id => {
  put('members', {...D.members.find(x => x.id == id), j: true});
  toast('You joined the class chat.')
};

function dash() {
  const r = cu().role,
    i = ids(),
    u = D.users;
  if (r == 'Admin') return `<div class=tiles>${tile(u.filter(x=>x.role=='Student').length,'Students','Students')}${tile(u.filter(x=>x.role=='Teacher').length,'Teachers','Teachers')}${tile(D.groups.filter(act).length,'Active schedules','Active schedules')}${tile(D.groups.filter(g=>!act(g)).length,'Archived','Archived')}</div>${lp()}
    <div class=qa><button class=pr onclick="manage('sched')">📅 Build schedule</button><button onclick="manage('users','Student')">🎓 Add students</button><button onclick="manage('users','Teacher')">👩‍🏫 Add teachers</button></div>`;
  if (r == 'Teacher') {
    const my = D.tasks.filter(t => t.by == me).map(t => t.id);
    return `<div class=tiles>${tile(i.length,'My classes')}${tile(my.length,'Tasks posted')}${tile(D.subs.filter(s=>my.includes(s.t)&&!s.score).length,'To grade')}</div><b>MY CLASSES</b>
      <div class=cds>${mine().map(g=>cdG(g)).join('')||'<p class=mu>No classes assigned yet.</p>'}</div>`
  }
  const ms = D.members.filter(m => m.u == me && G(m.g) && act(G(m.g))),
    todo = D.tasks.filter(t => i.includes(t.g) && stat(t) == 'pending').length;
  return `<div class=tiles>${tile(i.length,'Subjects joined')}${tile(todo,'Tasks to do')}</div>${prog()}<b>MY SUBJECTS</b>
    <div class=cds>${ms.map(m=>cdG(G(m.g),m)).join('')||'<p class=mu>No subjects yet. The admin enrolls you when your section’s schedule is built.</p>'}</div>`
}

// ---- helpers used by the Manage pages ------------------------------------------------
const byName = (a, b) => a.name.localeCompare(b.name),
  idTaken = sid => D.users.some(u => (u.sid || '').toLowerCase() == sid.toLowerCase()),
  nStu = g => D.members.filter(m => m.g == g.id && (U(m.u) || {}).role == 'Student').length,
  secList = () => [...new Set(D.users.filter(u => u.role == 'Student' && u.sec).map(u => u.sec))].sort(),
  classesOf = u => D.groups.filter(g => g.teacher == u.id && act(g)).map(g => `${E(g.subject)} <small>${E(g.section || '')}</small>`).join('<br>') || '<span class=mu>None yet</span>',
  pill = u => `<span class="pill ${u.status == 'Active' ? 'ok' : 'bad'}">${u.status}</span>`,
  fld = (id, label, ph, enter, extra = '') => `<div class=fld><label for=${id}>${label}</label><input id=${id} placeholder="${ph}" autocomplete=off ${extra} onkeydown="if(event.key=='Enter')${enter}"></div>`,
  // a table that turns into stacked cards on phones. heads[i] === '' marks the actions column
  rtable = (heads, rows, empty) => rows.length
    ? `<div class=ov><table class=rs><thead><tr>${heads.map(h => `<th>${h || '<span class=sr>Actions</span>'}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr${r.off ? ' class=off' : ''}>${r.c.map((c, i) => `<td data-l="${heads[i]}"${heads[i] ? '' : ' class=ac'}>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`
    : `<div class="box empty">${empty}</div>`;
const DAYS = [['Mon', 'Monday'], ['Tue', 'Tuesday'], ['Wed', 'Wednesday'], ['Thu', 'Thursday'], ['Fri', 'Friday'], ['Sat', 'Saturday']],
  dayNo = d => DAYS.findIndex(x => x[0] == d),
  tm12 = t => {
    const [h, m] = t.split(':').map(Number);
    return `${h % 12 || 12}:${String(m).padStart(2, '0')}`
  },
  tmAP = t => +t.split(':')[0] < 12 ? 'AM' : 'PM',
  tmSpan = (a, e) => tmAP(a) == tmAP(e) ? `${tm12(a)}–${tm12(e)} ${tmAP(e)}` : `${tm12(a)} ${tmAP(a)}–${tm12(e)} ${tmAP(e)}`;

// two-tap confirmation: the first tap arms the button, the second one runs it (resets after 4 seconds)
function arm(key, run) {
  clearTimeout(armT);
  if (armed == key) {
    armed = '';
    return run()
  }
  armed = key;
  armT = setTimeout(() => {
    armed = '';
    render()
  }, 4000);
  render()
}

// jump to a Manage tab (and, for Accounts, to the Students or Teachers page)
function manage(at, ac) {
  view = {p: 'admin', tab: 'chat', at, ac: ac || view.ac || 'Student'};
  nOpen = false;
  mOpen = false;
  render();
  scrollTo({top: 0, behavior: 'smooth'})
}

function openArchive() {
  go('home');
  view.l = 'Archived';
  render()
}

// ---- Manage: Overview / Accounts / Schedules ----------------------------------------
function adminV() {
  const T = view.at || 'ov',
    tabs = [['ov', 'Overview'], ['users', 'Accounts'], ['sched', 'Schedules']].map(([k, l]) => `<button id=tab_${k} class="tab ${T == k ? 'on' : ''}" aria-pressed="${T == k}" onclick="view.at='${k}';render()">${l}</button>`).join('');
  return `<h3 class=ph>Manage</h3><div class=gh><span class=tabs>${tabs}</span></div>${T == 'ov' ? overviewV() : T == 'users' ? accountsV() : schedV()}`
}

const overviewV = () => dash()+`<div class="box fm"><div class=bh><b>How it works</b></div>
  <ol class=steps>
  <li>Add students and teachers under <b>Accounts</b>.</li>
  <li>Build a schedule: section, subject, teacher, days and time. The class chat is created and every student in that section is enrolled.</li>
  <li>Students tap <b>Join Group Chat</b> on their dashboard.</li>
  <li>When the term ends, archive the schedules. They leave <b>Schedules</b> and wait in <b>Archived</b> on the Dashboard until you restore them.</li>
  </ol></div>`;

// ---- Accounts: Students and Teachers each have their own page ---------------------
function accountsV() {
  const r = view.ac == 'Teacher' ? 'Teacher' : 'Student',
    seg = ['Student', 'Teacher'].map(x => `<button id=seg_${x} class="${r == x ? 'on' : ''}" aria-pressed="${r == x}" onclick="view.ac='${x}';render()">${x == 'Student' ? '🎓 Students' : '👩‍🏫 Teachers'} <span>${D.users.filter(u => u.role == x).length}</span></button>`).join('');
  return `<div class=seg role=group aria-label="Account type">${seg}</div>${r == 'Student' ? studentForms() : teacherForm()}${userList(r)}`
}

const studentForms = () => `<div class="box fm"><div class=bh><b>Add one student</b><small>The Student ID is what they type to log in.</small></div>
  <div class=fg>${fld('st_id', 'Student ID', '2022-0001', 'addStudent()')}${fld('st_name', 'Full name', 'Juan Dela Cruz', 'addStudent()')}${fld('st_sec', 'Section', 'BSIT 3-6', 'addStudent()', 'list=secl')}${fld('st_pw', 'Temporary password', '6+ characters', 'addStudent()')}
  <div class=fld><button class=pr onclick=addStudent()>Add student</button></div></div>
  <datalist id=secl>${secList().map(s => `<option value="${E(s)}">`).join('')}</datalist>
  <p class=hint>Give the student this password. They can change it later in Profile.</p></div>
  <div class="box fm"><div class=bh><b>Add many students</b><small>One student per line: Student ID, Full name, Section, Password. Leave the password out to use the Student ID.</small></div>
  <textarea id=bk rows=4 placeholder="2022-0100, Ana Cruz, BSIT 3-6, pass1234&#10;2022-0101, Ben Reyes, BSIT 3-6, pass5678"></textarea>
  <button class=pr onclick=bulk()>Add all students</button></div>`;

const teacherForm = () => `<div class="box fm"><div class=bh><b>Add one teacher</b><small>The Faculty ID is what they type to log in.</small></div>
  <div class=fg>${fld('tc_id', 'Faculty ID', 'T-001', 'addTeacher()')}${fld('tc_name', 'Full name', 'Maria Reyes', 'addTeacher()')}${fld('tc_pw', 'Temporary password', '6+ characters', 'addTeacher()')}
  <div class=fld><button class=pr onclick=addTeacher()>Add teacher</button></div></div>
  <p class=hint>Give the teacher this password. Classes are assigned when you build a schedule.</p></div>`;

function userList(r) {
  const st = r == 'Student',
    all = D.users.filter(u => u.role == r),             // the admin account is never listed here
    L = all.filter(u => mt(`${u.name} ${u.sid} ${u.sec || ''}`)).sort(byName),
    plural = r.toLowerCase()+'s',
    rows = L.map(u => {
      const on = u.status == 'Active',
        a = armed == 'rst:'+u.id;
      return {off: !on, c: [E(u.sid), `<span class=nm>${E(u.name)}</span>`, st ? E(u.sec) || '—' : classesOf(u), pill(u),
        `<button class=sm onclick="tog('${u.id}')">${on ? '🚫 Ban' : 'Unban'}</button><button class="sm${a ? ' warn' : ''}" onclick="rstAsk('${u.id}')">${a ? 'Tap again to confirm' : 'Reset password'}</button>`]}
    });
  return `<div class=th><b>${r}s <span class=cnt>${all.length}</span></b>${q ? `<small>Results for “${E(q)}”</small>` : ''}</div>`+
    rtable([LBL[r], 'Name', st ? 'Section' : 'Classes', 'Status', ''], rows,
      all.length ? `No ${plural} match “${E(q)}”.` : `No ${plural} yet. ${st ? 'Add one above or paste a list.' : 'Add one above, then build a schedule for them.'}`)
}

// new students are enrolled right away in the active schedules of their section
async function enrollNew(uId, sec) {
  const now = Date.now();
  let n = 0;
  for (const g of D.groups.filter(g => act(g) && (g.section || '').toLowerCase() == sec.toLowerCase())) {
    await put('members', {id: g.id+'_'+uId, g: g.id, u: uId, j: false, at: now});
    n++
  }
  return n
}

async function addStudent() {
  const v = k => $(k).value.trim(),
    sid = v('st_id'),
    n = v('st_name'),
    sec = v('st_sec'),
    pw = $('st_pw').value;
  if (!sid || !n || !sec || pw.length < 6) return toast('Enter the Student ID, full name, section and a temporary password (6+ characters).');
  if (idTaken(sid)) return toast(`${sid} already belongs to another account.`);
  const id = await mk(sid, n, '', 'Student', pw, sec),
    k = await enrollNew(id, sec);
  clr('st_id', 'st_name', 'st_pw');
  toast(`${n} was added to ${sec}.${k ? ` Enrolled in ${k} class chat${k > 1 ? 's' : ''}.` : ''}`);
  $('st_id') && $('st_id').focus()
}

async function addTeacher() {
  const v = k => $(k).value.trim(),
    sid = v('tc_id'),
    n = v('tc_name'),
    pw = $('tc_pw').value;
  if (!sid || !n || pw.length < 6) return toast('Enter the Faculty ID, full name and a temporary password (6+ characters).');
  if (idTaken(sid)) return toast(`${sid} already belongs to another account.`);
  await mk(sid, n, '', 'Teacher', pw);
  clr('tc_id', 'tc_name', 'tc_pw');
  toast(`${n} was added. You can now choose them when you build a schedule.`);
  $('tc_id') && $('tc_id').focus()
}

async function bulk() {
  const rows = $('bk').value.split('\n').map(l => l.split(',').map(x => x.trim())).filter(r => r[0]);
  if (!rows.length) return toast('Paste at least one line: Student ID, Full name, Section, Password.');
  let n = 0,
    bad = 0,
    dup = 0,
    weak = 0;
  for (const r of rows) {
    const [sid, name, sec] = r,
      given = r.slice(3).join(',').trim(),              // a password may contain commas
      pw = given || sid;                                 // no password on the line: use the Student ID
    if (!name || !sec) {
      bad++;
      continue
    }
    if (given && given.length < 6) {
      weak++;
      continue
    }
    if (idTaken(sid)) {
      dup++;
      continue
    }
    await enrollNew(await mk(sid, name, '', 'Student', pw, sec), sec);
    n++
  }
  clr('bk');
  toast(`${n} student${n == 1 ? '' : 's'} added.${dup ? ` ${dup} skipped: ID already exists.` : ''}${bad ? ` ${bad} skipped: each line needs an ID, a name and a section.` : ''}${weak ? ` ${weak} skipped: a password needs 6 or more characters.` : ''}`)
}

// ---- Schedules ---------------------------------------------------------------------
function pickDay(d, b) {
  sd = sd.includes(d) ? sd.filter(x => x != d) : [...sd, d];
  b.classList.toggle('on', sd.includes(d));
  b.setAttribute('aria-pressed', sd.includes(d))
}

function schedV() {
  const tc = D.users.filter(u => u.role == 'Teacher' && u.status == 'Active').sort(byName),
    all = D.groups.filter(act).sort((a, b) => (a.section || '').localeCompare(b.section || '') || (a.subject || '').localeCompare(b.subject || '')),
    L = all.filter(g => mt(`${g.section} ${g.subject} ${g.time} ${nm(g.teacher)}`)),
    nA = D.groups.filter(g => !act(g)).length,
    form = tc.length ? `<div class="box fm"><div class=bh><b>Build a schedule</b><small>Creates the class chat and enrolls every student in that section.</small></div>
      <div class=fg>${fld('gsc', 'Section', 'BSIT 3-6', 'addSched()', 'list=gsl')}${fld('gsb', 'Subject', 'INSY 55', 'addSched()')}
      <div class=fld><label for=gtc>Teacher</label><select id=gtc><option value="" disabled selected>Select a teacher</option>${tc.map(t => `<option value="${t.id}">${E(t.name)} (${E(t.sid)})</option>`).join('')}</select></div>
      <div class="fld wide"><label id=dl>Days <small>Tap the days this class meets</small></label>
      <div class=days role=group aria-labelledby=dl>${DAYS.map(([s, f]) => `<button type=button class="day${sd.includes(s) ? ' on' : ''}" aria-pressed="${sd.includes(s)}" aria-label="${f}" title="${f}" onclick="pickDay('${s}',this)">${s}</button>`).join('')}</div></div>
      <div class="fld half"><label for=g1>Time in</label><input id=g1 type=time></div>
      <div class="fld half"><label for=g2>Time out</label><input id=g2 type=time></div>
      <div class=fld><button class=pr onclick=addSched()>Create schedule</button></div></div>
      <datalist id=gsl>${secList().map(s => `<option value="${E(s)}">`).join('')}</datalist></div>`
    : `<div class="box fm empty"><div class=bh><b>Build a schedule</b></div><p>Add a teacher first, so you can choose who teaches the subject.</p><button class=pr onclick="manage('users','Teacher')">Add a teacher</button></div>`,
    rows = L.map(g => ({c: [E(g.section || g.name), E(g.subject), E(g.time), E(nm(g.teacher)), nStu(g),
      `<button class=sm onclick="go('group','${g.id}','members')">Members</button><button class=sm onclick="go('group','${g.id}')">View chat</button><button class=sm onclick="arch('${g.id}')">🗄️ Archive</button>`]}));
  return `${form}<div class=th><b>Schedules <span class=cnt>${all.length}</span></b><span class=tools><button class=sm onclick=openArchive()>🗄️ Archived (${nA})</button>${all.length ? `<button class="sm${armed == 'all' ? ' warn' : ''}" onclick=archAll()>${armed == 'all' ? 'Tap again to archive all' : 'Archive all'}</button>` : ''}</span></div>`+
    rtable(['Section', 'Subject', 'Days and time', 'Teacher', 'Students', ''], rows,
      all.length ? `No schedules match “${E(q)}”.` : 'No active schedules yet. Build one above, or restore one from Archived.')
}

async function addSched() {
  const sc = $('gsc').value.trim(),
    sb = $('gsb').value.trim(),
    t = $('gtc').value,
    a = $('g1').value,
    e = $('g2').value;
  if (!sc || !sb) return toast('Enter the section and the subject.');
  if (!t) return toast('Choose the teacher who will teach this subject.');
  if (!sd.length) return toast('Tap at least one day, Monday to Saturday.');
  if (!a || !e) return toast('Set the time in and the time out.');
  if (e <= a) return toast('Time out must be later than time in.');
  const days = [...sd].sort((x, y) => dayNo(x)-dayNo(y)),
    tm = `${days.join(', ')} · ${tmSpan(a, e)}`,
    clash = D.groups.find(g => act(g) && g.days && g.start && g.end && g.days.some(d => days.includes(d)) && g.start < e && a < g.end &&
      (g.teacher == t || (g.section || '').toLowerCase() == sc.toLowerCase()));
  if (clash) return toast(clash.teacher == t ? `${nm(t)} already teaches ${clash.subject} (${clash.section}) on ${clash.time}.` : `${clash.section} already has ${clash.subject} on ${clash.time}.`);
  const g = uid(),
    now = Date.now();
  let n = 0;
  await put('groups', {id: g, name: sc+'_'+sb, section: sc, type: 'Class', subject: sb, time: tm, days, start: a, end: e, teacher: t, by: me, at: now});
  await put('members', {id: g+'_'+t, g, u: t, j: true, at: now});
  for (const s of D.users.filter(u => u.role == 'Student' && u.status == 'Active' && (u.sec || '').toLowerCase() == sc.toLowerCase())) {
    await put('members', {id: g+'_'+s.id, g, u: s.id, j: false, at: now});
    n++
  }
  sd = [];
  clr('gsc', 'gsb', 'gtc', 'g1', 'g2');
  render();
  toast(n ? `Schedule created. ${n} student${n > 1 ? 's' : ''} enrolled in ${sc}.` : `Schedule created. No students are in ${sc} yet. They’ll be enrolled when you add them.`)
}

// Archive moves a schedule out of Schedules; Restore (on the Dashboard, under Archived) brings it back
function arch(id) {
  const g = G(id),
    to = !g.arch;
  put('groups', {...g, arch: to});
  toast(to ? `${g.subject} (${g.section || g.name}) moved to Archived. Restore it from the Dashboard.` : `${g.subject} (${g.section || g.name}) restored. It’s back in Schedules.`)
}

function archAll() {
  arm('all', async () => {
    const L = D.groups.filter(act);
    for (const g of L) await put('groups', {...g, arch: true});
    toast(`${L.length} schedule${L.length == 1 ? '' : 's'} moved to Archived.`)
  })
}

// ==============================================================
// HERO BANNER AND ICONS
// ==============================================================
const ic = {Students: '🎓', Teachers: '👩‍🏫', 'Active schedules': '📅', Archived: '🗄️', 'My classes': '🏫', 'Tasks posted': '📝', 'To grade': '✅', 'Subjects joined': '📚', 'Tasks to do': '⏳'},
  RI = {Admin: ['🛡️', 'Manage accounts, schedules and class chats.'], Teacher: ['👩‍🏫', 'Your classes, tasks and announcements in one place.'], Student: ['🎓', 'Your subjects, tasks and class chats in one place.']};
const hero = () => {
  const r = cu().role;
  return `<div class=hero>
    <div class=hi>${RI[r][0]}</div>
    <div>
    <h2>${r} Dashboard</h2>
    <div>${gr()}, ${E(cu().name)}!</div><small>${RI[r][1]}</small></div></div>`
};

// ==============================================================
// ADMIN: tappable tiles and read-only chat monitor
// ==============================================================
const showL = k => {
  view.l = view.l == k ? '' : k;
  render()
};
const vMon = g => vChat(g, true)+'<p class=mon>👁️ Monitoring mode: admins can read class chats to keep them safe, but can’t send messages. Use 🚫 Ban on a student’s message if they break the rules.</p>';
const lp = () => {
  const k = view.l;
  if (!k) return '';
  let title, note = '', h;
  if (k == 'Students' || k == 'Teachers') {
    const r = k.slice(0, -1),
      st = r == 'Student',
      L = D.users.filter(u => u.role == r).sort(byName);
    title = `${k} (${L.length})`;
    h = rtable([LBL[r], 'Name', st ? 'Section' : 'Classes', 'Status'], L.map(u => ({off: u.status != 'Active', c: [E(u.sid), E(u.name), st ? E(u.sec) || '—' : classesOf(u), pill(u)]})),
      `No ${k.toLowerCase()} yet.`)
  } else {
    const a = k == 'Active schedules',
      L = D.groups.filter(g => act(g) == a).sort((x, y) => (y.at || 0)-(x.at || 0));
    title = `${a ? 'Active schedules' : 'Archived schedules'} (${L.length})`;
    if (!a) note = 'Archived schedules are hidden from Schedules and from students. Tap Restore to bring one back.';
    h = rtable(['Section', 'Subject', 'Days and time', 'Teacher', 'Students', ''], L.map(g => ({c: [E(g.section || g.name), E(g.subject), E(g.time), E(nm(g.teacher)), nStu(g),
      a ? `<button class=sm onclick="go('group','${g.id}')">View chat</button>` : `<button class="sm restore" onclick="arch('${g.id}')">↩ Restore</button>`]})),
      a ? 'No active schedules yet.' : 'Nothing archived yet. When you archive a schedule, it moves here.')
  }
  return `<div id=lpanel class="box lp"><div class=th><b>${title}</b><button class=sm onclick="showL('${k}')">✕ Close</button></div>${note ? `<p class=mu>${note}</p>` : ''}${h}</div>`
};

// ==============================================================
// INTERACTIVE EXTRAS: nav buttons, greeting, reactions and progress card
// ==============================================================
const nv = (p, ic, l) => {
  const on = p == 'admin' ? ['admin', 'group'].includes(view.p) : view.p == p;
  return `<button class="nv ${on ? 'on' : ''}"${on ? ' aria-current=page' : ''} onclick="go('${p}')"><i>${ic}</i><span>${l}</span></button>`
};
const gr = () => {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
},
  hh = s => [...String(s)].reduce((a, c) => a+c.charCodeAt(0) * 7, 0) % 360;
const left = t => {
  const m = Math.max(0, Math.round((t-Date.now()) / 6e4));
  return m < 60 ? m+' min' : m < 1440 ? Math.floor(m / 60)+' h' : Math.floor(m / 1440)+' d '+Math.floor(m % 1440 / 60)+' h'
};
const prog = () => {
  const i = ids(),
    ts = D.tasks.filter(t => i.includes(t.g)),
    d = ts.filter(t => stat(t) != 'pending').length,
    p = ts.length ? Math.round(d / ts.length * 100) : 0,
    nx = ts.filter(t => stat(t) == 'pending' && t.due > Date.now()).sort((a, b) => a.due-b.due)[0];
  return `<div class=box><b>Your progress: ${p}%</b> <small>${d} of ${ts.length} tasks submitted</small>
    <div class=pb>
    <div style="width:${p}%"></div></div>${nx?`<p class=lk onclick="go('group','${nx.g}','tasks')">⏰ Next: <b>${E(nx.title)}</b> · ${E(gn(nx.g))} · due in ${left(nx.due)} →</p>`:'<p class=mu>🎉 Nothing due. You’re all caught up!</p>'}</div>`
};

// ==============================================================
// ANNOUNCEMENT VISIBILITY
// ==============================================================
const vis = a => a.g == 'all' || (isA() ? false : isT() ? a.by == me : ids().includes(a.g));

async function checkSetup() {
  const was = [DOWN, NEED, ready];
  try {
    NEED = (await (await fetch('/api/status')).json()).needsAdmin;
    DOWN = false
  } catch (e) {
    DOWN = true
  }
  ready = true;
  if (was[0] != DOWN || was[1] != NEED || !was[2]) render()
}

// ==============================================================
// SYNC LOOP AND START-UP: ask the server for changes every 2 seconds
// ==============================================================
async function sync() {
  if (!TOKEN) {
    if (!ready || DOWN) await checkSetup();
    return
  }
  try {
    const r = await fetch('/api/sync?token='+TOKEN+'&v='+VER);
    if (r.status == 401) return endSession('Your session ended. If your account was banned, contact the administrator.');
    const j = await r.json();
    ready = true;
    if (!j.same) {
      VER = j.v;
      me = j.me;
      COLS.forEach(c => D[c] = j.data[c] || []);
      render()
    }
  } catch (e) {
    ready = true;
    if (!me) render()
  }
}
setInterval(sync, 2000);
sync();
document.addEventListener('input', e => {
  if (e.target.id == 'li') try {
    sessionStorage.setItem('sc_li', e.target.value)
  } catch (_) {}
});
render();
