/* ================================================================
   auth.js — Authentication Logic
   Handles: Login, Register, Google Sign-in, Logout
   ================================================================ */

import {
  auth,
  db,
  googleProvider
} from './firebase.js';

import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  sendPasswordResetEmail,
  updateProfile,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

import {
  doc,
  setDoc,
  getDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

/* ──────────────────────────────────────────────────────────────
   1. CHECK IF USER IS ALREADY LOGGED IN
   If logged in → redirect to main app
──────────────────────────────────────────────────────────────── */
onAuthStateChanged(auth, (user) => {
  if (user) {
    // User is already logged in — go to main app
    window.location.href = 'index.html';
  }
});

/* ──────────────────────────────────────────────────────────────
   2. HELPER FUNCTIONS
──────────────────────────────────────────────────────────────── */

/** Show error message on the page */
function showError(message) {
  const errorBox = document.getElementById('auth-error');
  const errorMsg = document.getElementById('auth-error-msg');
  const successBox = document.getElementById('auth-success');
  if (successBox) successBox.style.display = 'none';
  if (errorBox && errorMsg) {
    errorMsg.textContent = message;
    errorBox.style.display = 'flex';
  }
}

/** Show success message on the page */
function showSuccess(message) {
  const successBox = document.getElementById('auth-success');
  const successMsg = document.getElementById('auth-success-msg');
  const errorBox = document.getElementById('auth-error');
  if (errorBox) errorBox.style.display = 'none';
  if (successBox && successMsg) {
    successMsg.textContent = message;
    successBox.style.display = 'flex';
  }
}

/** Hide all messages */
function hideMessages() {
  const errorBox = document.getElementById('auth-error');
  const successBox = document.getElementById('auth-success');
  if (errorBox)   errorBox.style.display = 'none';
  if (successBox) successBox.style.display = 'none';
}

/** Set button loading state */
function setLoading(btnId, spinnerId, textId, loading, text) {
  const btn     = document.getElementById(btnId);
  const spinner = document.getElementById(spinnerId);
  const btnText = document.getElementById(textId);
  if (!btn) return;
  btn.disabled = loading;
  if (spinner) spinner.style.display = loading ? 'block' : 'none';
  if (btnText) btnText.textContent   = loading ? 'Please wait…' : text;
}

/**
 * Convert Firebase error codes to friendly messages
 */
function getFriendlyError(errorCode) {
  const errors = {
    'auth/user-not-found':        'No account found with this email.',
    'auth/wrong-password':        'Incorrect password. Please try again.',
    'auth/email-already-in-use':  'This email is already registered. Please login instead.',
    'auth/weak-password':         'Password must be at least 6 characters.',
    'auth/invalid-email':         'Please enter a valid email address.',
    'auth/too-many-requests':     'Too many attempts. Please try again later.',
    'auth/popup-closed-by-user':  'Google sign-in was cancelled.',
    'auth/network-request-failed':'Network error. Check your internet connection.',
    'auth/invalid-credential':    'Invalid email or password. Please try again.'
  };
  return errors[errorCode] || 'Something went wrong. Please try again.';
}

/**
 * Create or update user profile in Firestore
 * Called after any login/register to ensure profile exists
 */
async function ensureUserProfile(user, extraData = {}) {
  const userRef = doc(db, 'users', user.uid);
  const snap    = await getDoc(userRef);

  if (!snap.exists()) {
    // New user — create profile document
    await setDoc(userRef, {
      uid:         user.uid,
      email:       user.email,
      displayName: extraData.displayName || user.displayName || '',
      fullName:    extraData.fullName    || user.displayName || '',
      username:    '',
      bio:         '',
      dob:         '',
      gender:      '',
      photoURL:    user.photoURL || '',
      loginMethod: extraData.loginMethod || 'email',
      createdAt:   serverTimestamp(),
      lastLogin:   serverTimestamp()
    });

    // Brand new user — clear any pre-login demo tasks and mark as migrated so they start blank
    localStorage.removeItem('taskboard-tasks');
    localStorage.removeItem('taskboard-bin');
    localStorage.setItem('taskboard-migrated-' + user.uid, 'true');
  } else {
    // Existing user — just update last login time
    await setDoc(userRef, { lastLogin: serverTimestamp() }, { merge: true });
  }
}

/* ──────────────────────────────────────────────────────────────
   3. GOOGLE SIGN IN / REGISTER
   Same function for both login and register pages.
   If account doesn't exist, Firebase creates it automatically.
──────────────────────────────────────────────────────────────── */
async function signInWithGoogle() {
  hideMessages();
  try {
    const result = await signInWithPopup(auth, googleProvider);
    const user   = result.user;

    // Save profile to Firestore
    await ensureUserProfile(user, { loginMethod: 'google' });

    showSuccess('Signed in with Google! Redirecting…');

    // Redirect after short delay
    setTimeout(() => {
      window.location.href = 'index.html';
    }, 1000);

  } catch (error) {
    showError(getFriendlyError(error.code));
    console.error('Google sign-in error:', error);
  }
}

/* ──────────────────────────────────────────────────────────────
   4. EMAIL / PASSWORD LOGIN
──────────────────────────────────────────────────────────────── */
async function loginWithEmail() {
  hideMessages();

  const email    = document.getElementById('login-email')?.value?.trim();
  const password = document.getElementById('login-password')?.value;

  // Validation
  if (!email)    { showError('Please enter your email address.');  return; }
  if (!password) { showError('Please enter your password.'); return; }

  setLoading('btn-email-login', 'login-spinner', 'login-btn-text', true, 'Sign In');

  try {
    const result = await signInWithEmailAndPassword(auth, email, password);
    await ensureUserProfile(result.user, { loginMethod: 'email' });

    showSuccess('Login successful! Redirecting…');
    setTimeout(() => { window.location.href = 'index.html'; }, 1000);

  } catch (error) {
    showError(getFriendlyError(error.code));
    console.error('Login error:', error);
  } finally {
    setLoading('btn-email-login', 'login-spinner', 'login-btn-text', false, 'Sign In');
  }
}

/* ──────────────────────────────────────────────────────────────
   5. EMAIL / PASSWORD REGISTER
──────────────────────────────────────────────────────────────── */
async function registerWithEmail() {
  hideMessages();

  const name     = document.getElementById('reg-name')?.value?.trim();
  const email    = document.getElementById('reg-email')?.value?.trim();
  const password = document.getElementById('reg-password')?.value;
  const confirm  = document.getElementById('reg-confirm')?.value;

  // Validation
  if (!name)                    { showError('Please enter your full name.');   return; }
  if (!email)                   { showError('Please enter your email.');        return; }
  if (!password)                { showError('Please enter a password.');        return; }
  if (password.length < 6)      { showError('Password must be at least 6 characters.'); return; }
  if (password !== confirm)     { showError('Passwords do not match.');         return; }

  setLoading('btn-email-register', 'register-spinner', 'register-btn-text', true, 'Create Account');

  try {
    // Create account with Firebase Auth
    const result = await createUserWithEmailAndPassword(auth, email, password);
    const user   = result.user;

    // Update display name in Firebase Auth
    await updateProfile(user, { displayName: name });

    // Create profile in Firestore
    await ensureUserProfile(user, {
      displayName: name,
      fullName:    name,
      loginMethod: 'email'
    });

    showSuccess('Account created! Redirecting…');
    setTimeout(() => { window.location.href = 'index.html'; }, 1000);

  } catch (error) {
    showError(getFriendlyError(error.code));
    console.error('Register error:', error);
  } finally {
    setLoading('btn-email-register', 'register-spinner', 'register-btn-text', false, 'Create Account');
  }
}

/* ──────────────────────────────────────────────────────────────
   6. FORGOT PASSWORD
──────────────────────────────────────────────────────────────── */
async function forgotPassword() {
  const email = document.getElementById('login-email')?.value?.trim();
  if (!email) {
    showError('Please enter your email address first, then click Forgot Password.');
    return;
  }
  try {
    await sendPasswordResetEmail(auth, email);
    showSuccess('Password reset email sent! Check your inbox.');
  } catch (error) {
    showError(getFriendlyError(error.code));
  }
}

/* ──────────────────────────────────────────────────────────────
   7. PASSWORD STRENGTH CHECKER
──────────────────────────────────────────────────────────────── */
function checkPasswordStrength(password) {
  const wrap = document.getElementById('password-strength');
  const text = document.getElementById('strength-text');
  if (!wrap || !text) return;

  let strength = 0;
  if (password.length >= 6)                          strength++;
  if (password.length >= 10)                         strength++;
  if (/[A-Z]/.test(password) && /[0-9]/.test(password)) strength++;

  wrap.className = 'password-strength';
  if (password.length === 0) {
    text.textContent = '';
  } else if (strength === 1) {
    wrap.classList.add('strength-weak');
    text.textContent = 'Weak password';
  } else if (strength === 2) {
    wrap.classList.add('strength-medium');
    text.textContent = 'Medium password';
  } else {
    wrap.classList.add('strength-strong');
    text.textContent = 'Strong password ✓';
  }
}

/* ──────────────────────────────────────────────────────────────
   8. SHOW / HIDE PASSWORD TOGGLE
──────────────────────────────────────────────────────────────── */
function setupPasswordToggle(btnId, inputId) {
  const btn   = document.getElementById(btnId);
  const input = document.getElementById(inputId);
  if (!btn || !input) return;
  btn.addEventListener('click', () => {
    const isPassword = input.type === 'password';
    input.type       = isPassword ? 'text' : 'password';
    btn.textContent  = isPassword ? '🙈' : '👁';
  });
}

/* ──────────────────────────────────────────────────────────────
   9. DARK MODE TOGGLE FOR AUTH PAGES
──────────────────────────────────────────────────────────────── */
function setupAuthTheme() {
  // Auth pages always start in LIGHT mode
  // User can toggle if they want
  const body = document.body;
  body.classList.remove('dark-mode'); // ensure light mode on load

  // Create toggle button
  const btn = document.createElement('button');
  btn.className = 'auth-theme-btn';
  btn.setAttribute('title', 'Toggle theme');
  btn.innerHTML = '<span class="auth-theme-sun">☀️</span><span class="auth-theme-moon">🌙</span>';
  document.body.appendChild(btn);

  // Load saved theme preference
  const savedDark = localStorage.getItem('taskboard-dark') === 'true';
  if (savedDark) body.classList.add('dark-mode');

  btn.addEventListener('click', () => {
    const isDark = body.classList.toggle('dark-mode');
    localStorage.setItem('taskboard-dark', isDark);
  });
}

/* ──────────────────────────────────────────────────────────────
   10. BIND ALL EVENT LISTENERS
──────────────────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {

  // Setup theme toggle
  setupAuthTheme();

  // Password show/hide toggles
  setupPasswordToggle('toggle-password',         'login-password');
  setupPasswordToggle('toggle-reg-password',     'reg-password');
  setupPasswordToggle('toggle-confirm-password', 'reg-confirm');

  // Password strength checker
  const regPass = document.getElementById('reg-password');
  if (regPass) {
    regPass.addEventListener('input', (e) => checkPasswordStrength(e.target.value));
  }

  // ── LOGIN PAGE BUTTONS ──
  const btnGoogleLogin  = document.getElementById('btn-google-login');
  const btnEmailLogin   = document.getElementById('btn-email-login');
  const btnForgot       = document.getElementById('forgot-password');

  if (btnGoogleLogin) btnGoogleLogin.addEventListener('click', signInWithGoogle);
  if (btnEmailLogin)  btnEmailLogin.addEventListener('click',  loginWithEmail);
  if (btnForgot) {
    btnForgot.addEventListener('click', (e) => {
      e.preventDefault();
      forgotPassword();
    });
  }

  // Enter key to login
  const loginPass = document.getElementById('login-password');
  if (loginPass) {
    loginPass.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') loginWithEmail();
    });
  }

  // ── REGISTER PAGE BUTTONS ──
  const btnGoogleReg = document.getElementById('btn-google-register');
  const btnEmailReg  = document.getElementById('btn-email-register');

  if (btnGoogleReg) btnGoogleReg.addEventListener('click', signInWithGoogle);
  if (btnEmailReg)  btnEmailReg.addEventListener('click',  registerWithEmail);

  // Enter key to register
  const confirmPass = document.getElementById('reg-confirm');
  if (confirmPass) {
    confirmPass.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') registerWithEmail();
    });
  }

});
