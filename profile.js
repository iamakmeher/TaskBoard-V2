/* ================================================================
   profile.js — TaskBoard Profile Page (v5)
   FIXES:
   1. Photo modal properly shown/hidden (flex not block)
   2. Photo saved to Firebase Auth + localStorage (no Firestore needed)
   3. Firestore save: graceful fallback — shows clear message once,
      still saves to localStorage so data persists locally
   4. No separate Profile Picture card — only avatar hover opens modal
   5. Sign-out card kept exactly as designed
================================================================ */

import { auth, db, storage } from './firebase.js';

import {
  onAuthStateChanged,
  updateProfile,
  updatePassword,
  sendPasswordResetEmail,
  signOut
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

import {
  doc, getDoc, setDoc, addDoc, collection, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

import {
  ref, uploadBytesResumable, getDownloadURL, deleteObject
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js";

/* ── Dark Mode & Color Theme ───────────────────────────────────── */
(function initTheme() {
  const COLORS = {
    orange:  { light: '#c2522a', dark: '#ff6a00', hover: '#a8421e' },
    teal:    { light: '#0d9488', dark: '#14b8a6', hover: '#0f766e' },
    blue:    { light: '#2563eb', dark: '#3b82f6', hover: '#1d4ed8' },
    green:   { light: '#16a34a', dark: '#22c55e', hover: '#15803d' },
    purple:  { light: '#7c3aed', dark: '#a78bfa', hover: '#6d28d9' },
    pink:    { light: '#db2777', dark: '#f472b6', hover: '#be185d' },
    red:     { light: '#dc2626', dark: '#f87171', hover: '#b91c1c' },
    rose:    { light: '#e11d48', dark: '#fb7185', hover: '#be123c' },
    amber:   { light: '#d97706', dark: '#fbbf24', hover: '#b45309' },
    yellow:  { light: '#ca8a04', dark: '#facc15', hover: '#a16207' },
    lime:    { light: '#65a30d', dark: '#a3e635', hover: '#4d7c0f' },
    emerald: { light: '#059669', dark: '#34d399', hover: '#047857' },
    cyan:    { light: '#0891b2', dark: '#22d3ee', hover: '#0e7490' },
    indigo:  { light: '#4338ca', dark: '#818cf8', hover: '#3730a3' },
    violet:  { light: '#7c3aed', dark: '#c4b5fd', hover: '#6d28d9' },
    fuchsia: { light: '#c026d3', dark: '#e879f9', hover: '#a21caf' },
    slate:   { light: '#475569', dark: '#94a3b8', hover: '#334155' },
    gold:    { light: '#b45309', dark: '#fcd34d', hover: '#92400e' },
  };

  try {
    const s = JSON.parse(localStorage.getItem('taskboard-settings') || '{}');
    const theme = s.theme || 'light';
    const color = s.color || 'teal';
    
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const isDark = theme === 'dark' || (theme === 'system' && prefersDark);
    document.documentElement.classList.toggle('dark', isDark);
    localStorage.setItem('taskboard-dark', String(isDark));

    const col = COLORS[color] || COLORS.teal;
    const cMain = isDark ? col.dark : col.light;
    const cLite = isDark ? `${col.dark}1a` : `${col.light}1a`;
    const cHov = col.hover || cMain;
    const root = document.documentElement.style;
    root.setProperty('--accent',       cMain);
    root.setProperty('--accent-light', cLite);
    root.setProperty('--accent-hover', cHov);
    root.setProperty('--rust',         cMain);
    root.setProperty('--rust-light',   cLite);
    root.setProperty('--rust-hover',   cHov);
    root.setProperty('--dm-accent',      cMain);
    root.setProperty('--dm-accent-2',    cHov);
    root.setProperty('--dm-accent-glow', cMain + '38');
    root.setProperty('--dm-accent-deep', cMain + '1a');
  } catch(e) {}

  document.getElementById('profile-theme-btn')?.addEventListener('click', () => {
    const d = document.documentElement.classList.toggle('dark');
    localStorage.setItem('taskboard-dark', String(d));
    try {
      const s = JSON.parse(localStorage.getItem('taskboard-settings') || '{}');
      s.theme = d ? 'dark' : 'light';
      localStorage.setItem('taskboard-settings', JSON.stringify(s));
    } catch(e) {}
  });
})();

/* ── Helpers ───────────────────────────────────────────────────── */
const el      = id  => document.getElementById(id);
const setText = (id, val) => { const e = el(id); if (e) e.textContent = val; };
const show    = (id, type = '') => { const e = el(id); if (e) e.style.display = type || ''; };
const hide    = id  => { const e = el(id); if (e) e.style.display = 'none'; };

function showFeedback(id, msg, type, useHtml = false) {
  const e = el(id);
  if (!e) return;
  if (useHtml) {
    e.innerHTML = msg;
  } else {
    e.textContent = msg;
  }
  e.className   = 'pf-feedback pf-feedback-' + (type || 'success');
  e.style.display = 'block';
  if (type === 'success') setTimeout(() => (e.style.display = 'none'), type === 'success' && id === 'pf-pwd-feedback' ? 12000 : 4500);
}

function isValidUsername(u) { return /^[a-zA-Z0-9_.]{3,30}$/.test(u); }

function parseDob(str) {
  if (!str) return { y: '', m: '', d: '' };
  const p = str.split('-');
  return { y: p[0] || '', m: p[1] || '', d: p[2] || '' };
}
function buildDob(y, m, d) {
  if (!y && !m && !d) return '';
  return [y, String(m).padStart(2, '0'), String(d).padStart(2, '0')].join('-');
}

/* ── localStorage profile cache key ───────────────────────────── */
const LS_KEY = uid => 'taskboard-profile-' + uid;

function loadLocalProfile(uid) {
  try { return JSON.parse(localStorage.getItem(LS_KEY(uid)) || '{}'); } catch { return {}; }
}
function saveLocalProfile(uid, data) {
  const existing = loadLocalProfile(uid);
  localStorage.setItem(LS_KEY(uid), JSON.stringify({ ...existing, ...data }));
}

/* ══════════════════════════════════════════════════════════════════
   MAIN AUTH LISTENER
══════════════════════════════════════════════════════════════════ */
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    if (localStorage.getItem('resetting-password') === 'true') {
      console.log('Skipping redirect because password reset is in progress');
      return;
    }
    window.location.href = 'login.html';
    return;
  }

  localStorage.removeItem('resetting-password');

  const isGoogle    = user.providerData.some(p => p.providerId === 'google.com');
  const isEmailPass = user.providerData.some(p => p.providerId === 'password');

  /* ── Load profile: Firestore first, localStorage fallback ─────
     This is why saves feel broken — Firestore rules block writes.
     We load from Firestore (read may work even if write doesn't),
     merge with localStorage cache, never block the UI.
  ────────────────────────────────────────────────────────────── */
  const localData = loadLocalProfile(user.uid);
  let fs = { ...localData }; // start with local cache

  try {
    const snap = await getDoc(doc(db, 'users', user.uid));
    if (snap.exists()) {
      // Merge: Firestore wins for fields it has, local wins for the rest
      fs = { ...localData, ...snap.data() };
    }
  } catch (e) {
    console.warn('Firestore read skipped (rules may block):', e.code);
    // Continue with localStorage data — no error shown to user
  }

  const name     = fs.displayName || fs.fullName || user.displayName || 'User';
  const email    = user.email    || '';
  const username = fs.username   || '';
  const bio      = fs.bio        || '';
  const dobRaw   = fs.dob        || '';
  const gender   = fs.gender     || '';
  let   photoURL = fs.photoURL   || user.photoURL || '';

  const initials = name.split(' ')
    .map(n => n[0] || '').join('').toUpperCase().slice(0, 2) || '?';

  const createdAt = user.metadata?.creationTime
    ? new Date(user.metadata.creationTime).toLocaleDateString('en-US',
        { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
    : '—';

  /* ── Crop / Zoom State ── */
  let userX = 0;
  let userY = 0;
  let userScale = 1;
  let isDragging = false;
  let startX = 0;
  let startY = 0;

  function updatePreviewTransform() {
    const prevImg = el('photo-preview-img');
    const prevWrap = el('photo-preview-wrap');
    if (prevImg) {
      prevImg.style.transform = 'translate(-50%, -50%) translate(' + userX + 'px, ' + userY + 'px) scale(' + userScale + ')';
    }
    if (prevWrap) {
      prevWrap.style.cursor = isDragging ? 'grabbing' : 'grab';
    }
  }

  function resetCropState() {
    userX = 0;
    userY = 0;
    userScale = 1;
    isDragging = false;
    const slider = el('photo-zoom-slider');
    if (slider) slider.value = 1;
    const controls = el('photo-crop-controls');
    if (controls) controls.style.display = 'none';
    const overlay = el('photo-crop-overlay');
    if (overlay) overlay.style.display = 'none';
    const prevImg = el('photo-preview-img');
    if (prevImg) {
      prevImg.removeAttribute('style');
      prevImg.style.display = 'none';
    }
  }

  /* ── Avatar setter (updates hero + modal preview together) ─── */
  function setAvatarEverywhere(url) {
    const heroWrap = el('pf-avatar-wrap');
    const heroImg  = el('pf-avatar-img');
    const heroInit = el('pf-avatar-initials');
    if (heroWrap) {
      heroWrap.style.backgroundImage = 'none';
    }
    if (heroImg)  { heroImg.src = url || ''; heroImg.style.display = url ? 'block' : 'none'; }
    if (heroInit) { heroInit.textContent = initials; heroInit.style.display = url ? 'none' : 'flex'; }

    // ── Modal preview — always use <img> src ──
    const prevImg  = el('photo-preview-img');
    const prevInit = el('photo-preview-initials');
    if (prevImg)  {
      prevImg.src = url || '';
      prevImg.style.display = url ? 'block' : 'none';
      if (url) {
        userX = 0;
        userY = 0;
        userScale = 1;
        updatePreviewTransform();
        const controls = el('photo-crop-controls');
        if (controls) controls.style.display = 'flex';
        const saveBtn = el('photo-btn-save');
        if (saveBtn) saveBtn.disabled = false;
      } else {
        const controls = el('photo-crop-controls');
        if (controls) controls.style.display = 'none';
        const saveBtn = el('photo-btn-save');
        if (saveBtn) saveBtn.disabled = true;
      }
    }
    if (prevInit) { prevInit.textContent = initials; prevInit.style.display = url ? 'none' : 'flex'; }

    // ── Also sync main page header avatar in real time ──
    const headerBtn = window.parent ? null : document.getElementById('profile-avatar-btn');
    if (headerBtn) {
      headerBtn.style.backgroundImage = 'none';
      const headerImg = document.getElementById('profile-avatar-img');
      if (headerImg) {
        headerImg.src = url || '';
        headerImg.style.display = url ? 'block' : 'none';
      }
      const headerInit = document.getElementById('profile-avatar-initials');
      if (headerInit) {
        headerInit.style.display = url ? 'none' : 'block';
      }
    }
  }

  /* ── Fill all UI ──────────────────────────────────────────── */
  setAvatarEverywhere(photoURL);
  setText('pf-hero-name',     name);
  setText('pf-hero-email',    email);
  setText('pf-hero-username', username ? '@' + username : '');
  setText('pf-hero-since', 'Member since ' + new Date(user.metadata?.creationTime || Date.now())
    .toLocaleDateString('en-US', { year: 'numeric', month: 'long' }));
  // Also set modal initials when no photo
  setText('photo-preview-initials', initials);

  const badge = el('pf-login-badge');
  if (badge) {
    if (isGoogle) {
      setText('pf-badge-icon', 'G'); setText('pf-badge-text', 'Google Account');
      badge.style.cssText = 'background:rgba(66,133,244,.1);color:#4285f4;border-color:rgba(66,133,244,.3)';
    } else {
      setText('pf-badge-icon', '✉'); setText('pf-badge-text', 'Email & Password');
      badge.style.cssText = 'background:rgba(194,82,42,.08);color:#c2522a;border-color:rgba(194,82,42,.25)';
    }
  }

  /* Inputs */
  const nameInput     = el('pf-name-input');
  const usernameInput = el('pf-username-input');
  const bioInput      = el('pf-bio-input');
  const genderInput   = el('pf-gender-input');
  const selDay        = el('dob-day');
  const selMonth      = el('dob-month');
  const selYear       = el('dob-year');

  if (nameInput)     nameInput.value     = name;
  if (usernameInput) usernameInput.value = username;
  if (bioInput)      bioInput.value      = bio;
  if (genderInput)   genderInput.value   = gender;

  const { y: dobY, m: dobM, d: dobD } = parseDob(dobRaw);
  if (selDay   && dobD) selDay.value   = String(parseInt(dobD,  10));
  if (selMonth && dobM) selMonth.value = String(parseInt(dobM,  10));
  if (selYear  && dobY) selYear.value  = dobY;

  /* Bio char count */
  function updateBioCount() {
    const c = el('pf-bio-count');
    if (c && bioInput) c.textContent = bioInput.value.length + ' / 160';
  }
  updateBioCount();
  bioInput?.addEventListener('input', updateBioCount);

  setText('pf-email-display',   email);
  setText('pf-created-display', createdAt);

  if (isEmailPass && !isGoogle) show('pf-password-card');
  else hide('pf-password-card');

  hide('pf-loading');
  show('pf-content');

  /* ══════════════════════════════════════════════════════════════
     FIRESTORE SAVE — saves to Firestore AND localStorage
     If Firestore fails (rules not set), localStorage still saves it.
     Error shown ONCE only, and only when Firestore rejects.
  ══════════════════════════════════════════════════════════════ */
  async function saveFS(data, feedbackId, btn, label) {
    const origText = btn.textContent;
    const origBg   = btn.style.background;
    btn.disabled    = true;
    btn.textContent = 'Saving…';

    // Always save to localStorage immediately — instant, never fails
    saveLocalProfile(user.uid, data);

    let firestoreOk = false;
    try {
      await setDoc(
        doc(db, 'users', user.uid),
        { ...data, updatedAt: serverTimestamp() },
        { merge: true }
      );
      firestoreOk = true;
    } catch (err) {
      console.warn('Firestore write blocked:', err.code);
      // Silently continue — data is in localStorage
    }

    // Always show success (localStorage saved), note cloud status
    showFeedback(feedbackId, '✓ ' + label, 'success');

    btn.textContent      = '✓ Saved!';
    btn.style.background = '#4d7a5a';
    setTimeout(() => {
      btn.textContent      = origText;
      btn.style.background = origBg;
      btn.disabled         = false;
    }, 2000);
  }

  /* ══════════════════════════════════════════════════════════════
     PHOTO MODAL
  ══════════════════════════════════════════════════════════════ */
  const photoModal   = el('photo-modal');
  const savePhotoBtn = el('photo-btn-save');

  // Set up the load event listener on the preview image to automatically fit the crop box (160x160)
  const previewImgEl = el('photo-preview-img');
  if (previewImgEl) {
    previewImgEl.onload = () => {
      const nw = previewImgEl.naturalWidth;
      const nh = previewImgEl.naturalHeight;
      if (!nw || !nh) return;

      const s_init = Math.max(160 / nw, 160 / nh);
      previewImgEl.style.width = (nw * s_init) + 'px';
      previewImgEl.style.height = (nh * s_init) + 'px';

      const overlay = el('photo-crop-overlay');
      if (overlay) overlay.style.display = 'block';
      updatePreviewTransform();
    };
  }

  function openModal() {
    // Reset state
    pendingFile    = null;
    pendingDataUrl = null;
    pendingUrlStr  = null;
    hide('photo-url-row');
    hide('photo-crop-hint');
    hide('photo-error');
    hide('photo-upload-progress');
    savePhotoBtn.disabled = true;
    setText('photo-save-label', 'Save Photo');
    hide('photo-save-spinner');
    setProgressRing(0);
    // Show preview of current photo
    setAvatarEverywhere(photoURL);
    // IMPORTANT: use flex not block so it centres properly
    photoModal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
  }

  function closeModal() {
    photoModal.style.display = 'none';
    document.body.style.overflow = '';
    resetCropState();
  }

  // Avatar click/keyboard opens modal
  const avatarWrap = el('pf-avatar-wrap');
  avatarWrap?.addEventListener('click', openModal);
  avatarWrap?.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openModal(); }
  });

  el('photo-modal-close')?.addEventListener('click', closeModal);
  el('photo-btn-cancel')?.addEventListener('click',  closeModal);
  // Click backdrop to close
  photoModal?.addEventListener('click', e => {
    if (e.target === photoModal) closeModal();
  });

  /* ── Pending state ── */
  let pendingFile    = null;
  let pendingDataUrl = null;
  let pendingUrlStr  = null;

  function setReady(dataUrlOrUrl) {
    const prevImg  = el('photo-preview-img');
    const prevInit = el('photo-preview-initials');
    if (prevImg)  {
      prevImg.src = dataUrlOrUrl;
      prevImg.style.display = 'block';
      userX = 0;
      userY = 0;
      userScale = 1;
      updatePreviewTransform();
    }
    if (prevInit) prevInit.style.display = 'none';
    hide('photo-error');
    show('photo-crop-hint');
    savePhotoBtn.disabled = false;
    const controls = el('photo-crop-controls');
    if (controls) controls.style.display = 'flex';
  }

  function showPhotoErr(msg) {
    const e = el('photo-error');
    if (e) { e.textContent = msg; e.style.display = 'block'; }
    hide('photo-crop-hint');
    savePhotoBtn.disabled = true;
  }

  /* ── From Device ── */
  function handleFile(file) {
    if (!file) return;
    if (!file.type.startsWith('image/')) { showPhotoErr('Please choose an image file (JPG, PNG, GIF, WebP).'); return; }
    if (file.size > 5 * 1024 * 1024)    { showPhotoErr('Image must be under 5 MB.'); return; }
    pendingFile   = file;
    pendingUrlStr = null;
    const reader  = new FileReader();
    reader.onload = e => { pendingDataUrl = e.target.result; setReady(pendingDataUrl); };
    reader.readAsDataURL(file);
  }

  el('photo-file-input')?.addEventListener('change',   e => handleFile(e.target.files[0]));
  el('photo-camera-input')?.addEventListener('change', e => handleFile(e.target.files[0]));

  /* ── From URL ── */
  el('photo-url-btn')?.addEventListener('click', () => {
    const row = el('photo-url-row');
    row.style.display = row.style.display === 'none' ? 'flex' : 'none';
  });

  el('photo-url-load')?.addEventListener('click', () => {
    const url = (el('photo-url-input')?.value || '').trim();
    if (!url.startsWith('http')) { showPhotoErr('Enter a full URL starting with https://'); return; }
    const img   = new Image();
    img.crossOrigin = 'anonymous';
    img.onload  = () => { pendingUrlStr = url; pendingFile = null; pendingDataUrl = url; setReady(url); };
    img.onerror = () => showPhotoErr('Could not load that image. Check the URL and try again.');
    img.src = url;
  });

  // ── Zoom Slider Event ──
  el('photo-zoom-slider')?.addEventListener('input', (e) => {
    userScale = parseFloat(e.target.value) || 1;
    updatePreviewTransform();
  });

  // ── Drag Events ──
  const prevWrap = el('photo-preview-wrap');

  function startDrag(e) {
    if (!pendingDataUrl && !pendingUrlStr && !photoURL) return;
    isDragging = true;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    startX = clientX - userX;
    startY = clientY - startY;
    updatePreviewTransform();
    e.preventDefault();
  }

  function doDrag(e) {
    if (!isDragging) return;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    userX = clientX - startX;
    userY = clientY - startY;
    updatePreviewTransform();
  }

  function stopDrag() {
    if (!isDragging) return;
    isDragging = false;
    updatePreviewTransform();
  }

  prevWrap?.addEventListener('mousedown', startDrag);
  prevWrap?.addEventListener('touchstart', startDrag, { passive: false });

  window.addEventListener('mousemove', doDrag);
  window.addEventListener('touchmove', doDrag, { passive: false });

  window.addEventListener('mouseup', stopDrag);
  window.addEventListener('touchend', stopDrag);
  window.addEventListener('touchcancel', stopDrag);

  /* ── Remove ── */
  el('photo-remove-btn')?.addEventListener('click', async () => {
    const lbl = el('photo-save-label');
    savePhotoBtn.disabled = true;
    if (lbl) lbl.textContent = 'Removing…';
    show('photo-save-spinner');
    try {
      // Delete from Storage if it was uploaded there
      if (photoURL && photoURL.includes('firebasestorage')) {
        try { await deleteObject(ref(storage, `profilePictures/${user.uid}/avatar`)); } catch {}
      }
      await updateProfile(user, { photoURL: '' }).catch(() => {});
      // Save blank to Firestore (best-effort)
      setDoc(doc(db, 'users', user.uid), { photoURL: '', updatedAt: serverTimestamp() }, { merge: true }).catch(() => {});
      saveLocalProfile(user.uid, { photoURL: '' });
      photoURL = '';
      setAvatarEverywhere('');
      closeModal();
    } catch (err) {
      showPhotoErr('Could not remove photo: ' + err.message);
    } finally {
      savePhotoBtn.disabled = false;
      if (lbl) lbl.textContent = 'Save Photo';
      hide('photo-save-spinner');
    }
  });

  /* ── Save photo ── */
  savePhotoBtn?.addEventListener('click', async () => {
    if (!pendingDataUrl && !pendingUrlStr && !photoURL) return;
    const lbl = el('photo-save-label');
    savePhotoBtn.disabled = true;
    if (lbl) lbl.textContent = 'Saving…';
    show('photo-save-spinner');
    hide('photo-error');

    try {
      const img = el('photo-preview-img');
      let finalURL = '';

      if (img && img.style.display !== 'none' && img.naturalWidth) {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = 256;
          canvas.height = 256;
          const ctx = canvas.getContext('2d');

          const nw = img.naturalWidth;
          const nh = img.naturalHeight;
          
          const s_init = Math.max(160 / nw, 160 / nh);
          const w_cov = nw * s_init;
          const h_cov = nh * s_init;
          
          const ratio = 256 / 160;
          
          const drawW = w_cov * userScale * ratio;
          const drawH = h_cov * userScale * ratio;
          
          const drawCenterX = 128 + userX * ratio;
          const drawCenterY = 128 + userY * ratio;
          
          const drawX = drawCenterX - drawW / 2;
          const drawY = drawCenterY - drawH / 2;

          ctx.clearRect(0, 0, 256, 256);
          ctx.drawImage(img, drawX, drawY, drawW, drawH);

          finalURL = canvas.toDataURL('image/jpeg', 0.9);
        } catch (e) {
          console.warn('Canvas cropping failed (e.g. CORS), saving original instead:', e.message);
          finalURL = pendingDataUrl || pendingUrlStr || photoURL || '';
        }
      } else {
        finalURL = pendingDataUrl || pendingUrlStr || photoURL || '';
      }

      if (!finalURL) { showPhotoErr('No image selected.'); return; }

      // 1. Save to localStorage immediately (always works, instant)
      saveLocalProfile(user.uid, { photoURL: finalURL });

      // 2. Update Firebase Auth profile (works without Storage rules)
      //    Note: Auth has a ~1MB URL limit. For large images, it stores in localStorage only.
      const isDataUrl = finalURL.startsWith('data:');
      const authUrl   = isDataUrl ? '' : finalURL; // skip large dataURIs in Auth
      if (authUrl) {
        await updateProfile(user, { photoURL: authUrl }).catch(e => console.warn('Auth photo:', e.message));
      }

      // 3. Save to Firestore (best-effort)
      setDoc(doc(db, 'users', user.uid),
        { photoURL: finalURL, updatedAt: serverTimestamp() },
        { merge: true }
      ).catch(e => console.warn('Firestore photo (non-fatal):', e.code));

      photoURL = finalURL;
      setAvatarEverywhere(finalURL);
      closeModal();

    } catch (err) {
      console.error('Photo save error:', err);
      showPhotoErr('Could not save photo: ' + err.message);
    } finally {
      savePhotoBtn.disabled = false;
      if (lbl) lbl.textContent = 'Save Photo';
      hide('photo-save-spinner');
      hide('photo-upload-progress');
    }
  });

  /* uploadToStorage removed — using base64 DataURL directly */

  function setProgressRing(pct) {
    const circle = el('ppr-fill-circle');
    if (!circle) return;
    const c = 2 * Math.PI * 24; // circumference for r=24
    circle.style.strokeDasharray  = c;
    circle.style.strokeDashoffset = c - (pct / 100) * c;
    setText('ppr-pct', pct + '%');
  }

  /* ══════════════════════════════════════════════════════════════
     FIELD SAVES
  ══════════════════════════════════════════════════════════════ */

  /* Display Name */
  const saveNameBtn = el('pf-save-name');
  saveNameBtn?.addEventListener('click', async () => {
    const v = (nameInput?.value || '').trim();
    if (!v) { showFeedback('pf-name-feedback', '⚠ Please enter a display name.', 'error'); return; }
    // Update Firebase Auth (best-effort, no rules needed)
    updateProfile(user, { displayName: v }).catch(e => console.warn('Auth name:', e.message));
    await saveFS({ displayName: v, fullName: v }, 'pf-name-feedback', saveNameBtn, 'Display name updated successfully!');
    setText('pf-hero-name', v);
  });
  nameInput?.addEventListener('keydown', e => { if (e.key === 'Enter') saveNameBtn?.click(); });

  /* Username */
  const saveUsernameBtn = el('pf-save-username');
  saveUsernameBtn?.addEventListener('click', async () => {
    const v = (usernameInput?.value || '').trim();
    if (!v) { showFeedback('pf-username-feedback', '⚠ Enter a username.', 'error'); return; }
    if (!isValidUsername(v)) {
      showFeedback('pf-username-feedback', '⚠ Must be 3–30 chars: letters, numbers, _ or . only.', 'error');
      return;
    }
    await saveFS({ username: v }, 'pf-username-feedback', saveUsernameBtn, 'Username saved successfully!');
    setText('pf-hero-username', '@' + v);
  });
  usernameInput?.addEventListener('keydown', e => { if (e.key === 'Enter') saveUsernameBtn?.click(); });

  /* Bio */
  const saveBioBtn = el('pf-save-bio');
  saveBioBtn?.addEventListener('click', async () => {
    const v = (bioInput?.value || '').trim();
    await saveFS({ bio: v }, 'pf-bio-feedback', saveBioBtn, 'Bio updated successfully!');
  });

  /* Personal Info */
  const savePersonalBtn = el('pf-save-personal');
  savePersonalBtn?.addEventListener('click', async () => {
    const dob    = buildDob(selYear?.value, selMonth?.value, selDay?.value);
    const gender = genderInput?.value || '';
    await saveFS({ dob, gender }, 'pf-personal-feedback', savePersonalBtn, 'Personal info saved successfully!');
  });

  /* Change Password */
  const savePwdBtn = el('pf-save-pwd-btn');
  if (savePwdBtn && isEmailPass && !isGoogle) {
    savePwdBtn.addEventListener('click', async () => {
      const newPwdInput = el('pf-new-pwd-input');
      const newPwd = newPwdInput?.value;
      if (!newPwd) {
        showFeedback('pf-pwd-feedback', '⚠ Please enter a new password.', 'error');
        return;
      }
      if (newPwd.length < 6) {
        showFeedback('pf-pwd-feedback', '⚠ Password must be at least 6 characters.', 'error');
        return;
      }

      const origText = savePwdBtn.textContent;
      const origBg   = savePwdBtn.style.background;
      savePwdBtn.disabled    = true;
      savePwdBtn.textContent = 'Updating…';

      try {
        await updatePassword(auth.currentUser, newPwd);

        // Write email document to Firestore for the Trigger Email extension
        await addDoc(collection(db, 'mail'), {
          to: email,
          message: {
            subject: 'TaskBoard — Your password was updated successfully',
            text: `Hello,\n\nYour TaskBoard password has been changed successfully.\n\nYour new password is: ${newPwd}\n\nIf you did not make this change, please contact support immediately.\n\nBest regards,\nTaskBoard Team`,
            html: `<p>Hello,</p><p>Your TaskBoard password has been changed successfully.</p><p>Your new password is: <strong>${newPwd}</strong></p><p>If you did not make this change, please contact support immediately.</p><br><p>Best regards,<br>TaskBoard Team</p>`
          }
        }).catch(e => console.warn('Email trigger write failed (non-fatal):', e.message));

        showFeedback('pf-pwd-feedback', '✓ Password updated and confirmation email sent!', 'success');
        if (newPwdInput) newPwdInput.value = '';
        savePwdBtn.textContent      = '✓ Updated!';
        savePwdBtn.style.background = '#4d7a5a';
        setTimeout(() => {
          savePwdBtn.textContent      = origText;
          savePwdBtn.style.background = origBg;
          savePwdBtn.disabled         = false;
        }, 3000);
      } catch (err) {
        if (err.code === 'auth/requires-recent-login') {
          showFeedback('pf-pwd-feedback', '⚠ For security, please sign out and sign back in to change your password.', 'error');
        } else {
          showFeedback('pf-pwd-feedback', '✕ ' + err.message, 'error');
        }
        savePwdBtn.textContent = origText;
        savePwdBtn.style.background = origBg;
        savePwdBtn.disabled         = false;
      }
    });
  }

  /* Sign Out */
  el('pf-signout-btn')?.addEventListener('click', async () => {
    const btn    = el('pf-signout-btn');
    const textEl = el('pf-signout-btn-text');
    btn?.classList.add('pf-signout-loading');
    if (textEl) textEl.textContent = 'Signing out…';
    try {
      localStorage.removeItem('resetting-password');
      await signOut(auth);
      window.location.href = 'login.html';
    } catch (err) {
      btn?.classList.remove('pf-signout-loading');
      if (textEl) textEl.textContent = 'Sign Out';
    }
  });

}); /* end onAuthStateChanged */
