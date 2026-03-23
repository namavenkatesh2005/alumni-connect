// ============================================================
//  AUTH.JS — Login, Register, Forgot Password, Logout
// ============================================================

const AUTH = (() => {

  // USN must start with "2TG"
  // Full pattern: 2TG + 2-digit year + 2-4 letter branch + 3-digit roll
  // Examples: 2TG21CS001 / 2TG22ECE042
  const USN_PREFIX  = '2TG';
  const USN_PATTERN = /^2TG\d{2}[A-Z]{2,4}\d{3}$/;

  let _forgotEmail = '';

  // ── Page navigation ──────────────────────────────────────
  function showLogin() {
    _set('loginPage',    'flex');
    _set('registerPage', 'none');
    _set('forgotPage',   'none');
    document.getElementById('mainApp').classList.remove('active');
  }
  function showRegister() {
    _set('loginPage',    'none');
    _set('registerPage', 'block');
    _set('forgotPage',   'none');
    document.getElementById('mainApp').classList.remove('active');
  }
  function showForgot() {
    _set('loginPage',    'none');
    _set('registerPage', 'none');
    _set('forgotPage',   'block');
    document.getElementById('mainApp').classList.remove('active');
    document.getElementById('forgotStep1').style.display = 'block';
    document.getElementById('forgotStep2').style.display = 'none';
    document.getElementById('forgotEmail').value = '';
    document.getElementById('forgotError').classList.remove('show');
  }
  function showApp() {
    _set('loginPage',    'none');
    _set('registerPage', 'none');
    _set('forgotPage',   'none');
    document.getElementById('mainApp').classList.add('active');
  }
  function _set(id, display) {
    document.getElementById(id).style.display = display;
  }

  // ── Live USN Validation ───────────────────────────────────
  function validateUSN(inputEl) {
    const val     = inputEl.value.toUpperCase();
    inputEl.value = val;
    const hintId  = inputEl.id === 'f_usn' ? 'f_usnHint' : 'usnHint';
    const hint    = document.getElementById(hintId);
    if (!hint) return;

    if (!val) {
      hint.innerHTML = 'Must start with <strong style="color:var(--accent2)">2TG</strong> (e.g. 2TG21CS001)';
      hint.style.color = 'var(--muted)';
      inputEl.style.borderColor = '';
      return;
    }
    if (!val.startsWith(USN_PREFIX)) {
      hint.innerHTML = '&#10060; USN must start with <strong style="color:var(--red)">2TG</strong> — you typed "' + val.slice(0, 3) + '"';
      hint.style.color = 'var(--red)';
      inputEl.style.borderColor = 'var(--red)';
      return;
    }
    if (val.length < 7) {
      hint.innerHTML = '&#8987; Keep typing… <strong style="color:var(--accent2)">' + val + '</strong>';
      hint.style.color = 'var(--muted)';
      inputEl.style.borderColor = 'var(--accent)';
      return;
    }
    if (USN_PATTERN.test(val)) {
      hint.innerHTML = '&#10003; Valid: <strong style="color:var(--green)">' + val + '</strong>';
      hint.style.color = 'var(--green)';
      inputEl.style.borderColor = 'var(--green)';
    } else {
      hint.innerHTML = '&#9888; Format: 2TG + year(2 digits) + branch(2–4 letters) + roll(3 digits). E.g. <em>2TG21CS001</em>';
      hint.style.color = 'var(--gold)';
      inputEl.style.borderColor = 'var(--gold)';
    }
  }

  // ── Login ─────────────────────────────────────────────────
  async function login() {
    const role       = document.querySelector('.role-btn.active').dataset.role;
    const emailOrUsn = document.getElementById('loginEmail').value.trim();
    const password   = document.getElementById('loginPassword').value;
    const errEl      = document.getElementById('loginError');
    const btn        = document.getElementById('loginBtn');

    errEl.classList.remove('show');
    if (!emailOrUsn || !password) { _err(errEl, 'Please fill in all fields.'); return; }

    btn.innerHTML = '<span class="spinner"></span> Signing in…';
    btn.classList.add('loading');

    try {
      let email = emailOrUsn;
      if (!emailOrUsn.includes('@')) {
        const snap = await db.collection('alumni')
          .where('usn', '==', emailOrUsn.toUpperCase()).limit(1).get();
        if (snap.empty) throw new Error('USN not found. Please use your registered email.');
        email = snap.docs[0].data().email;
        if (!email) throw new Error('No email linked to this USN. Contact admin.');
      }

      const cred     = await auth.signInWithEmailAndPassword(email, password);
      const adminDoc = await db.collection('admins').doc(cred.user.uid).get();
      const isAdmin  = adminDoc.exists;

      if (role === 'admin' && !isAdmin) {
        await auth.signOut();
        throw new Error('You are not registered as a coordinator.');
      }

      APP.initUser(cred.user, isAdmin ? 'admin' : 'student');
      showApp();

    } catch (e) {
      _err(errEl, _friendly(e.message));
    } finally {
      btn.innerHTML = 'Sign In';
      btn.classList.remove('loading');
    }
  }

  // ── Register ──────────────────────────────────────────────
  async function register() {
    const name     = document.getElementById('regName').value.trim();
    const usn      = document.getElementById('regUSN').value.trim().toUpperCase();
    const branch   = document.getElementById('regBranch').value;
    const year     = document.getElementById('regYear').value;
    const email    = document.getElementById('regEmail').value.trim();
    const password = document.getElementById('regPassword').value;
    const confirm  = document.getElementById('regConfirm').value;
    const errEl    = document.getElementById('registerError');
    const btn      = document.getElementById('registerBtn');

    errEl.classList.remove('show');

    if (!name || !usn || !branch || !year || !email || !password || !confirm) {
      _err(errEl, 'Please fill in all required fields.'); return;
    }
    if (!usn.startsWith(USN_PREFIX)) {
      _err(errEl, 'USN must start with "2TG". Example: 2TG21CS001'); return;
    }
    if (!USN_PATTERN.test(usn)) {
      _err(errEl, 'Invalid USN format. Expected: 2TG + year (2 digits) + branch (2–4 letters) + roll (3 digits). Example: 2TG21CS001'); return;
    }
    if (password.length < 6) {
      _err(errEl, 'Password must be at least 6 characters.'); return;
    }
    if (password !== confirm) {
      _err(errEl, 'Passwords do not match.'); return;
    }

    btn.innerHTML = '<span class="spinner"></span> Creating account…';
    btn.classList.add('loading');

    try {
      const usnSnap = await db.collection('alumni').where('usn', '==', usn).limit(1).get();
      if (!usnSnap.empty) throw new Error('This USN is already registered. Try logging in.');

      const cred = await auth.createUserWithEmailAndPassword(email, password);
      await cred.user.updateProfile({ displayName: name });

      await db.collection('alumni').doc(cred.user.uid).set({
        uid: cred.user.uid, name, usn, branch, year, email,
        status: '', company: '', role: '', city: '',
        linkedin: '', phone: '', cgpa: '', bio: '',
        approved: false,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });

      APP.initUser(cred.user, 'student');
      showApp();
      UI.showToast('Welcome, ' + name.split(' ')[0] + '! Account created.');

    } catch (e) {
      _err(errEl, _friendly(e.message));
    } finally {
      btn.innerHTML = 'Create Account';
      btn.classList.remove('loading');
    }
  }

  // ── Forgot Password ───────────────────────────────────────
  async function sendResetEmail() {
    const email = document.getElementById('forgotEmail').value.trim();
    const errEl = document.getElementById('forgotError');
    const btn   = document.getElementById('forgotBtn');

    errEl.classList.remove('show');

    if (!email)               { _err(errEl, 'Please enter your registered email address.'); return; }
    if (!email.includes('@')) { _err(errEl, 'Please enter your email address (not your USN).'); return; }

    btn.innerHTML = '<span class="spinner"></span> Sending…';
    btn.classList.add('loading');

    try {
      // Removed the { url: ... } option — this was causing the domain error
      await auth.sendPasswordResetEmail(email);

      _forgotEmail = email;
      document.getElementById('forgotStep1').style.display = 'none';
      document.getElementById('forgotStep2').style.display = 'block';
      document.getElementById('forgotSentTo').textContent  = email;

    } catch (e) {
      if (e.code === 'auth/user-not-found') {
        _err(errEl, 'No account found with this email. Please check and try again.');
      } else if (e.code === 'auth/invalid-email') {
        _err(errEl, 'Please enter a valid email address.');
      } else if (e.code === 'auth/too-many-requests') {
        _err(errEl, 'Too many attempts. Please wait a few minutes and try again.');
      } else {
        _err(errEl, e.message);
      }
    } finally {
      btn.innerHTML = 'Send Reset Link';
      btn.classList.remove('loading');
    }
  }
  async function resendReset() {
    if (!_forgotEmail) return;
    try {
      await auth.sendPasswordResetEmail(_forgotEmail); // no url option
      UI.showToast('Reset link resent to ' + _forgotEmail);
    } catch(e) {
      UI.showToast('Could not resend. Try again later.', true);
    }
  }

  // ── Logout ────────────────────────────────────────────────
  async function logout() {
    if (!confirm('Sign out of AlumniConnect?')) return;
    await auth.signOut();
    showLogin();
    APP.resetState();
  }

  // ── Role switch ───────────────────────────────────────────
  function switchRole(btn) {
    document.querySelectorAll('.role-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  }

  // ── Helpers ───────────────────────────────────────────────
  function _err(el, msg) { el.textContent = msg; el.classList.add('show'); }

  function _friendly(msg) {
    if (msg.includes('user-not-found') || msg.includes('wrong-password') || msg.includes('invalid-credential'))
      return 'Incorrect email / USN or password.';
    if (msg.includes('too-many-requests'))
      return 'Too many attempts. Wait a few minutes and try again.';
    if (msg.includes('email-already-in-use'))
      return 'This email is already registered. Try logging in.';
    if (msg.includes('invalid-email'))
      return 'Please enter a valid email address.';
    if (msg.includes('network-request-failed'))
      return 'No internet connection. Check your network.';
    return msg;
  }

  return {
    login, register, logout,
    showLogin, showRegister, showForgot, showApp,
    switchRole, validateUSN,
    sendResetEmail, resendReset
  };
})();

// ── Auth state observer ───────────────────────────────────
auth.onAuthStateChanged(async (user) => {
  if (user) {
    const adminDoc = await db.collection('admins').doc(user.uid).get();
    const role     = adminDoc.exists ? 'admin' : 'student';
    APP.initUser(user, role);
    AUTH.showApp();
  } else {
    AUTH.showLogin();
  }
});