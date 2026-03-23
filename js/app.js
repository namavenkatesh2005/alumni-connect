// ============================================================
//  APP.JS — main application logic
// ============================================================

const APP = (() => {

  let currentUser  = null;
  let currentRole  = null;   // 'admin' | 'student'
  let alumniCache  = [];
  let activeFilter = 'All';
  let activeYear   = 'All';
  let unsubscribe  = null;   // Firestore real-time listener

  // ── Init after login
  async function initUser(user, role) {
    currentUser = user;
    currentRole = role;

    // Update top bar
    const initials = user.displayName
      ? user.displayName.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
      : user.email[0].toUpperCase();

    document.getElementById('userInitials').textContent = initials;
    document.getElementById('userName').textContent =
      (user.displayName || user.email.split('@')[0]).split(' ')[0];
    document.getElementById('userRoleLabel').textContent  = role === 'admin' ? 'Admin' : 'Student';
    document.getElementById('userRoleLabel').className    = 'role-label ' + role;

    // Show / hide add-alumni nav item for admin only
    document.getElementById('nav-add').style.display = role === 'admin' ? 'flex' : 'none';

    // Start real-time listener
    startListener();
    UI.showPage('home');
  }

  function resetState() {
    currentUser = null; currentRole = null;
    alumniCache = []; activeFilter = 'All'; activeYear = 'All';
    if (unsubscribe) { unsubscribe(); unsubscribe = null; }
  }

  // ── Firestore real-time listener
  function startListener() {
    if (unsubscribe) unsubscribe();
    unsubscribe = db.collection('alumni')
      .orderBy('createdAt', 'desc')
      .onSnapshot(snap => {
        alumniCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        UI.renderYearFilter();
        UI.renderList();
        UI.renderStats();
      }, err => console.error('Listener error:', err));
  }

  // ── CRUD: Add Alumni (admin only)
  async function addAlumni() {
    if (currentRole !== 'admin') return;
    const get = id => document.getElementById(id).value.trim();
    const name   = get('f_name');
    const usn    = get('f_usn').toUpperCase();
    const branch = get('f_branch');
    const year   = get('f_year');

    if (!name || !usn || !branch || !year) {
      UI.showToast('Please fill Name, USN, Branch & Year', true); return;
    }

    // Check duplicate USN
    const dup = await db.collection('alumni').where('usn', '==', usn).limit(1).get();
    if (!dup.empty) { UI.showToast('USN already exists!', true); return; }

    const btn = document.getElementById('addAlumniBtn');
    btn.innerHTML = '<span class="spinner"></span> Saving…';
    btn.classList.add('loading');

    try {
      await db.collection('alumni').add({
        name, usn, branch, year,
        cgpa:     get('f_cgpa'),
        status:   get('f_status'),
        company:  get('f_company'),
        role:     get('f_role'),
        city:     get('f_city'),
        linkedin: get('f_linkedin'),
        email:    get('f_email'),
        phone:    get('f_phone'),
        bio:      get('f_bio'),
        approved: true,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });

      // Clear form
      ['f_name','f_usn','f_cgpa','f_company','f_role','f_city',
       'f_linkedin','f_email','f_phone','f_bio'].forEach(id => document.getElementById(id).value = '');
      ['f_branch','f_year','f_status'].forEach(id => document.getElementById(id).value = '');

      UI.showToast('✓ Alumni added to directory!');
      UI.showPage('home');
    } catch (e) {
      UI.showToast('Error: ' + e.message, true);
    } finally {
      btn.innerHTML = '+ Add to Directory';
      btn.classList.remove('loading');
    }
  }

  // ── CRUD: Delete Alumni (admin only)
  async function deleteAlumni(id) {
    if (currentRole !== 'admin') return;
    if (!confirm('Permanently remove this alumni from the directory?')) return;
    try {
      await db.collection('alumni').doc(id).delete();
      document.getElementById('modalOverlay').classList.remove('open');
      UI.showToast('Alumni removed.');
    } catch(e) { UI.showToast('Delete failed: ' + e.message, true); }
  }

  // ── CRUD: Edit field inline (admin)
  async function saveEdit(id, field, value) {
    try {
      await db.collection('alumni').doc(id).update({ [field]: value });
    } catch(e) { console.error(e); }
  }

  // ── Getters
  function getFiltered() {
    const q = (document.getElementById('searchInput')?.value || '').toLowerCase();
    return alumniCache.filter(a => {
      const matchBranch = activeFilter === 'All' || a.branch === activeFilter;
      const matchYear   = activeYear   === 'All' || a.year   === activeYear;
      const matchSearch = !q || [a.name, a.company, a.role, a.city, a.usn, a.branch]
        .some(x => (x || '').toLowerCase().includes(q));
      return matchBranch && matchYear && matchSearch;
    });
  }

  function setFilter(branch) { activeFilter = branch; }
  function setYear(year)     { activeYear   = year;   }
  function getRole()         { return currentRole; }
  function getUser()         { return currentUser; }

  return { initUser, resetState, addAlumni, deleteAlumni, saveEdit, getFiltered, setFilter, setYear, getRole, getUser };
})();


// ============================================================
//  UI.JS — rendering helpers
// ============================================================

const UI = (() => {

  const COLORS  = ['#7c6af7','#f4b942','#34d399','#f87171','#60a5fa','#fb923c','#a78bfa','#4ade80'];
  const AVATARBG= ['#2d2255','#4a3700','#0f3025','#4a1515','#0c2a4a','#4a2200','#2a1a55','#0a3a18'];

  function colorFor(str) {
    let h = 0;
    for (const c of str) h = (h * 31 + c.charCodeAt(0)) & 0xffff;
    return { bg: AVATARBG[h % AVATARBG.length], fg: COLORS[h % COLORS.length] };
  }

  function initials(name) {
    return (name || '?').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
  }

  function badgeClass(s) {
    const map = { Employed:'badge-employed', Studying:'badge-studying',
                  Entrepreneur:'badge-entrepreneur', Freelancer:'badge-freelancer' };
    return map[s] || '';
  }

  // ── Pages
  function showPage(p) {
    document.querySelectorAll('.page').forEach(pg => pg.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    const pg = document.getElementById('page-' + p);
    const nv = document.getElementById('nav-' + p);
    if (pg) pg.classList.add('active');
    if (nv) nv.classList.add('active');
    if (p === 'profile') renderProfile();
  }

  // ── Year filter chips
  function renderYearFilter() {
    const all = APP.getFiltered ? APP.getFiltered() : [];
    const alumni = (() => { try { return APP.getFiltered(); } catch(_) { return []; }})();
    // get all years from cache via DOM trick
    const years = ['All', ...new Set(
      (window._alumniCache || []).map(a => a.year).filter(Boolean).sort((a,b) => b - a)
    )];
    // we'll re-expose cache
  }

  function _renderYearFilter(alumniAll) {
    const years = ['All', ...new Set(alumniAll.map(a => a.year).filter(Boolean).sort((a,b) => b - a))];
    const el = document.getElementById('yearFilter');
    if (!el) return;
    const activeY = window._activeYear || 'All';
    el.innerHTML = years.map(y =>
      `<div class="year-btn ${y === activeY ? 'active' : ''}"
         onclick="UI.filterByYear('${y}', this)">${y==='All'?'All Years':y}</div>`
    ).join('');
  }

  function renderYearFilter() { _renderYearFilter(window._alumniAll || []); }

  function filterByBranch(branch, el) {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    el.classList.add('active');
    APP.setFilter(branch);
    renderList();
  }

  function filterByYear(year, el) {
    window._activeYear = year;
    document.querySelectorAll('.year-btn').forEach(b => b.classList.remove('active'));
    el.classList.add('active');
    APP.setYear(year);
    renderList();
  }

  // ── Main list
  function renderList() {
    const list = APP.getFiltered();
    window._alumniAll = list; // expose for year filter (all before year filter)
    const el = document.getElementById('alumniList');
    if (!el) return;

    if (!list.length) {
      el.innerHTML = `<div class="empty"><div class="icon">🎓</div><p>No alumni found.<br>Try a different filter.</p></div>`;
      return;
    }

    const isAdmin = APP.getRole() === 'admin';
    el.innerHTML = list.map(a => {
      const { bg, fg } = colorFor(a.name || '?');
      return `<div class="alumni-card" onclick="UI.openModal('${a.id}')">
        ${a.status ? `<div class="badge ${badgeClass(a.status)}">${a.status}</div>` : ''}
        <div class="card-header">
          <div class="avatar" style="background:${bg};color:${fg}">${initials(a.name)}</div>
          <div class="card-info">
            <h3>${a.name || '—'}</h3>
            <p>${a.branch || '—'} · Class of ${a.year || '—'}</p>
          </div>
        </div>
        <div class="card-details">
          <div class="detail-item"><label>Company</label><span>${a.company || '—'}</span></div>
          <div class="detail-item"><label>Role</label><span>${a.role || '—'}</span></div>
          <div class="detail-item"><label>City</label><span>${a.city || '—'}</span></div>
          <div class="detail-item"><label>CGPA</label><span>${a.cgpa || '—'}</span></div>
        </div>
      </div>`;
    }).join('');
  }

  // ── Modal (detail view)
  function openModal(id) {
    // find from Firestore cache via DOM
    const all = APP.getFiltered ? window._alumniAll || [] : [];
    // We need full data, stored in a global cache
    const a = (window._fullAlumniCache || []).find(x => x.id === id);
    if (!a) return;

    const { bg, fg } = colorFor(a.name || '?');
    const isAdmin = APP.getRole() === 'admin';

    const rows = [
      ['USN / Roll No', a.usn],
      ['Branch', a.branch],
      ['Year of Passing', a.year],
      ['CGPA', a.cgpa],
      ['Current Status', a.status],
      ['Company / University', a.company],
      ['Role / Course', a.role],
      ['City', a.city],
      ['Email', a.email],
      ['Phone', a.phone],
    ].filter(r => r[1]).map(r =>
      `<div class="info-row"><span class="key">${r[0]}</span><span class="val">${r[1]}</span></div>`
    ).join('');

    document.getElementById('modalBody').innerHTML = `
      <div style="display:flex;align-items:center;gap:16px;margin-bottom:20px">
        <div class="avatar" style="width:64px;height:64px;font-size:22px;background:${bg};color:${fg}">
          ${initials(a.name)}
        </div>
        <div>
          <h2 style="font-family:'Playfair Display',serif;font-size:22px;margin-bottom:4px">${a.name}</h2>
          <p style="font-size:13px;color:var(--muted)">${a.branch} · Class of ${a.year}</p>
        </div>
      </div>
      ${a.bio ? `<p style="font-size:13px;color:var(--muted);margin-bottom:18px;line-height:1.6;font-style:italic">"${a.bio}"</p>` : ''}
      ${rows}
      ${a.linkedin ? `<div style="margin-top:16px"><a href="${a.linkedin}" target="_blank">🔗 LinkedIn Profile</a></div>` : ''}
      ${isAdmin ? `<button class="btn-danger" onclick="APP.deleteAlumni('${a.id}')">🗑 Remove from Directory</button>` : ''}
    `;
    document.getElementById('modalOverlay').classList.add('open');
  }

  function closeModal(e) {
    if (e.target === document.getElementById('modalOverlay'))
      document.getElementById('modalOverlay').classList.remove('open');
  }

  // ── Stats
  function renderStats() {
    const all = window._fullAlumniCache || [];
    const total    = all.length;
    const employed = all.filter(a => a.status === 'Employed').length;
    const studying = all.filter(a => a.status === 'Studying').length;
    const ent      = all.filter(a => a.status === 'Entrepreneur').length;

    const sg = document.getElementById('statsGrid');
    if (sg) sg.innerHTML = `
      <div class="stat-card"><div class="num">${total}</div><div class="lbl">Total Alumni</div></div>
      <div class="stat-card"><div class="num text-green">${employed}</div><div class="lbl">Employed</div></div>
      <div class="stat-card"><div class="num text-accent">${studying}</div><div class="lbl">Studying</div></div>
      <div class="stat-card"><div class="num text-gold">${ent}</div><div class="lbl">Entrepreneurs</div></div>
    `;

    // Branch bars
    const branches = {};
    all.forEach(a => { if(a.branch) branches[a.branch] = (branches[a.branch]||0)+1; });
    const maxB = Math.max(...Object.values(branches), 1);
    const COLORS = ['#7c6af7','#f4b942','#34d399','#f87171','#60a5fa','#fb923c'];
    const bb = document.getElementById('branchBreakdown');
    if (bb) bb.innerHTML = Object.entries(branches).sort((a,b)=>b[1]-a[1]).map(([b,c],i)=>`
      <div class="bar-row">
        <div class="bar-label"><span>${b}</span><span class="text-muted">${c}</span></div>
        <div class="bar-track"><div class="bar-fill" style="width:${Math.round(c/maxB*100)}%;background:${COLORS[i%COLORS.length]}"></div></div>
      </div>`).join('');

    // Year bars
    const years = {};
    all.forEach(a => { if(a.year) years[a.year] = (years[a.year]||0)+1; });
    const maxY = Math.max(...Object.values(years), 1);
    const yb = document.getElementById('yearBreakdown');
    if (yb) yb.innerHTML = Object.entries(years).sort((a,b)=>b[0]-a[0]).map(([y,c],i)=>`
      <div class="bar-row">
        <div class="bar-label"><span>Class of ${y}</span><span class="text-muted">${c}</span></div>
        <div class="bar-track"><div class="bar-fill" style="width:${Math.round(c/maxY*100)}%;background:${COLORS[(i+2)%COLORS.length]}"></div></div>
      </div>`).join('');
  }

  // ── Profile page (logged-in user's own record)
  async function renderProfile() {
    const user = APP.getUser();
    if (!user) return;
    const role = APP.getRole();
    const ph = document.getElementById('profileHeader');
    const pb = document.getElementById('profileBody');

    if (role === 'admin') {
      ph.innerHTML = `
        <div class="profile-avatar" style="background:#4a3700;color:#f4b942">${user.displayName?user.displayName[0].toUpperCase():'A'}</div>
        <h2>${user.displayName || 'Admin'}</h2>
        <p class="text-gold">Administrator</p>`;
      pb.innerHTML = `<div class="profile-section"><div class="info-row"><span class="key">Email</span><span class="val">${user.email}</span></div></div>`;
      return;
    }

    // Student — load their alumni doc
    const doc = await db.collection('alumni').doc(user.uid).get();
    const a   = doc.exists ? doc.data() : null;

    if (!a) {
      ph.innerHTML = `<p class="text-muted" style="padding:20px">Profile not found.</p>`;
      pb.innerHTML = '';
      return;
    }

    const { bg, fg } = colorFor(a.name || '?');
    ph.innerHTML = `
      <div class="profile-avatar" style="background:${bg};color:${fg}">${initials(a.name)}</div>
      <h2>${a.name}</h2>
      <p class="text-muted">${a.branch} · Class of ${a.year}</p>`;

    pb.innerHTML = `
      <div class="profile-section">
        <h3>Academic Details</h3>
        ${row('USN', a.usn)} ${row('Branch', a.branch)} ${row('Year', a.year)} ${row('CGPA', a.cgpa)}
      </div>
      <div class="profile-section">
        <h3>Career</h3>
        ${row('Status', a.status)} ${row('Company / University', a.company)} ${row('Role', a.role)} ${row('City', a.city)}
      </div>
      <div class="profile-section">
        <h3>Contact</h3>
        ${row('Email', a.email)} ${row('Phone', a.phone)} ${row('LinkedIn', a.linkedin ? `<a href="${a.linkedin}" target="_blank">View Profile</a>` : '—')}
      </div>`;
  }

  function row(k, v) {
    if (!v) return '';
    return `<div class="info-row"><span class="key">${k}</span><span class="val">${v}</span></div>`;
  }

  // ── Toast
  function showToast(msg, isError = false) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.className = 'toast show' + (isError ? ' error' : '');
    clearTimeout(t._timer);
    t._timer = setTimeout(() => t.classList.remove('show'), 3000);
  }

  return {
    showPage, filterByBranch, filterByYear,
    renderList, renderYearFilter, renderStats,
    openModal, closeModal, renderProfile, showToast
  };
})();

// Expose cache to UI layer
const _origStartListener = APP.initUser;
// Patch Firestore listener to populate window._fullAlumniCache
(function patchFirestore() {
  const orig = firebase && db;
  if (!orig) return;
  const origCollection = db.collection.bind(db);
  // we already handle via onSnapshot callback in APP, just keep window._fullAlumniCache updated
})();

// Keep global cache in sync (called from APP's onSnapshot)
function _syncCache(docs) {
  window._fullAlumniCache = docs;
  window._alumniAll       = docs;
  UI.renderYearFilter();
  UI.renderList();
  UI.renderStats();
}
