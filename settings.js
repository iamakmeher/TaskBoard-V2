/* ================================================================
   settings.js — TaskBoard Appearance Settings
   Saves all preferences to localStorage and applies them live
================================================================ */

/* ── Accent color map ─────────────────────────────────────────── */
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

const FONT_SIZES = { small: '13px', medium: '15px', large: '17px' };

const DENSITY_SPACING = { compact: '8px', normal: '14px', comfortable: '22px' };

const DEFAULTS = {
  theme:   'light',
  color:   'teal',
  font:    'medium',
  density: 'normal',
};

/* ── Load saved settings ──────────────────────────────────────── */
function loadSettings() {
  try {
    return JSON.parse(localStorage.getItem('taskboard-settings') || '{}');
  } catch { return {}; }
}

/* ── Save settings ────────────────────────────────────────────── */
function saveSettings(patch) {
  const current = loadSettings();
  const updated  = { ...DEFAULTS, ...current, ...patch };
  localStorage.setItem('taskboard-settings', JSON.stringify(updated));
  showSavedNote();
  return updated;
}

/* ── Apply ALL settings to the page ──────────────────────────── */
function applySettings(settings) {
  const s = { ...DEFAULTS, ...settings };

  // 1. Theme — always sync taskboard-dark so main page stays in sync
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const isDark = s.theme === 'dark' || (s.theme === 'system' && prefersDark);
  document.documentElement.classList.toggle('dark', isDark);
  localStorage.setItem('taskboard-dark', String(isDark));
  // Also update taskboard-settings.theme so both pages agree
  const currentS = loadSettings();
  if (currentS.theme !== s.theme) {
    localStorage.setItem('taskboard-settings', JSON.stringify({ ...DEFAULTS, ...currentS, theme: s.theme }));
  }

  // 2. Accent color — set BOTH --accent and --rust vars so every page updates
  const col   = COLORS[s.color] || COLORS.teal;
  const root  = document.documentElement.style;
  const cMain = isDark ? col.dark  : col.light;
  const cLite = isDark ? `${col.dark}1a` : `${col.light}1a`;
  const cHov  = col.hover || cMain;
  // Set accent vars
  root.setProperty('--accent',       cMain);
  root.setProperty('--accent-light', cLite);
  root.setProperty('--accent-hover', cHov);
  // Set rust vars directly (style.css uses --rust everywhere)
  root.setProperty('--rust',         cMain);
  root.setProperty('--rust-light',   cLite);
  root.setProperty('--rust-hover',   cHov);
  // Dark mode accent vars — must be set explicitly for dark mode to pick up chosen color
  root.setProperty('--dm-accent',      cMain);
  root.setProperty('--dm-accent-2',    cHov);
  root.setProperty('--dm-accent-glow', cMain + '38');
  root.setProperty('--dm-accent-deep', cMain + '1a');

  // 3. Font size — sets CSS var used by preview and index.html
  root.setProperty('--app-font-size', FONT_SIZES[s.font] || FONT_SIZES.medium);

  // 4. Density — task card spacing
  root.setProperty('--task-card-spacing', DENSITY_SPACING[s.density] || DENSITY_SPACING.normal);

  // 5. Update preview card font size
  const previewTexts = document.querySelectorAll('.preview-task-text');
  const previewSize  = { small: '13px', medium: '16px', large: '20px' }[s.font] || '16px';
  previewTexts.forEach(el => el.style.fontSize = previewSize);

  // 6. Dispatch live theme change event for instant real-time sync across pages
  try {
    if (typeof window.applyGlobalThemeAndColors === 'function') {
      window.applyGlobalThemeAndColors();
    }
    window.dispatchEvent(new Event('storage'));
  } catch(e) {}
}

/* ── Mark active buttons ──────────────────────────────────────── */
function setActive(groupId, value) {
  document.querySelectorAll(`#${groupId} [data-theme], #${groupId} [data-color], #${groupId} [data-size], #${groupId} [data-density]`)
    .forEach(btn => {
      const val = btn.dataset.theme || btn.dataset.color || btn.dataset.size || btn.dataset.density;
      btn.classList.toggle('active', val === value);
    });
}

/* ── Show saved note ──────────────────────────────────────────── */
function showSavedNote() {
  const note = document.getElementById('settings-saved-note');
  if (!note) return;
  note.style.display = 'inline';
  clearTimeout(note._timer);
  note._timer = setTimeout(() => note.style.display = 'none', 2500);
}

/* ── Init dark mode (run before DOM renders for no flash) ─────── */
(function initTheme() {
  const s = loadSettings();
  // Check taskboard-dark first — this is set by the main page toggle button
  // It is the real source of truth for current dark/light state
  const mainPageDark = localStorage.getItem('taskboard-dark');
  let isDark = false;

  if (mainPageDark !== null) {
    // Main page has set a preference — sync it into settings and use it
    isDark = mainPageDark === 'true';
    const newTheme = isDark ? 'dark' : 'light';
    // Sync back to settings so the theme buttons show the correct active state
    if ((s.theme || DEFAULTS.theme) !== newTheme) {
      const updated = { ...DEFAULTS, ...s, theme: newTheme };
      localStorage.setItem('taskboard-settings', JSON.stringify(updated));
    }
  } else {
    // No main page preference — use settings theme
    const theme = s.theme || DEFAULTS.theme;
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    isDark = theme === 'dark' || (theme === 'system' && prefersDark);
  }

  if (isDark) document.documentElement.classList.add('dark');
})();

/* ── DOM Ready ────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  const settings = { ...DEFAULTS, ...loadSettings() };

  // Apply everything on load
  applySettings(settings);

  // Mark active buttons
  setActive('theme-toggle-group', settings.theme);
  setActive('color-grid',         settings.color);
  setActive('font-size-group',    settings.font);
  setActive('density-group',      settings.density);

  /* ── Theme buttons ── */
  document.getElementById('theme-toggle-group')?.addEventListener('click', e => {
    const btn = e.target.closest('[data-theme]');
    if (!btn) return;
    const val = btn.dataset.theme;
    setActive('theme-toggle-group', val);
    const updated = saveSettings({ theme: val });
    applySettings(updated);
  });

  /* ── Color swatches ── */
  document.getElementById('color-grid')?.addEventListener('click', e => {
    const btn = e.target.closest('[data-color]');
    if (!btn) return;
    const val = btn.dataset.color;
    setActive('color-grid', val);
    const updated = saveSettings({ color: val });
    applySettings(updated);
  });

  /* ── Font size ── */
  document.getElementById('font-size-group')?.addEventListener('click', e => {
    const btn = e.target.closest('[data-size]');
    if (!btn) return;
    const val = btn.dataset.size;
    setActive('font-size-group', val);
    const updated = saveSettings({ font: val });
    applySettings(updated);
  });

  /* ── Density ── */
  document.getElementById('density-group')?.addEventListener('click', e => {
    const btn = e.target.closest('[data-density]');
    if (!btn) return;
    const val = btn.dataset.density;
    setActive('density-group', val);
    const updated = saveSettings({ density: val });
    applySettings(updated);
  });

  /* ── Nav theme toggle (top right button) ── */
  document.getElementById('settings-theme-btn')?.addEventListener('click', () => {
    const current = loadSettings();
    const isDarkNow = document.documentElement.classList.contains('dark');
    const newTheme  = isDarkNow ? 'light' : 'dark';
    setActive('theme-toggle-group', newTheme);
    const updated = saveSettings({ theme: newTheme });
    applySettings(updated);
  });

  /* ── Reset to defaults ── */
  document.getElementById('settings-reset-btn')?.addEventListener('click', () => {
    localStorage.setItem('taskboard-settings', JSON.stringify(DEFAULTS));
    applySettings(DEFAULTS);
    setActive('theme-toggle-group', DEFAULTS.theme);
    setActive('color-grid',         DEFAULTS.color);
    setActive('font-size-group',    DEFAULTS.font);
    setActive('density-group',      DEFAULTS.density);
    showSavedNote();
  });

  /* ── System theme listener ── */
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    const s = loadSettings();
    if (s.theme === 'system') applySettings(s);
  });

  /* ══════════════════════════════════════════════════════════════
     WEEK 2 — TASK PREFERENCES
  ══════════════════════════════════════════════════════════════ */
  const PREFS_KEY = 'taskboard-prefs';
  const PREFS_DEFAULTS = {
    sortBy:         'newest',
    defaultPriority:'none',
    timestamp:      'timeago',
    hideDone:       false,
    confirmDelete:  true,
  };

  function loadPrefs() {
    try { return Object.assign({}, PREFS_DEFAULTS, JSON.parse(localStorage.getItem(PREFS_KEY) || '{}')); }
    catch { return { ...PREFS_DEFAULTS }; }
  }
  function savePrefs(patch) {
    const p = Object.assign(loadPrefs(), patch);
    localStorage.setItem(PREFS_KEY, JSON.stringify(p));
    showSavedNote();
    return p;
  }

  function loadPrefsUI() {
    const p = loadPrefs();

    // Sort
    const sortEl = document.getElementById('pref-sort');
    if (sortEl) sortEl.value = p.sortBy || 'newest';

    // Default priority
    const priEl = document.getElementById('pref-priority');
    if (priEl) priEl.value = p.defaultPriority || 'none';

    // Timestamp format
    const tsEl = document.getElementById('pref-timestamp');
    if (tsEl) tsEl.value = p.timestamp || 'timeago';

    // Hide done toggle
    const hideDone = document.getElementById('pref-hide-done');
    const hideDoneLabel = document.getElementById('pref-hide-done-label');
    if (hideDone) {
      hideDone.checked = !!p.hideDone;
      if (hideDoneLabel) hideDoneLabel.textContent = p.hideDone ? 'On' : 'Off';
    }

    // Confirm delete toggle
    const confirmDel = document.getElementById('pref-confirm-delete');
    const confirmDelLabel = document.getElementById('pref-confirm-delete-label');
    if (confirmDel) {
      confirmDel.checked = !!p.confirmDelete;
      if (confirmDelLabel) confirmDelLabel.textContent = p.confirmDelete ? 'On' : 'Off';
    }


  }

  // Load pref UI on page init
  loadPrefsUI();

  // Sort select
  document.getElementById('pref-sort')?.addEventListener('change', e => {
    savePrefs({ sortBy: e.target.value });
  });

  // Default priority select
  document.getElementById('pref-priority')?.addEventListener('change', e => {
    savePrefs({ defaultPriority: e.target.value });
    // Also update taskboard-last-priority so index.html picks it up
    localStorage.setItem('taskboard-last-priority', e.target.value);
  });

  // Timestamp format
  document.getElementById('pref-timestamp')?.addEventListener('change', e => {
    savePrefs({ timestamp: e.target.value });
  });

  // Hide done toggle
  document.getElementById('pref-hide-done')?.addEventListener('change', e => {
    const val = e.target.checked;
    savePrefs({ hideDone: val });
    document.getElementById('pref-hide-done-label').textContent = val ? 'On' : 'Off';
    // Sync collapse state in main page
    localStorage.setItem('taskboard-collapse-done', String(val));
  });

  // Confirm delete toggle
  document.getElementById('pref-confirm-delete')?.addEventListener('change', e => {
    const val = e.target.checked;
    savePrefs({ confirmDelete: val });
    document.getElementById('pref-confirm-delete-label').textContent = val ? 'On' : 'Off';
  });


  // Update reset to also reset prefs
  document.getElementById('settings-reset-btn')?.addEventListener('click', () => {
    localStorage.setItem(PREFS_KEY, JSON.stringify(PREFS_DEFAULTS));
    localStorage.setItem('taskboard-last-priority', 'none');
    loadPrefsUI();
  }, true); // capture phase so it fires before the existing listener

  /* ══════════════════════════════════════════════════════════════
     DATA EXPORT (PDF + CSV) FOR SETTINGS PAGE
     ============================================================== */
  function settingsFormatDate(ts) {
    if (!ts) return '';
    var d = new Date(ts);
    return ('0'+d.getDate()).slice(-2)+'/'+('0'+(d.getMonth()+1)).slice(-2)+'/'+d.getFullYear()+' '+('0'+d.getHours()).slice(-2)+':'+('0'+d.getMinutes()).slice(-2);
  }

  function exportCSV() {
    var taskList = [];
    try { taskList = JSON.parse(localStorage.getItem('taskboard-tasks') || '[]'); } catch(e) {}
    if (!taskList.length) { alert('No tasks to export!'); return; }
    var rows = [['#','Task','Priority','Status','Sub-tasks','Added','Completed']];
    taskList.forEach(function(t, i) {
      var subList = (t.subTasks||[]).map(function(s){ return s.text; }).join(' | ');
      rows.push([
        i+1,
        '"'+(t.text||'').replace(/"/g,'""')+'"',
        t.priority||'none',
        t.completed?'Done':'Active',
        '"'+subList.replace(/"/g,'""')+'"',
        settingsFormatDate(t.createdAt),
        t.completedAt ? settingsFormatDate(t.completedAt) : ''
      ]);
      (t.subTasks||[]).forEach(function(s,j){
        rows.push([(i+1)+'.'+(j+1),'"  sub: '+(s.text||'').replace(/"/g,'""')+'"','',s.completed?'Done':'Active','',settingsFormatDate(s.createdAt),s.completedAt?settingsFormatDate(s.completedAt):'']);
      });
    });
    var csv  = rows.map(function(r){ return r.join(','); }).join('\n');
    var blob = new Blob([csv],{type:'text/csv;charset=utf-8;'});
    var url  = URL.createObjectURL(blob);
    var a    = document.createElement('a');
    var d    = new Date();
    a.href   = url;
    a.download = 'taskboard-'+d.getFullYear()+'-'+('0'+(d.getMonth()+1)).slice(-2)+'-'+('0'+d.getDate()).slice(-2)+'.csv';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showSettingsNote('✓ CSV exported!');
  }

  function exportPDF() {
    var taskList = [];
    try { taskList = JSON.parse(localStorage.getItem('taskboard-tasks') || '[]'); } catch(e) {}
    if (!taskList.length) { alert('No tasks to export!'); return; }
    var accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#c2522a';
    var d = new Date();
    var ds = d.toLocaleDateString('en-GB',{day:'2-digit',month:'long',year:'numeric'});
    var total = taskList.length;
    var done  = taskList.filter(function(t){ return t.completed; }).length;
    var pct   = total ? Math.round(done/total*100) : 0;

    var rows = taskList.map(function(t,i) {
      var p  = t.priority||'none';
      var pc = p==='high'?'#dc2626':p==='medium'?'#c07c14':p==='low'?'#4d7a5a':'#999';
      var bg = t.completed?'#f7fdf7':i%2===0?'#fff':'#fdfbf7';
      var ts = t.completed?'text-decoration:line-through;color:#aaa':'color:#2c2416';
      var sr = (t.subTasks||[]).map(function(s){
        return '<tr style="background:#fafaf7"><td></td><td colspan="4" style="padding:4px 8px 4px 28px;font-size:11px;color:'+(s.completed?'#aaa':'#555')+';text-decoration:'+(s.completed?'line-through':'none')+'">'+(s.completed?'[done] ':'')+s.text+'</td></tr>';
      }).join('');
      return [
        '<tr style="background:',bg,'">',
        '<td style="padding:8px;text-align:center;font-size:11px;color:#bbb;border-bottom:1px solid #f0ead8">',(i+1),'</td>',
        '<td style="padding:8px;font-size:13px;font-weight:600;border-bottom:1px solid #f0ead8;',ts,'">',t.text,'</td>',
        '<td style="padding:8px;text-align:center;border-bottom:1px solid #f0ead8"><span style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:99px;background:',pc,'22;color:',pc,'">',p.toUpperCase(),'</span></td>',
        '<td style="padding:8px;text-align:center;font-size:11px;border-bottom:1px solid #f0ead8;color:',(t.completed?'#4d7a5a':'#888')+'">',(t.completed?'Done':'Active'),'</td>',
        '<td style="padding:8px;font-size:11px;color:#bbb;border-bottom:1px solid #f0ead8">',settingsFormatDate(t.createdAt),'</td>',
        '</tr>',sr
      ].join('');
    }).join('');

    var pg = [
      '<!DOCTYPE html><html><head><meta charset="UTF-8"/><title>TaskBoard Export</title></head>',
      '<body style="font-family:Georgia,serif;margin:0;padding:40px 32px;background:#fdf9f0;color:#2c2416">',
      '<div style="max-width:860px;margin:0 auto">',
      '<div style="display:flex;align-items:center;justify-content:space-between;padding-bottom:20px;border-bottom:3px solid ',accent,';margin-bottom:24px">',
      '<div><div style="font-size:26px;font-weight:700">Task<span style="color:',accent,'">Board</span></div>',
      '<div style="font-size:12px;color:#999;margin-top:4px">Exported ',ds,'</div></div>',
      '<div style="text-align:right"><div style="font-size:36px;font-weight:700;color:',accent,'">',pct,'%</div>',
      '<div style="font-size:12px;color:#999">',done,' / ',total,' done</div></div></div>',
      '<div style="height:8px;background:#ede8d8;border-radius:99px;margin-bottom:28px;overflow:hidden">',
      '<div style="height:100%;width:',pct,'%;background:',accent,';border-radius:99px"></div></div>',
      '<table style="width:100%;border-collapse:collapse;font-family:sans-serif">',
      '<thead><tr style="background:',accent,';color:#fff">',
      '<th style="padding:10px 8px;width:36px">#</th>',
      '<th style="padding:10px 8px;text-align:left">TASK</th>',
      '<th style="padding:10px 8px;width:80px">PRIORITY</th>',
      '<th style="padding:10px 8px;width:80px">STATUS</th>',
      '<th style="padding:10px 8px;width:130px;text-align:left">ADDED</th>',
      '</tr></thead><tbody>',rows,'</tbody></table>',
      '<div style="margin-top:32px;padding-top:14px;border-top:1px solid #ede8d8;display:flex;justify-content:space-between;font-size:11px;color:#bbb">',
      '<span>TaskBoard - Personal Task Manager</span>',
      '<span>Total: ',total,' | Done: ',done,' | Active: ',(total-done),'</span></div>',
      '<div style="text-align:center;margin-top:28px">',
      '<button onclick="window.print()" style="background:',accent,';color:#fff;border:none;padding:12px 32px;font-size:15px;font-weight:700;border-radius:99px;cursor:pointer">Print / Save as PDF</button>',
      '<p style="color:#bbb;font-size:12px;margin-top:8px">Print dialog - choose Save as PDF</p>',
      '</div></div></body></html>'
    ].join('');

    var w = window.open('','_blank');
    if (w) { w.document.write(pg); w.document.close(); }
    showSettingsNote('✓ PDF preview opened!');
  }

  function showSettingsNote(text) {
    const note = document.getElementById('settings-saved-note');
    if (!note) return;
    note.textContent = text;
    note.style.display = 'inline';
    clearTimeout(note._timer);
    note._timer = setTimeout(() => {
      note.style.display = 'none';
      note.textContent = '✓ Settings saved';
    }, 2500);
  }

  document.getElementById('settings-export-pdf')?.addEventListener('click', exportPDF);
  document.getElementById('settings-export-csv')?.addEventListener('click', exportCSV);

});

/* ── Export for use in index.html ─────────────────────────────── */
window.TaskBoardSettings = { loadSettings, applySettings, COLORS, DEFAULTS };
