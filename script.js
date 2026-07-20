/* ================================================================
   script.js — TaskBoard · jQuery Task Manager
   ================================================================
   Changes from original:
     1. Full-width landscape layout (HTML/CSS change, script unchanged)
     2. Each task shows "Added: DD/MM/YYYY HH:MM" timestamp
        Completed tasks also show "Done: DD/MM/YYYY HH:MM"
     3. Completed tasks have NO edit button — only delete
     4. Footer shows date only (no "Tasks saved automatically" text)
   ================================================================ */

/* ================================================================
   _taskboardInit — called by firestore-sync.js after cloud load.
   MUST be outside $(function) so it is available immediately,
   even before jQuery ready fires.
================================================================ */
window._taskboardInit = function () {
  function doInit() {
    // Load from localStorage into global tasks/binTasks
    try { tasks    = JSON.parse(localStorage.getItem('taskboard-tasks') || '[]'); } catch(e) { tasks = []; }
    try { binTasks = JSON.parse(localStorage.getItem('taskboard-bin')   || '[]'); } catch(e) { binTasks = []; }
    try { boards   = JSON.parse(localStorage.getItem('taskboard-boards') || '[]'); } catch(e) { boards = []; }
    activeBoardId = localStorage.getItem('taskboard-active-board') || 'default';
    if (boards.length === 0) {
      boards = [{ id: 'default', name: 'My Workspace', createdAt: Date.now() }];
      localStorage.setItem('taskboard-boards', JSON.stringify(boards));
    }
    if (typeof updateBinBadge === 'function') updateBinBadge();
    if (typeof backfillTasks  === 'function') backfillTasks();
    if (typeof renderBoards   === 'function') renderBoards();
    if (typeof renderTasks    === 'function') {
      var $wrap = $('#task-list-wrap');
      // No spinner to clear - DOM is always intact
      renderTasks();
    }
    if (typeof updateSummary === 'function') updateSummary();
  }
  if (typeof renderTasks === 'function') {
    doInit();
  } else {
    $(function () { doInit(); });
  }
};

/* Global state — accessible by window._taskboardInit AND jQuery block */
var tasks    = [];
var binTasks = [];
var boards   = [];
var activeBoardId = 'default';

$(function () {
  'use strict';

  /* ──────────────────────────────────────────────────────────────
     1. STATE
  ────────────────────────────────────────────────────────────── */
  var LS_KEY      = 'taskboard-tasks';
  var BIN_KEY     = 'taskboard-bin';    // localStorage key for recycle bin
  var currentFilter = 'all';
  var listVisible   = true;
  var binBoardFilter = null;

  /* ──────────────────────────────────────────────────────────────
     2. LOCALSTORAGE
  ────────────────────────────────────────────────────────────── */
  // Expose core functions globally so window._taskboardInit can call them
  window.loadTasks  = function loadTasks() { try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]'); } catch(e) { return []; } };
  window.saveTasks  = function() { 
    localStorage.setItem(LS_KEY, JSON.stringify(tasks)); 
    if (typeof window.saveTasksToFirestore === 'function') {
      window.saveTasksToFirestore(tasks);
    }
  };
  window.loadBin    = function() { try { return JSON.parse(localStorage.getItem(BIN_KEY) || '[]'); } catch(e) { return []; } };

  function saveTasks() {
    try { localStorage.setItem(LS_KEY, JSON.stringify(tasks)); } catch (e) {}
    if (typeof window.saveTasksToFirestore === 'function') {
      window.saveTasksToFirestore(tasks);
    }
  }
  function saveBoards() {
    try { localStorage.setItem('taskboard-boards', JSON.stringify(boards)); } catch (e) {}
    try { localStorage.setItem('taskboard-active-board', activeBoardId); } catch (e) {}
    if (typeof window.saveBoardsToFirestore === 'function') {
      window.saveBoardsToFirestore(boards, activeBoardId);
    }
  }
  function loadTasks() {
    try {
      var s = localStorage.getItem(LS_KEY);
      return s ? JSON.parse(s) : [];
    } catch (e) { return []; }
  }

  /** Save bin array to localStorage */
  function saveBin() {
    try { localStorage.setItem(BIN_KEY, JSON.stringify(binTasks)); } catch (e) {}
    if (typeof window.saveBinToFirestore === 'function') {
      window.saveBinToFirestore(binTasks);
    }
  }
  /** Load bin array from localStorage */
  function loadBin() {
    try {
      var s = localStorage.getItem(BIN_KEY);
      return s ? JSON.parse(s) : [];
    } catch (e) { return []; }
  }

  /* ──────────────────────────────────────────────────────────────
     3. HELPERS
  ────────────────────────────────────────────────────────────── */
  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  /**
   * formatDateTime(ts)
   * Converts a timestamp (ms) to "DD/MM/YYYY HH:MM" (24-hour clock).
   * e.g. 1710000000000 → "09/03/2024 14:30"
   */
  function formatDateTime(ts) {
    if (!ts) return '';
    var d     = new Date(ts);
    var dd    = String(d.getDate()).padStart(2, '0');
    var mm    = String(d.getMonth() + 1).padStart(2, '0');
    var yy    = d.getFullYear();
    var hours = d.getHours();
    var min   = String(d.getMinutes()).padStart(2, '0');
    var ampm  = hours >= 12 ? 'PM' : 'AM';
    var hh    = String(hours % 12 || 12).padStart(2, '0');
    return dd + '/' + mm + '/' + yy + ' ' + hh + ':' + min + ' ' + ampm;
  }

  /**
   * Short Date helper: e.g. 21 Jul
   */
  function formatDateShort(ts) {
    if (!ts) return '';
    var d = new Date(ts);
    var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return d.getDate() + ' ' + months[d.getMonth()];
  }

  /* ──────────────────────────────────────────────────────────────
     3b. TIME AGO
     Returns "2 hours ago", "just now", "3 days ago" etc.
     Falls back to formatDateTime for timestamps > 7 days old.
  ────────────────────────────────────────────────────────────── */
  // timeAgo(ts) — always uses the CURRENT global setting from prefs
  // Changing the setting in Settings page updates ALL tasks immediately
  function timeAgo(ts) {
    if (!ts) return '';

    var prefs = {};
    try { prefs = JSON.parse(localStorage.getItem('taskboard-prefs') || '{}'); } catch(e) {}
    var fmt = prefs.timestamp || 'timeago';

    if (fmt === 'full')  return formatDateTime(ts);
    if (fmt === 'short') {
      var d = new Date(ts);
      return d.getDate() + ' ' + ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getMonth()];
    }
    // timeago (default)
    var diff = Date.now() - ts;
    var sec  = Math.floor(diff / 1000);
    var min  = Math.floor(sec  / 60);
    var hr   = Math.floor(min  / 60);
    var day  = Math.floor(hr   / 24);
    if (sec  < 10)  return 'just now';
    if (sec  < 60)  return sec  + 's ago';
    if (min  < 60)  return min  + ' min ago';
    if (hr   < 24)  return hr   + (hr === 1 ? ' hr ago' : ' hrs ago');
    if (day  < 2)   return 'yesterday';
    if (day  < 7)   return day  + ' days ago';
    return formatDateTime(ts);
  }

  /* ──────────────────────────────────────────────────────────────
     3c. CUSTOM DELETE CONFIRM MODAL
  ────────────────────────────────────────────────────────────── */
  function showDeleteConfirm(taskName, onConfirm, options) {
    options = options || {};
    var title = options.title || 'Delete Task?';
    var desc = options.desc || 'This task will be moved to the Recycle Bin. You can restore it from there.';
    var confirmText = options.confirmText || '🗑 Move to Bin';
    var cancelText = options.cancelText || '✕ Cancel';

    // Make sure modal exists in DOM
    var $overlay = $('#del-modal-overlay');
    if (!$overlay.length) {
      // Fallback to browser confirm if modal missing
      if (window.confirm(title + '\n\n"' + taskName + '"\n\n' + desc)) onConfirm();
      return;
    }

    // Set texts dynamically
    $overlay.find('.del-modal-title').text(title);
    $overlay.find('.del-modal-desc').text(desc);
    $('#del-modal-task-name').text('"' + taskName.slice(0, 80) + (taskName.length > 80 ? '…' : '') + '"');
    $('#del-modal-confirm').html(confirmText);
    $('#del-modal-cancel').html(cancelText);

    // Show modal with flex display
    $overlay[0].style.display = 'flex';

    function closeModal() {
      $overlay.hide();
      $('#del-modal-confirm').off('click.del');
      $('#del-modal-cancel').off('click.del');
      $overlay.off('click.del');
      $(document).off('keydown.del');
    }

    $('#del-modal-confirm').off('click.del').on('click.del', function () {
      closeModal();
      setTimeout(onConfirm, 180); // wait for fade out to finish
    });
    $('#del-modal-cancel').off('click.del').on('click.del', function () {
      closeModal();
    });
    $overlay.off('click.del').on('click.del', function (e) {
      if ($(e.target).is($overlay)) closeModal();
    });
    $(document).off('keydown.del').on('keydown.del', function (e) {
      if (e.key === 'Escape') closeModal();
    });
  }

  /* ──────────────────────────────────────────────────────────────
     4. TOAST
  ────────────────────────────────────────────────────────────── */
  function showToast(message, type) {
    type = type || 'success';
    var $t = $('<div class="toast toast-' + type + '">').text(message);
    $('#toast-container').append($t);
    setTimeout(function () {
      $t.fadeOut(300, function () { $t.remove(); });
    }, 2400);
  }

  /* ──────────────────────────────────────────────────────────────
     5. BUILD TASK ELEMENT
     ── Change 2: timestamps shown below task text
     ── Change 3: completed tasks get NO edit button
  ────────────────────────────────────────────────────────────── */
  function buildTaskEl(task) {
    var $li = $('<li>')
      .addClass('task-item')
      .attr('data-id', task.id)
      .attr('data-priority', task.priority);

    if (task.completed) $li.addClass('completed');

    /* ── Checkbox ── */
    var $checkbox = $('<div class="task-checkbox">');

    /* ── Task body: text + timestamps ── */
    var $body = $('<div class="task-body">');

    var $text = $('<span class="task-text">').text(task.text);

    /* If task has sub-tasks, add a visible expand/collapse toggle icon */
    var hasSubTasks = task.subTasks && task.subTasks.length > 0;
    if (hasSubTasks) {
      var $toggleIcon = $('<button class="subtask-toggle-btn" title="Show / hide sub-tasks">')
        .html('<span class="subtask-toggle-icon">&#9660;</span>' +
              '<span class="subtask-toggle-count">' + task.subTasks.length + '</span>');
      var $titleRow = $('<div class="task-title-row">').append($text, $toggleIcon);
      $body.append($titleRow);
    } else {
      $body.append($text);
    }

    /* Timestamps block */
    var $ts = $('<div class="task-timestamps">');

    /* Clean vector SVG calendar icon (no static 17 graphic) */
    var calendarIconSvg = '<svg class="ts-calendar-svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-1px;margin-right:3px;"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>';

    /* "Added" timestamp — shows clean SVG calendar icon + real date (e.g. 21 Jul) */
    if (task.createdAt) {
      var $created = $('<span class="task-ts task-ts-created">');
      var dateStr = formatDateShort(task.createdAt);
      var relStr  = timeAgo(task.createdAt);
      var displayTs = relStr === 'just now' ? dateStr + ' (just now)' : dateStr + ' • ' + relStr;
      $created.html(
        '<span class="task-ts-icon">' + calendarIconSvg + '</span>' +
        'Added: ' + displayTs
      );
      $ts.append($created);
    }

    /* "Done" timestamp — shown only when completed */
    if (task.completed && task.completedAt) {
      var $done = $('<span class="task-ts task-ts-done">');
      $done.html(
        '<span class="task-ts-icon">✅</span>' +
        'Done: ' + timeAgo(task.completedAt)
      );
      $ts.append($done);
    }

    $body.append($ts);

    // Render sub-tasks (each line of description = one sub-task)
    if (task.subTasks && task.subTasks.length > 0) {
      var $subList = $('<ul class="subtask-list">');

      $.each(task.subTasks, function (i, sub) {
        var $row = $('<li class="subtask-row">')
          .attr('data-sub-id', sub.id)
          .attr('data-task-id', task.id);

        if (sub.completed) $row.addClass('subtask-done');

        // Sub-task checkbox circle
        var $subCheck = $('<div class="subtask-checkbox">');

        // Sub-task text — double-click to edit inline
        var $subText = $('<span class="subtask-text">').text(sub.text);

        // Timestamps — done date OR edited date OR added date
        var $subTs = $('<span class="subtask-ts">');
        if (sub.completed && sub.completedAt) {
          // Completed — show done date
          $subTs.html('✅ Done: ' + timeAgo(sub.completedAt));
        } else if (sub.editedAt) {
          // Edited after creation — show last edited date
          $subTs
            .addClass('subtask-ts-edited')
            .html('✎ Edited: ' + timeAgo(sub.editedAt));
        } else if (sub.createdAt) {
          // Never edited — show added date
          $subTs
            .addClass('subtask-ts-added')
            .html('📅 Added: ' + timeAgo(sub.createdAt));
        }

        // Sub-task action buttons (edit + delete) — hidden until hover
        // Only show edit button if sub-task is NOT completed
        var $subActions = $('<div class="subtask-actions">');
        if (!sub.completed && !task.completed) {
          var $subEdit = $('<button class="subtask-btn subtask-btn-edit" title="Edit sub-task">' +
            '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>' +
            '</button>');
          $subActions.append($subEdit);
        }
        if (!task.completed) {
          var $subDel = $('<button class="subtask-btn subtask-btn-delete" title="Delete sub-task">' +
            '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>' +
            '</button>');
          $subActions.append($subDel);
        }

        $row.append($subCheck, $subText, $subTs, $subActions);
        $subList.append($row);
      });

      $body.append($subList);
    }

    /* ── Right side: priority badge + action buttons ── */
    var $right = $('<div class="task-right">');

    // Only render badge if a priority was selected (not 'none')
    var $badge = $('<span>');
    if (task.priority && task.priority !== 'none') {
      $badge
        .addClass('task-priority priority-' + task.priority)
        .text(task.priority);
    }

    var $actions = $('<div class="task-actions">');

    /*
     * CHANGE 3: If the task is NOT completed, show the edit button.
     * If the task IS completed, only show the delete button — no edit.
     */
    if (!task.completed) {
      var $editBtn = $('<button class="task-btn task-btn-edit" title="Edit task">' +
        '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>' +
        '</button>');
      $actions.append($editBtn);
    }

    var $delBtn = $('<button class="task-btn task-btn-delete" title="Delete task">' +
      '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>' +
      '</button>');
    $actions.append($delBtn);

    $right.append($badge, $actions);

    $li.append($checkbox, $body, $right);
    return $li;
  }

  /* ──────────────────────────────────────────────────────────────
     6. RENDER TASKS
  ────────────────────────────────────────────────────────────── */
  /* ── Task Preferences helpers ─────────────────────────────── */
  var PREFS_KEY = 'taskboard-prefs';

  function loadPrefs() {
    try { return JSON.parse(localStorage.getItem(PREFS_KEY) || '{}'); } catch { return {}; }
  }
  function savePrefs(patch) {
    var p = Object.assign(loadPrefs(), patch);
    localStorage.setItem(PREFS_KEY, JSON.stringify(p));
    return p;
  }

  var PRIORITY_ORDER = { high: 0, medium: 1, low: 2, none: 3 };

  function getPriOrder(task) {
    var p = (task.priority || 'none').toLowerCase();
    return PRIORITY_ORDER.hasOwnProperty(p) ? PRIORITY_ORDER[p] : 3;
  }

  function sortTasks(list, sortBy) {
    var copy = list.slice();
    if (sortBy === 'oldest')    return copy.sort(function(a,b){ return (a.createdAt||0)-(b.createdAt||0); });
    if (sortBy === 'priority')     return copy.sort(function(a,b){ return getPriOrder(a)-getPriOrder(b); }); // High→Medium→Low
    if (sortBy === 'priority-asc') return copy.sort(function(a,b){ return getPriOrder(b)-getPriOrder(a); }); // Low→Medium→High
    if (sortBy === 'az')        return copy.sort(function(a,b){ return a.text.localeCompare(b.text); });
    if (sortBy === 'done-last') return copy.sort(function(a,b){ return (a.completed?1:0)-(b.completed?1:0); });
    // default: newest first
    return copy.sort(function(a,b){ return (b.createdAt||0)-(a.createdAt||0); });
  }

  function renderBoards() {
    var $list = $('#boards-list');
    $list.empty();

    $.each(boards, function (i, board) {
      var count = tasks.filter(function (t) {
        var bId = t.boardId || 'default';
        return bId === board.id && !t.completed;
      }).length;

      var $li = $('<li>')
        .addClass('board-item')
        .attr('data-id', board.id);

      if (board.id === activeBoardId) {
        $li.addClass('active');
      }

      var $left = $('<div class="board-item-left">');
      var $name = $('<span class="board-item-name">').text(board.name);
      $left.append($name);

      var $right = $('<div class="board-item-right">');
      var $badge = $('<span class="board-badge">').text(count);
      $right.append($badge);

      if (board.id !== 'default') {
        var $actions = $('<div class="board-actions">');
        var $btnRename = $('<button class="btn-board-action btn-board-rename" title="Rename board">' +
          '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>' +
          '</button>');
        var $btnDelete = $('<button class="btn-board-action btn-board-delete" title="Delete board">' +
          '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>' +
          '</button>');
        $actions.append($btnRename, $btnDelete);
        $right.append($actions);
      }

      $li.append($left, $right);
      $list.append($li);
    });

    var activeBoard = boards.find(function(b) { return b.id === activeBoardId; });
    var boardName = activeBoard ? activeBoard.name : 'My Workspace';
    $('#brand-workspace').text(boardName);
  }

  // Expose to window
  window.renderBoards = renderBoards;

  function renderTasks() {
    var $list = $('#task-list');
    $list.empty();

    var prefs = loadPrefs();

    var filtered = tasks.filter(function (t) {
      var bId = t.boardId || 'default';
      if (bId !== activeBoardId) return false;
      if (currentFilter === 'active') return !t.completed;
      if (currentFilter === 'done')   return  t.completed;
      return true;
    });

    // Apply sort
    filtered = sortTasks(filtered, prefs.sortBy || 'newest');

    if (filtered.length === 0) {
      $('#empty-state').show();
    } else {
      $('#empty-state').hide();
      $.each(filtered, function (i, task) {
        var $el = buildTaskEl(task);
        $list.append($el);
        $el.hide().fadeIn(200 + i * 35);
      });
    }

    updateSummary();
    reapplySearch();
    renderBoards();
  }

  /* ──────────────────────────────────────────────────────────────
     7. ADD TASK  /  SAVE EDITED TASK
     This function handles BOTH adding a new task and saving
     an edited task — it checks #editing-task-id to decide.
  ────────────────────────────────────────────────────────────── */
  function addTask() {
    var text = $.trim($('#task-input').val());

    if (!text) {
      $('#task-input').addClass('shake');
      setTimeout(function () { $('#task-input').removeClass('shake'); }, 400);
      showToast('Please enter a task title first!', 'danger');
      return;
    }

    var priority  = $('#priority-selector .pri-btn.active').data('priority') || 'none';
    var descRaw   = $.trim($('#task-desc').val());
    var editingId = $.trim($('#editing-task-id').val());

    /* Convert each non-empty line of description into a sub-task object */
    function buildSubTasks(rawText, existingSubTasks) {
      var lines = rawText.split('\n').map(function(l){ return $.trim(l); }).filter(Boolean);
      return lines.map(function (line) {
        // Try to preserve existing sub-task state if text matches
        var existing = existingSubTasks && existingSubTasks.find(function(s){ return s.text === line; });
        return existing || { id: uid(), text: line, completed: false, completedAt: null, createdAt: Date.now(), editedAt: null };
      });
    }

    if (editingId) {
      /* ════ SAVE MODE — update existing task ════ */
      var task = tasks.find(function (t) { return t.id === editingId; });
      if (task) {
        task.text     = text;
        task.desc     = descRaw;
        task.subTasks = buildSubTasks(descRaw, task.subTasks);
        task.priority = priority;
        saveTasks();
        renderTasks();
        showToast('Task saved successfully ✓', 'success');
      }
      exitEditMode();

    } else {
      /* ════ ADD MODE — create new task ════ */
      var newTask = {
        id:          uid(),
        text:        text,
        desc:        descRaw,
        subTasks:    buildSubTasks(descRaw, []),
        priority:    priority,
        completed:   false,
        createdAt:   Date.now(),
        completedAt: null,
        boardId:     activeBoardId
      };

      tasks.unshift(newTask);
      saveTasks();
      renderTasks();

      // Reset all inputs
      $('#task-input').val('').focus();
      $('#task-desc').val('');
      if ($('#btn-desc-toggle').hasClass('active')) {
        $('#btn-desc-toggle').removeClass('active');
        $('#desc-wrap').slideUp(200);
      }
      showToast('Task added ✓', 'success');
    }
  }

  $('#btn-add').on('click', addTask);
  $('#task-input').on('keydown', function (e) { if (e.key === 'Enter') addTask(); });

  /* ── DESCRIPTION TOGGLE ─────────────────────────────────────────
     Clicking the "+ Add Description" button slides the textarea open/closed.
     jQuery .slideToggle() handles the animation.
     The ＋ icon rotates to × via CSS when .active class is added.
  ────────────────────────────────────────────────────────────── */
  $('#btn-desc-toggle').on('click', function () {
    var $btn  = $(this);
    var $wrap = $('#desc-wrap');
    $btn.toggleClass('active');           // rotates the icon via CSS
    $wrap.slideToggle(250);               // ← jQuery .slideToggle()

    // Focus the textarea when opening
    if ($btn.hasClass('active')) {
      setTimeout(function () { $('#task-desc').focus(); }, 260);
    }
  });

  /* Live character counter for description textarea */
  $('#task-desc').on('input', function () {
    var len   = $(this).val().length;
    $cnt.text(len + ' / 500');
    $cnt.removeClass('near-limit at-limit');
    if (len >= 500)       $cnt.addClass('at-limit');
    else if (len >= 400)  $cnt.addClass('near-limit');
  });

  /* ──────────────────────────────────────────────────────────────
     8. EVENT DELEGATION
  ────────────────────────────────────────────────────────────── */
  var $taskList = $('#task-list');

  /* ── DELETE → MOVE TO RECYCLE BIN ──────────────────────────────
     Deleted tasks go to binTasks array (not permanently removed).
     User can restore or permanently delete from the Recycle Bin.
  ────────────────────────────────────────────────────────────── */
  $taskList.on('click', '.task-btn-delete', function (e) {
    e.stopPropagation();
    var $li = $(this).closest('li');
    var id  = $li.attr('data-id');
    var task = tasks.find(function (t) { return t.id === id; });
    if (!task) return;

    // Confirm before delete pref
    var _dp = {};
    try { _dp = JSON.parse(localStorage.getItem('taskboard-prefs') || '{}'); } catch(e2) {}

    function doDelete() {
      // Record when it was deleted
      task.deletedAt = Date.now();
      var taskBoard = boards.find(function (b) { return b.id === (task.boardId || 'default'); });
      task.boardName = taskBoard ? taskBoard.name : 'My Workspace';
      // Move to bin
      binTasks.unshift(task);
      saveBin();
      // Remove from active tasks
      tasks = tasks.filter(function (t) { return t.id !== id; });
      saveTasks();
      if (typeof window.deleteTaskFromFirestore === 'function') {
        window.deleteTaskFromFirestore(id);
      }
      $li.slideUp(200, function () {
        $(this).remove();
        updateSummary();
        updateBinBadge();
        if ($('#task-list li').length === 0) $('#empty-state').show();
      });
      showToast('Moved to Recycle Bin 🗑', 'info');
    }

    // Always show confirm modal (user wants this)
    showDeleteConfirm(task.text, doDelete);
  });

  /* ── TOGGLE COMPLETE (checkbox only) ──────────────────────────
     Only the circle .task-checkbox toggles completion.
     .task-text click behaviour depends on whether sub-tasks exist:
       - HAS sub-tasks  → collapse / expand sub-task list
       - NO sub-tasks   → mark complete (same as checkbox)
  ────────────────────────────────────────────────────────────── */

  /* Helper: performs the actual complete/reopen logic */
  function toggleTaskComplete($li, task) {
    task.completed = !task.completed;

    if (task.completed) {
      task.completedAt = Date.now();
      if (task.subTasks && task.subTasks.length > 0) {
        task.subTasks.forEach(function (s) {
          s.completed   = true;
          s.completedAt = task.completedAt;
        });
      }
      showToast('Task completed 🎉', 'success');
    } else {
      task.completedAt = null;
      if (task.subTasks && task.subTasks.length > 0) {
        task.subTasks.forEach(function (s) {
          s.completed   = false;
          s.completedAt = null;
        });
      }
      showToast('Task reopened', 'info');
    }

    saveTasks();
    var $newEl = buildTaskEl(task);
    $li.replaceWith($newEl);
    $newEl.hide().fadeIn(180);
    updateSummary();
  }

  /* Checkbox circle — ALWAYS toggles completion regardless of sub-tasks */
  $taskList.on('click', '.task-checkbox', function () {
    var $li  = $(this).closest('li');
    var id   = $li.attr('data-id');
    var task = tasks.find(function (t) { return t.id === id; });
    if (!task) return;
    toggleTaskComplete($li, task);
  });

  /* ── TASK ITEM CLICK — handles both free space and chevron pill ──
     Clicking ANYWHERE on the task card (free space, title, chevron):
       - HAS sub-tasks  → collapse / expand the sub-task list
       - NO sub-tasks   → mark task complete
     Excluded from this: checkbox, action buttons, subtask rows
     (they all call e.stopPropagation() themselves)
  ────────────────────────────────────────────────────────────── */
  $taskList.on('click', 'li.task-item', function (e) {
    // Ignore clicks on elements that handle themselves
    if ($(e.target).closest(
      '.task-checkbox, .task-btn, .task-actions, .subtask-row, .subtask-actions, .subtask-btn'
    ).length) return;

    var $li  = $(this);
    var id   = $li.attr('data-id');
    var task = tasks.find(function (t) { return t.id === id; });
    if (!task) return;

    var hasSubTasks = task.subTasks && task.subTasks.length > 0;

    if (hasSubTasks) {
      /* Collapse / expand sub-tasks — triggered by ANY free space or the pill */
      var $subList = $li.find('.subtask-list');
      $subList.slideToggle(220);
      $li.toggleClass('subtasks-collapsed');
      $li.find('.subtask-toggle-btn').toggleClass('collapsed');
    } else {
      /* No sub-tasks — any click marks complete */
      toggleTaskComplete($li, task);
    }
  });

  /* ── EDIT ──
     Instead of a browser prompt, clicking Edit:
       1. Loads the task text + description into the left panel inputs
       2. Shows the amber "Editing task" banner
       3. Changes the Add button to "Save Changes"
       4. Scrolls the page to the top so the user sees the edit area
     Clicking "Save Changes" updates the task in-place.
     Clicking "Cancel" resets everything back to Add mode.
  */
  $taskList.on('click', '.task-btn-edit', function (e) {
    e.stopPropagation();
    var $li  = $(this).closest('li');
    var id   = $li.attr('data-id');
    var task = tasks.find(function (t) { return t.id === id; });
    if (!task) return;

    enterEditMode(task);
  });

  /**
   * enterEditMode(task)
   * Populates the left panel with the task's current values
   * and switches the UI into "edit" mode.
   */
  function enterEditMode(task) {
    // Store the task ID being edited
    $('#editing-task-id').val(task.id);

    // Reconstruct description from sub-tasks if they exist to guarantee it is in sync
    var descValue = task.desc || '';
    if (task.subTasks && task.subTasks.length > 0) {
      descValue = task.subTasks.map(function (s) { return s.text; }).join('\n');
      task.desc = descValue;
    }

    // Fill in the task text
    $('#task-input').val(task.text).addClass('edit-mode');

    // Fill in description if it exists, and open the desc box
    if (descValue && descValue.trim() !== '') {
      $('#task-desc').val(descValue);
      // Open the description area if not already open
      if (!$('#btn-desc-toggle').hasClass('active')) {
        $('#btn-desc-toggle').addClass('active');
        $('#desc-wrap').slideDown(200);
      }
    } else {
      $('#task-desc').val('');
    }

    // Set the matching priority button active
    $('.pri-btn').removeClass('active');
    if (task.priority && task.priority !== 'none') {
      $('.pri-btn[data-priority="' + task.priority + '"]').addClass('active');
    }

    // Switch panel heading
    $('#panel-heading').text('Edit Task');

    // Show the amber edit banner
    $('#edit-mode-banner').slideDown(200);

    // Switch Add button to Save mode
    $('#btn-add').addClass('save-mode');
    $('#btn-add-icon').text('✎');
    $('#btn-add-label').text('Save Changes');

    // Highlight the left panel
    $('.left-panel').addClass('edit-mode');

    // Scroll to top so user sees the edit area
    $('html, body').animate({ scrollTop: 0 }, 300);

    // Focus the task input
    setTimeout(function () { $('#task-input').focus(); }, 320);

    showToast('Editing task — make your changes and click Save', 'info');
  }

  /**
   * exitEditMode()
   * Resets everything back to "Add Task" mode without saving.
   */
  function exitEditMode() {
    $('#editing-task-id').val('');
    $('#task-input').val('').removeClass('edit-mode');
    $('#task-desc').val('');

    // Close description box if open
    if ($('#btn-desc-toggle').hasClass('active')) {
      $('#btn-desc-toggle').removeClass('active');
      $('#desc-wrap').slideUp(200);
    }

    // Restore last used priority (don't force medium)
    var savedPriority = localStorage.getItem('taskboard-last-priority') || 'none';
    $('.pri-btn').removeClass('active');
    if (savedPriority !== 'none') {
      $('.pri-btn[data-priority="' + savedPriority + '"]').addClass('active');
    }

    // Reset heading + banner + button
    $('#panel-heading').text('Add New Task');
    $('#edit-mode-banner').slideUp(200);
    $('#btn-add').removeClass('save-mode');
    $('#btn-add-icon').text('+');
    $('#btn-add-label').text('Add Task');
    $('.left-panel').removeClass('edit-mode');
  }

  /* Cancel edit button */
  $('#btn-cancel-edit').on('click', function () {
    exitEditMode();
    showToast('Edit cancelled', 'info');
  });

  /* ── SUB-TASK CHECKBOX CLICK ─────────────────────────────────────
     Clicking a sub-task row (checkbox or text) toggles just that
     sub-task — independent of the main task.
     Shows "Done: date time" in 12-hour format on completion.
  ────────────────────────────────────────────────────────────── */
  $taskList.on('click', '.subtask-row', function (e) {
    e.stopPropagation();   // prevent triggering main task toggle

    var taskId = $(this).attr('data-task-id');
    var subId  = $(this).attr('data-sub-id');

    var parentTask = tasks.find(function (t) { return t.id === taskId; });
    if (!parentTask || !parentTask.subTasks) return;

    // Don't allow toggling subtasks if the main task is already completed
    if (parentTask.completed) return;

    var sub = parentTask.subTasks.find(function (s) { return s.id === subId; });
    if (!sub) return;

    sub.completed   = !sub.completed;
    sub.completedAt = sub.completed ? Date.now() : null;

    /* ── AUTO-COMPLETE MAIN TASK when ALL sub-tasks are done ── */
    var allDone = parentTask.subTasks.every(function (s) { return s.completed; });
    if (allDone && !parentTask.completed) {
      parentTask.completed   = true;
      parentTask.completedAt = Date.now();
      showToast('All sub-tasks done — task completed! 🎉', 'success');
    } else if (!sub.completed && parentTask.completed) {
      /* If user unchecks a sub-task, reopen the main task too */
      parentTask.completed   = false;
      parentTask.completedAt = null;
    }

    saveTasks();

    // Re-render just this task's <li> in-place (no full list flicker)
    var $li    = $(this).closest('li.task-item');
    var $newEl = buildTaskEl(parentTask);
    $li.replaceWith($newEl);
    $newEl.hide().fadeIn(150);

    updateSummary();

    if (allDone) {
      // celebration already shown via updateSummary if 100%
    } else if (sub.completed) {
      showToast('Sub-task done ✓', 'success');
    } else {
      showToast('Sub-task reopened', 'info');
    }
  });

  /* ── SUB-TASK EDIT ──────────────────────────────────────────────
     Clicking the ✎ on a sub-task opens an inline input directly
     on the row — no popup, no panel switch needed.
  ────────────────────────────────────────────────────────────── */
  $taskList.on('click', '.subtask-btn-edit', function (e) {
    e.stopPropagation();

    var $btn    = $(this);
    var $row    = $btn.closest('.subtask-row');
    var taskId  = $row.attr('data-task-id');
    var subId   = $row.attr('data-sub-id');

    var parentTask = tasks.find(function (t) { return t.id === taskId; });
    if (!parentTask) return;
    var sub = parentTask.subTasks.find(function (s) { return s.id === subId; });
    if (!sub) return;

    // Already editing THIS row? Do nothing.
    if ($row.hasClass('subtask-editing')) return;

    // ── Auto-save ALL other open subtask editors before opening this one ──
    $('.subtask-editing').each(function () {
      var $openRow   = $(this);
      var $openInput = $openRow.find('.subtask-inline-input');
      var $openWrap  = $openRow.find('.subtask-inline-wrap');
      var openTaskId = $openRow.attr('data-task-id');
      var openSubId  = $openRow.attr('data-sub-id');
      var openText   = $.trim($openInput.val());

      // Save directly to tasks array — no re-render
      if (openText && openTaskId && openSubId) {
        var openParent = tasks.find(function(t){ return t.id === openTaskId; });
        if (openParent) {
          var openSub = openParent.subTasks.find(function(s){ return s.id === openSubId; });
          if (openSub) {
            openSub.text     = openText;
            openSub.editedAt = Date.now();
            openParent.desc  = openParent.subTasks.map(function (s) { return s.text; }).join('\n');
            saveTasks();
            // Update text in DOM without full re-render
            $openRow.find('.subtask-text').text(openText);
          }
        }
      }

      // Close the editor cleanly
      $openRow.removeClass('subtask-editing');
      $openWrap.remove();
      $openRow.find('.subtask-text').show();
      $openRow.find('.subtask-ts').show();
      $openRow.find('.subtask-actions').show();
    });

    $row.addClass('subtask-editing');

    var $subText = $row.find('.subtask-text');
    var $subTs   = $row.find('.subtask-ts');
    var $subActs = $row.find('.subtask-actions');
    var original = sub.text;

    $subText.hide();
    $subTs.hide();
    $subActs.hide();

    var $input = $('<input class="subtask-inline-input" type="text" maxlength="10000"/>')
      .val(original);

    var $saveBtn   = $('<button class="subtask-inline-btn subtask-inline-save">Save</button>');
    var $cancelBtn = $('<button class="subtask-inline-btn subtask-inline-cancel">Cancel</button>');
    var $inlineWrap = $('<div class="subtask-inline-wrap">').append($input, $saveBtn, $cancelBtn);

    $row.append($inlineWrap);
    $input.focus().select();

    // ── Save ──
    function saveEdit() {
      var newText = $.trim($input.val());
      if (!newText) { showToast('Sub-task cannot be empty', 'danger'); return; }
      sub.text     = newText;
      sub.editedAt = Date.now();   // ← record edit timestamp
      parentTask.desc = parentTask.subTasks.map(function (s) { return s.text; }).join('\n');
      saveTasks();
      // Re-render the parent task li in-place
      var $li    = $row.closest('li.task-item');
      var $newEl = buildTaskEl(parentTask);
      $li.replaceWith($newEl);
      $newEl.hide().fadeIn(150);
      showToast('Sub-task updated ✎', 'info');
    }

    // ── Cancel ──
    function cancelEdit() {
      $row.removeClass('subtask-editing');
      $inlineWrap.remove();
      $subText.show();
      $subTs.show();
      $subActs.show();
    }

    $saveBtn.on('click',   function (e) { e.stopPropagation(); saveEdit(); });
    $cancelBtn.on('click', function (e) { e.stopPropagation(); cancelEdit(); });

    // Enter = save, Escape = cancel
    $input.on('keydown', function (e) {
      if (e.key === 'Enter')  { e.stopPropagation(); saveEdit(); }
      if (e.key === 'Escape') { e.stopPropagation(); cancelEdit(); }
    });

    // Stop the row-click (checkbox toggle) while editing
    $input.on('click', function (e) { e.stopPropagation(); });
  });

  /* ── SUB-TASK DELETE ─────────────────────────────────────────────
     Clicking the 🗑 on a sub-task removes just that sub-task.
  ────────────────────────────────────────────────────────────── */
  $taskList.on('click', '.subtask-btn-delete', function (e) {
    e.stopPropagation();

    var $row   = $(this).closest('.subtask-row');
    var taskId = $row.attr('data-task-id');
    var subId  = $row.attr('data-sub-id');

    var parentTask = tasks.find(function (t) { return t.id === taskId; });
    if (!parentTask) return;

    // Remove the sub-task from the array
    parentTask.subTasks = parentTask.subTasks.filter(function (s) { return s.id !== subId; });

    // Also update desc string to stay in sync
    parentTask.desc = parentTask.subTasks.map(function (s) { return s.text; }).join('\n');

    saveTasks();

    // Animate row out then re-render the parent task
    $row.fadeOut(180, function () {
      var $li    = $(this).closest('li.task-item');
      var $newEl = buildTaskEl(parentTask);
      $li.replaceWith($newEl);
      $newEl.hide().fadeIn(150);
    });

    showToast('Sub-task removed', 'danger');
  });

  /* ──────────────────────────────────────────────────────────────
     9. SHOW / HIDE LIST
  ────────────────────────────────────────────────────────────── */
  $('#btn-toggle-list').on('click', function () {
    $('#task-list-wrap').slideToggle(300);
    listVisible = !listVisible;
    if (listVisible) {
      $(this).html('<span id="toggle-icon">▾</span> Hide List');
    } else {
      $(this).html('<span id="toggle-icon">▸</span> Show List');
    }
  });

  /* ──────────────────────────────────────────────────────────────
     10. FILTER TABS
  ────────────────────────────────────────────────────────────── */
  $('#filter-tabs').on('click', '.filter-tab', function () {
    $('.filter-tab').removeClass('active');
    $(this).addClass('active');
    currentFilter = $(this).data('filter');
    renderTasks();
  });

  /* ──────────────────────────────────────────────────────────────
     11. PRIORITY SELECTOR
  ────────────────────────────────────────────────────────────── */
  $('#priority-selector').on('click', '.pri-btn', function () {
    var isAlreadyActive = $(this).hasClass('active');
    $('.pri-btn').removeClass('active');
    if (!isAlreadyActive) {
      $(this).addClass('active');
      // Save chosen priority to localStorage
      localStorage.setItem('taskboard-last-priority', $(this).data('priority'));
    } else {
      // Deselected — save 'none'
      localStorage.setItem('taskboard-last-priority', 'none');
    }
  });

  /* ──────────────────────────────────────────────────────────────
     12. CLEAR ALL
  ────────────────────────────────────────────────────────────── */
  $('#btn-clear-all').on('click', function () {
    var activeBoardTasks = tasks.filter(function (t) {
      return (t.boardId || 'default') === activeBoardId;
    });

    if (activeBoardTasks.length === 0) { showToast('No tasks to clear on this board', 'info'); return; }

    showDeleteConfirm(
      'All Tasks',
      function () {
        // Move all active board tasks to bin
        var now = Date.now();
        activeBoardTasks.forEach(function (t) { 
          t.deletedAt = now; 
          var taskBoard = boards.find(function (b) { return b.id === (t.boardId || 'default'); });
          t.boardName = taskBoard ? taskBoard.name : 'My Workspace';
          binTasks.unshift(t); 
          if (typeof window.deleteTaskFromFirestore === 'function') {
            window.deleteTaskFromFirestore(t.id);
          }
        });
        saveBin();

        // Remove active board tasks from tasks array
        tasks = tasks.filter(function (t) {
          return (t.boardId || 'default') !== activeBoardId;
        });

        $('#task-list li').fadeOut(250, function () { $(this).remove(); });
        setTimeout(function () {
          saveTasks();
          renderTasks();
          updateBinBadge();
          showToast('All tasks on this board moved to Recycle Bin 🗑', 'info');
        }, 280);
      },
      {
        title: 'Clear Board?',
        desc: 'Move all tasks in this board to Recycle Bin?',
        confirmText: '🗑 Move to Bin',
        cancelText: '✕ Cancel'
      }
    );
  });

  /* ──────────────────────────────────────────────────────────────
     12b. MULTIPLE BOARDS EVENT HANDLERS
  ────────────────────────────────────────────────────────────── */
  // Toggle new board form
  $('#btn-add-board-toggle').on('click', function () {
    var $btn = $(this);
    var $wrap = $('#board-add-wrap');
    $btn.toggleClass('active');
    $wrap.slideToggle(200);
    if ($btn.hasClass('active')) {
      setTimeout(function () { $('#board-input').focus(); }, 210);
    }
  });

  // Add new board
  function addNewBoard() {
    var name = $.trim($('#board-input').val());
    if (!name) {
      showToast('Please enter a board name!', 'danger');
      return;
    }

    var id = uid();
    boards.push({
      id: id,
      name: name,
      createdAt: Date.now()
    });

    activeBoardId = id;
    saveBoards();
    
    $('#board-input').val('');
    $('#btn-add-board-toggle').removeClass('active');
    $('#board-add-wrap').slideUp(200);

    renderBoards();
    renderTasks();
    showToast('Board created ✓', 'success');
  }

  $('#btn-board-add').on('click', addNewBoard);
  $('#board-input').on('keydown', function (e) { if (e.key === 'Enter') addNewBoard(); });

  // Switch active board
  $(document).on('click', '.board-item', function (e) {
    if ($(e.target).closest('.board-actions, .board-item-name-input').length) return;

    var id = $(this).attr('data-id');
    activeBoardId = id;
    saveBoards();
    renderBoards();
    renderTasks();
  });

  // Delete board
  $(document).on('click', '.btn-board-delete', function (e) {
    e.stopPropagation();
    var $item = $(this).closest('.board-item');
    var id = $item.attr('data-id');
    var board = boards.find(function (b) { return b.id === id; });
    if (!board) return;

    showDeleteConfirm(
      board.name,
      function () {
        var boardTasks = tasks.filter(function (t) { return (t.boardId || 'default') === id; });
        
        $.each(boardTasks, function (i, task) {
          task.deletedAt = Date.now();
          task.boardName = board.name;
          binTasks.push(task);
          if (typeof window.deleteTaskFromFirestore === 'function') {
            window.deleteTaskFromFirestore(task.id);
          }
        });

        tasks = tasks.filter(function (t) { return (t.boardId || 'default') !== id; });
        boards = boards.filter(function (b) { return b.id !== id; });

        if (activeBoardId === id) {
          activeBoardId = 'default';
        }

        // Set the bin filter to this deleted board's id
        binBoardFilter = id;

        saveTasks();
        saveBin();
        saveBoards();
        renderBoards();
        renderTasks();
        updateBinBadge();
        showToast('Board deleted and tasks moved to bin ✓', 'success');
      },
      {
        title: 'Delete Board?',
        desc: 'All tasks in this board will be moved to the Recycle Bin.',
        confirmText: '🗑 Delete',
        cancelText: '✕ Cancel'
      }
    );
  });

  // Rename board
  $(document).on('click', '.btn-board-rename', function (e) {
    e.stopPropagation();
    var $item = $(this).closest('.board-item');
    var id = $item.attr('data-id');
    var board = boards.find(function (b) { return b.id === id; });
    if (!board) return;

    var $left = $item.find('.board-item-left');
    var $nameSpan = $left.find('.board-item-name');
    if ($left.find('.board-item-name-input').length) return; // already in edit mode

    var $input = $('<input type="text">')
      .addClass('board-item-name-input')
      .val(board.name)
      .attr('maxlength', '30');

    $nameSpan.hide();
    $left.append($input);
    $input.focus().select();

    function finishRename() {
      var newName = $.trim($input.val());
      if (newName && newName !== board.name) {
        board.name = newName;
        saveBoards();
        showToast('Board renamed ✓', 'success');
      }
      $input.remove();
      $nameSpan.text(board.name).show();
      renderBoards();
    }

    $input.on('blur', finishRename);
    $input.on('keydown', function (ev) {
      if (ev.key === 'Enter') finishRename();
      if (ev.key === 'Escape') {
        $input.remove();
        $nameSpan.show();
      }
    });
  });

  /* ──────────────────────────────────────────────────────────────
     13. SEARCH / FILTER
  ────────────────────────────────────────────────────────────── */
  function reapplySearch() {
    var q = $.trim($('#search-input').val()).toLowerCase();
    if (!q) { $('#task-list li').show(); return; }
    $('#task-list li').each(function () {
      var txt = $(this).find('.task-text').text().toLowerCase();
      $(this)[txt.includes(q) ? 'show' : 'hide']();
    });
  }

  $('#search-input').on('input', reapplySearch);
  $('#btn-clear-search').on('click', function () {
    $('#search-input').val('');
    reapplySearch();
    $('#search-input').focus();
  });

  /* ──────────────────────────────────────────────────────────────
     13b. COLLAPSE COMPLETED TASKS
     Toggles visibility of all completed task cards at once.
     State remembered in localStorage.
  ────────────────────────────────────────────────────────────── */
  // Check both collapse toggle and hideDone pref
  var _prefs0 = {};
  try { _prefs0 = JSON.parse(localStorage.getItem('taskboard-prefs') || '{}'); } catch(e) {}
  var completedCollapsed = localStorage.getItem('taskboard-collapse-done') === 'true' || !!_prefs0.hideDone;
  // Keep both in sync
  if (completedCollapsed) {
    localStorage.setItem('taskboard-collapse-done', 'true');
  }

  function applyCollapseState() {
    var $completed = $('.task-item.completed');
    if (completedCollapsed) {
      // Hide with a quick fade, then display:none
      $completed.each(function() {
        var $el = $(this);
        if (!$el.hasClass('task-collapsed')) {
          $el.addClass('task-collapsing');
          setTimeout(function() {
            $el.removeClass('task-collapsing').addClass('task-collapsed');
          }, 200);
        }
      });
      $('#btn-collapse-done').html('👁 Show Completed');
    } else {
      // Show immediately — remove both classes, let normal CSS take over
      $completed.removeClass('task-collapsed task-collapsing');
      $('#btn-collapse-done').html('🙈 Hide Completed');
    }
  }

  $('#btn-collapse-done').on('click', function () {
    completedCollapsed = !completedCollapsed;
    localStorage.setItem('taskboard-collapse-done', String(completedCollapsed));
    // Also sync with prefs
    var _cp = {};
    try { _cp = JSON.parse(localStorage.getItem('taskboard-prefs') || '{}'); } catch(e) {}
    _cp.hideDone = completedCollapsed;
    localStorage.setItem('taskboard-prefs', JSON.stringify(_cp));
    applyCollapseState();
  });

  // Apply on first render
  applyCollapseState();

  /* ──────────────────────────────────────────────────────────────
     14. SUMMARY PILLS + PROGRESS BAR
  ────────────────────────────────────────────────────────────── */
  function updateSummary() {
    var activeBoardTasks = tasks.filter(function (t) {
      return (t.boardId || 'default') === activeBoardId;
    });
    var total = activeBoardTasks.length;
    var done  = activeBoardTasks.filter(function (t) { return t.completed; }).length;
    var left  = total - done;
    var pct   = total > 0 ? Math.round((done / total) * 100) : 0;

    $('#count-total').text(total);
    $('#count-done').text(done);
    $('#count-left').text(left);
    $('#progress-bar').css('width', pct + '%');
    $('#progress-label').text(pct + '%');

    // Tab title — always show plain TaskBoard
    document.title = 'TaskBoard';

    // Show celebration toast when ALL tasks are completed (and at least 1 exists)
    if (total > 0 && pct === 100) {
      showCelebration();
    }

    if ($('#task-list li:visible').length === 0 && !$('#search-input').val()) {
      $('#empty-state').show();
    }

    // Re-apply collapse state after every render (no timeout to avoid flash)
    if (typeof applyCollapseState === 'function') {
      // Use microtask so DOM is fully updated first
      Promise.resolve().then(applyCollapseState);
    }
  }

  /* ── CELEBRATION OVERLAY ─────────────────────────────────────
     Shows a full-screen overlay when all tasks are completed.
     Auto-dismisses after 4 seconds or on click.
  ────────────────────────────────────────────────────────────── */
  // ── Celebration shown once per "all-complete" moment ──
  // We track the last time all tasks were completed. If the user
  // leaves and comes back, we check if it was already shown for
  // the CURRENT set of completed tasks. If yes → don't show again.
  function getCelebrationKey() {
    // Key = sorted IDs of all completed tasks — unique fingerprint
    var doneIds = tasks
      .filter(function(t){ return t.completed && (t.boardId || 'default') === activeBoardId; })
      .map(function(t){ return t.id; })
      .sort()
      .join(',');
    return 'cel-shown-' + activeBoardId + '-' + doneIds;
  }

  function showCelebration() {
    // Already shown for this exact set of completed tasks? Skip.
    var key = getCelebrationKey();
    if (localStorage.getItem(key)) return;
    // Mark as shown
    localStorage.setItem(key, '1');

    // Remove any existing overlay first
    $('#celebration-overlay').remove();

    var $overlay = $('<div id=celebration-overlay>').html(
      '<div class=cel-box>' +
        '<div class=cel-emoji>🎉</div>' +
        '<h2 class=cel-title>Great Work!</h2>' +
        '<p class=cel-msg>You completed all your tasks today!</p>' +
        '<button class=cel-close id=cel-close-btn>Awesome ✓</button>' +
      '</div>'
    );

    $('body').append($overlay);

    // Animate in
    $overlay.hide().fadeIn(350);

    // Auto-dismiss after 4 seconds
    var autoClose = setTimeout(function () {
      closeCelebration($overlay);
    }, 4000);

    // Manual dismiss on button click
    $overlay.on('click', '#cel-close-btn', function () {
      clearTimeout(autoClose);
      closeCelebration($overlay);
    });

    // Also close by clicking outside the box
    $overlay.on('click', function (e) {
      if ($(e.target).is($overlay)) {
        clearTimeout(autoClose);
        closeCelebration($overlay);
      }
    });
  }

  function closeCelebration($overlay) {
    // celebrationShown stays true via localStorage — no reset needed
    $overlay.fadeOut(300, function () { $overlay.remove(); });
    // Reset flag so it can show again if user re-completes all tasks
    celebrationShown = false;
  }

  /* ──────────────────────────────────────────────────────────────
     15. DATE and FOOTER
     - Header date updates every 60s so it always shows today.
     - Footer shows fixed branding: AK Task Board
  ────────────────────────────────────────────────────────────── */

  function getCurrentDateString() {
    return new Date().toLocaleDateString('en-US', {
      weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
    });
  }

  // Set header date immediately on load
  $('#header-date').text(getCurrentDateString());

  // Refresh every 60 seconds so it stays current (e.g. midnight rollover)
  setInterval(function () {
    $('#header-date').text(getCurrentDateString());
  }, 60000);

  // Dynamic footer branding function (e.g. Chinmaya TaskBoard or fallback to TaskBoard)
  function updateFooterBranding(fullName) {
    var footerEl = document.getElementById('footer-date');
    if (!footerEl) return;
    if (fullName && typeof fullName === 'string' && fullName.trim().length > 0) {
      var firstName = fullName.trim().split(/\s+/)[0];
      firstName = firstName.charAt(0).toUpperCase() + firstName.slice(1);
      footerEl.textContent = firstName + ' TaskBoard';
    } else {
      footerEl.textContent = 'TaskBoard';
    }
  }
  window._updateFooterBranding = updateFooterBranding;

  updateFooterBranding('');

  /* ──────────────────────────────────────────────────────────────
     16. DARK MODE TOGGLE
     Saves preference to localStorage. Applies 'dark' class to <html>.
  ────────────────────────────────────────────────────────────── */
  var DARK_KEY = 'taskboard-dark';

  function applyTheme(isDark) {
    if (isDark) {
      $('html').addClass('dark');
      $('#theme-toggle').addClass('is-dark');
    } else {
      $('html').removeClass('dark');
      $('#theme-toggle').removeClass('is-dark');
    }
  }

  // Load saved preference
  var savedDark = localStorage.getItem(DARK_KEY) === 'true';
  applyTheme(savedDark);

  $('#theme-toggle').on('click', function () {
    var nowDark = !$('html').hasClass('dark');
    applyTheme(nowDark);
    localStorage.setItem(DARK_KEY, nowDark);
    // Sync with taskboard-settings so settings page shows correct theme
    try {
      var st = JSON.parse(localStorage.getItem('taskboard-settings') || '{}');
      st.theme = nowDark ? 'dark' : 'light';
      localStorage.setItem('taskboard-settings', JSON.stringify(st));
    } catch(e) {}
  });

  /* ──────────────────────────────────────────────────────────────
     16. PROFILE ICON — Load user info + dropdown logic
  ────────────────────────────────────────────────────────────── */

  /**
   * loadUserProfile()
   * Reads the logged-in user from Firebase Auth and
   * fills the profile icon + dropdown with their info.
   */
  function loadUserProfile() {
    var script = document.createElement('script');
    script.type = 'module';
    script.textContent = `
      import { auth } from './firebase.js';
      import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
      import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
      import { db } from './firebase.js';

      function applyPhotoNow(photo, initials) {
        var avatarBtn      = document.getElementById('profile-avatar-btn');
        var avatarImg      = document.getElementById('profile-avatar-img');
        var avatarInitials = document.getElementById('profile-avatar-initials');
        var dropWrap       = document.getElementById('profile-dropdown-avatar-wrap');
        var dropImg        = document.getElementById('profile-dropdown-img');
        var dropInitials   = document.getElementById('profile-dropdown-initials');

        if (avatarBtn) avatarBtn.style.backgroundImage = 'none';
        if (dropWrap)  dropWrap.style.backgroundImage = 'none';

        if (photo) {
          if (avatarImg)      { avatarImg.src = photo; avatarImg.style.display = 'block'; }
          if (avatarInitials) avatarInitials.style.display = 'none';
          if (dropImg)        { dropImg.src = photo; dropImg.style.display = 'block'; }
          if (dropInitials)   dropInitials.style.display = 'none';
        } else {
          if (avatarImg)      { avatarImg.src = ''; avatarImg.style.display = 'none'; }
          if (avatarInitials) { avatarInitials.textContent = initials; avatarInitials.style.display = 'block'; }
          if (dropImg)        { dropImg.src = ''; dropImg.style.display = 'none'; }
          if (dropInitials)   { dropInitials.textContent = initials; dropInitials.style.display = 'block'; }
        }
      }

      onAuthStateChanged(auth, async (user) => {
        if (!user) { window.location.href = 'login.html'; return; }

        var name  = user.displayName || 'User';
        var email = user.email || '';

        // STEP 1: Read localStorage immediately — no Firebase wait
        var localProfile = {};
        try {
          var lsKey = 'taskboard-profile-' + user.uid;
          localProfile = JSON.parse(localStorage.getItem(lsKey) || '{}');
        } catch(e) {}

        // localStorage photo always wins over Google default
        var photo = localProfile.photoURL || user.photoURL || '';
        if (localProfile.displayName) name = localProfile.displayName;

        var initials = name.split(' ').map(function(n){ return n[0] || ''; }).join('').toUpperCase().slice(0,2) || '?';

        // STEP 2: Apply photo instantly
        applyPhotoNow(photo, initials);

        // STEP 3: Update workspace label with username (disabled to preserve active board name in header)
        // var username    = localProfile.username || '';
        // var workspaceEl = document.getElementById('brand-workspace');
        // if (workspaceEl) workspaceEl.textContent = username ? '@' + username : 'My Workspace';

        // STEP 4: Fill dropdown name/email & update footer branding
        var dropName  = document.getElementById('profile-dropdown-name');
        var dropEmail = document.getElementById('profile-dropdown-email');
        if (dropName)  dropName.textContent  = name;
        if (dropEmail) dropEmail.textContent = email;
        if (window._updateFooterBranding) window._updateFooterBranding(name);

        // STEP 5: Firestore in background
        try {
          var fsUsername = '';
          var snap = await getDoc(doc(db, 'users', user.uid));
          if (snap.exists()) {
            var data = snap.data();
            if (data.displayName && !localProfile.displayName) {
              name = data.displayName;
              if (dropName) dropName.textContent = name;
              if (window._updateFooterBranding) window._updateFooterBranding(name);
            }
            if (data.username) fsUsername = data.username;
            if (!localProfile.photoURL && data.photoURL) {
              photo = data.photoURL;
              applyPhotoNow(photo, initials);
            }
          }
        } catch(e) {}

        window._firebaseUser = user;
      });
    `;
    document.head.appendChild(script);
  }

  // Instant avatar from localStorage before Firebase loads
  (function renderAvatarFromCache() {
    for (var i = 0; i < localStorage.length; i++) {
      var key = localStorage.key(i);
      if (!key || !key.startsWith('taskboard-profile-')) continue;
      try {
        var cached   = JSON.parse(localStorage.getItem(key) || '{}');
        var photo    = cached.photoURL || '';
        var username = cached.username || '';
        var avatarBtn      = document.getElementById('profile-avatar-btn');
        var avatarImg      = document.getElementById('profile-avatar-img');
        var avatarInitials = document.getElementById('profile-avatar-initials');
        var dropWrap       = document.getElementById('profile-dropdown-avatar-wrap');
        var dropImg        = document.getElementById('profile-dropdown-img');
        var dropInitials   = document.getElementById('profile-dropdown-initials');
        var wsEl           = document.getElementById('brand-workspace');

        if (avatarBtn) avatarBtn.style.backgroundImage = 'none';
        if (dropWrap)  dropWrap.style.backgroundImage = 'none';

        if (photo) {
          if (avatarImg)      { avatarImg.src = photo; avatarImg.style.display = 'block'; }
          if (avatarInitials) avatarInitials.style.display = 'none';
          if (dropWrap)       { dropWrap.style.backgroundImage = 'none'; }
          if (dropImg)        { dropImg.src = photo; dropImg.style.display = 'block'; }
          if (dropInitials)   dropInitials.style.display = 'none';
        }
        if (username && wsEl) wsEl.textContent = '@' + username;
        break;
      } catch(e) {}
    }
  })();

  // Load profile on page start
  loadUserProfile();

  /* ── Quick Win: Auto-refresh timestamps every 60s ──
     "just now" → "1 min ago" → "2 min ago" etc. without reload
  ────────────────────────────────────────────────────── */
  // Auto-refresh removed — no 60s re-render

  // Cross-tab sync: when profile.js saves, update lobby instantly
  window.addEventListener('storage', function(e) {
    if (!e.key || !e.key.startsWith('taskboard-profile-')) return;
    try {
      var cached   = JSON.parse(e.newValue || '{}');
      var photo    = cached.photoURL || '';
      var username = cached.username || '';
      var avatarBtn      = document.getElementById('profile-avatar-btn');
      var avatarImg      = document.getElementById('profile-avatar-img');
      var avatarInitials = document.getElementById('profile-avatar-initials');
      var dropWrap       = document.getElementById('profile-dropdown-avatar-wrap');
      var dropImg        = document.getElementById('profile-dropdown-img');
      var dropInitials   = document.getElementById('profile-dropdown-initials');
      var wsEl           = document.getElementById('brand-workspace');

      if (avatarBtn) avatarBtn.style.backgroundImage = 'none';
      if (dropWrap)  dropWrap.style.backgroundImage = 'none';

      if (photo) {
        if (avatarImg)      { avatarImg.src = photo; avatarImg.style.display = 'block'; }
        if (avatarInitials) avatarInitials.style.display = 'none';
        if (dropImg)        { dropImg.src = photo; dropImg.style.display = 'block'; }
        if (dropInitials)   dropInitials.style.display = 'none';
      } else {
        if (avatarImg)      { avatarImg.src = ''; avatarImg.style.display = 'none'; }
        if (avatarInitials) avatarInitials.style.display = 'block';
        if (dropImg)        { dropImg.src = ''; dropImg.style.display = 'none'; }
        if (dropInitials)   dropInitials.style.display = 'block';
      }
      if (wsEl) wsEl.textContent = username ? '@' + username : 'My Workspace';
    } catch(e) {}
  });

  // ── Toggle dropdown open/close ──
  $('#profile-avatar-btn').on('click', function (e) {
    e.stopPropagation();
    var $dropdown = $('#profile-dropdown');
    if ($dropdown.is(':visible')) {
      $dropdown.fadeOut(150);
    } else {
      $dropdown.fadeIn(180);
    }
  });

  // Close dropdown when clicking anywhere else
  $(document).on('click', function (e) {
    if (!$(e.target).closest('#profile-wrap').length) {
      $('#profile-dropdown').fadeOut(150);
    }
  });

  // ── Logout ──
  $('#btn-logout').on('click', function () {
    var script = document.createElement('script');
    script.type = 'module';
    script.textContent = `
      import { auth } from './firebase.js';
      import { signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
      signOut(auth).then(function() {
        window.location.href = 'login.html';
      });
    `;
    document.head.appendChild(script);
  });

    /* ──────────────────────────────────────────────────────────────
     17. KEYBOARD SHORTCUT — N to focus input
  ────────────────────────────────────────────────────────────── */
  /* ──────────────────────────────────────────────────────────────
     QUICK WIN 4: Keyboard shortcut — press N to add new task
     Only fires when no input/textarea is already focused
  ────────────────────────────────────────────────────────────── */
  $(document).on('keydown', function (e) {
    // Press N → focus task input (skip if typing in any field)
    var tag = document.activeElement.tagName;
    if (e.key === 'n' && !e.ctrlKey && !e.metaKey && !e.altKey &&
        tag !== 'INPUT' && tag !== 'TEXTAREA') {
      e.preventDefault();
      $('#task-input').focus();
      showToast('✏️ Ready to add a task…', 'info');
      return;
    }
  });

  $(document).on('keydown', function (e) {
    if ((e.key === 'n' || e.key === 'N') && !$(e.target).is('input, textarea')) {
      $('#task-input').focus();
      e.preventDefault();
    }
  });

  /* ══════════════════════════════════════════════════════════════
     RECYCLE BIN SYSTEM
  ══════════════════════════════════════════════════════════════ */

  /** Update the red badge count on the bin button */
  function updateBinBadge() {
    var count = binTasks.length;
    if (count > 0) {
      $('#bin-badge').text(count).show();
    } else {
      $('#bin-badge').hide();
    }
  }

  /** Build a single bin task row */
  function buildBinRow(task) {
    var $row = $('<li class="bin-row">').attr('data-bin-id', task.id);

    var $info = $('<div class="bin-row-info">');

    /* Task name with strikethrough */
    var $name = $('<span class="bin-row-name">').text(task.text);

    /* Priority badge (if any) */
    var $badgeWrap = $('<div class="bin-row-badge-row">');
    var taskBoardId = task.boardId || 'default';
    var taskBoard = boards.find(function (b) { return b.id === taskBoardId; });
    var taskBoardName = taskBoard ? taskBoard.name : (taskBoardId === 'default' ? 'My Workspace' : 'Unknown Board');
    $badgeWrap.append(
      $('<span class="bin-item-board-tag">').text(taskBoardName)
    );
    if (task.priority && task.priority !== 'none') {
      $badgeWrap.append(
        $('<span>').addClass('task-priority priority-' + task.priority).text(task.priority)
      );
    }
    if (task.subTasks && task.subTasks.length > 0) {
      $badgeWrap.append(
        $('<span class="bin-row-subs">').text('📋 ' + task.subTasks.length + ' sub-task(s)')
      );
    }

    /* Three timestamps: Created · Completed · Deleted */
    var $timestamps = $('<div class="bin-row-timestamps">');

    /* 1. Created date — always present */
    $timestamps.append(
      $('<span class="bin-ts bin-ts-created">').html(
        '<span class="bin-ts-dot created-dot"></span>' +
        '<strong>Created:</strong> ' + formatDateTime(task.createdAt)
      )
    );

    /* 2. Completed date — only if task was completed */
    if (task.completedAt) {
      $timestamps.append(
        $('<span class="bin-ts bin-ts-done">').html(
          '<span class="bin-ts-dot done-dot"></span>' +
          '<strong>Completed:</strong> ' + formatDateTime(task.completedAt)
        )
      );
    }

    /* 3. Deleted date — always present in bin */
    if (task.deletedAt) {
      $timestamps.append(
        $('<span class="bin-ts bin-ts-deleted">').html(
          '<span class="bin-ts-dot deleted-dot"></span>' +
          '<strong>Deleted:</strong> ' + formatDateTime(task.deletedAt)
        )
      );
    }

    $info.append($name, $badgeWrap, $timestamps);

    var $actions = $('<div class="bin-row-actions">');
    var $restore = $('<button class="btn-bin-restore" title="Restore task">↩ Restore</button>');
    var $permDel = $('<button class="btn-bin-permdel" title="Delete permanently">🗑 Delete</button>');
    $actions.append($restore, $permDel);

    $row.append($info, $actions);
    return $row;
  }

  /** Render all bin tasks into the bin panel */
  function renderBin() {
    var $list = $('#bin-list');
    $list.empty();

    // 1. Populate the filter dropdown options first
    var $filter = $('#bin-board-filter');
    $filter.empty();
    $filter.append($('<option value="all">All Boards</option>'));

    // Gather unique boards from existing boards AND binTasks
    var uniqueBoardIds = [];
    
    // We always include existing boards in the dropdown
    $.each(boards, function(i, b) {
      if (uniqueBoardIds.indexOf(b.id) === -1) {
        uniqueBoardIds.push(b.id);
      }
    });

    // Also include any boards from tasks currently in the bin (even if the board was deleted)
    $.each(binTasks, function(i, t) {
      var bId = t.boardId || 'default';
      if (uniqueBoardIds.indexOf(bId) === -1) {
        uniqueBoardIds.push(bId);
      }
    });

    // Populate options
    $.each(uniqueBoardIds, function(i, bId) {
      var bName = '';
      var isDeleted = false;
      if (bId === 'default') {
        bName = 'My Workspace';
      } else {
        var board = boards.find(function(b) { return b.id === bId; });
        if (board) {
          bName = board.name;
        } else {
          // It's a deleted board, find the name from one of the tasks in the bin
          var taskWithBoardName = binTasks.find(function(t) { return (t.boardId || 'default') === bId && t.boardName; });
          bName = taskWithBoardName ? taskWithBoardName.boardName : 'Unknown Board';
          isDeleted = true;
        }
      }
      
      var displayName = bName + (isDeleted ? ' (Deleted)' : '');
      var $opt = $('<option>').val(bId).text(displayName);
      $filter.append($opt);
    });

    // Set the filter select value to binBoardFilter
    if (!binBoardFilter) {
      binBoardFilter = activeBoardId;
    }
    // If the selected board id is not in the dropdown (e.g. no tasks and board deleted), default to 'all' or activeBoardId
    if ($filter.find('option[value="' + binBoardFilter + '"]').length === 0) {
      binBoardFilter = 'all';
    }
    $filter.val(binBoardFilter);

    // Filter tasks based on binBoardFilter
    var filteredBinTasks = binTasks;
    if (binBoardFilter !== 'all') {
      filteredBinTasks = binTasks.filter(function (t) {
        return (t.boardId || 'default') === binBoardFilter;
      });
    }

    if (filteredBinTasks.length === 0) {
      $('#bin-empty-state').show();
      $list.hide();
    } else {
      $('#bin-empty-state').hide();
      $list.show();
      $.each(filteredBinTasks, function (i, task) {
        var $row = buildBinRow(task);
        $list.append($row);
        $row.hide().fadeIn(150 + i * 40);
      });
    }
    updateBinBadge();
  }

  // Handle filter change
  $(document).on('change', '#bin-board-filter', function() {
    binBoardFilter = $(this).val();
    renderBin();
  });

  /* Open bin overlay */
  $('#btn-open-bin').on('click', function () {
    if (!binBoardFilter) {
      binBoardFilter = activeBoardId;
    }
    renderBin();
    $('#bin-overlay').fadeIn(250);
    $('body').addClass('bin-open');
  });

  /* Close bin overlay */
  $('#btn-bin-close').on('click', closeBin);
  $('#bin-overlay').on('click', function (e) {
    if ($(e.target).is('#bin-overlay')) closeBin();
  });

  function closeBin() {
    $('#bin-overlay').fadeOut(200);
    $('body').removeClass('bin-open');
    binBoardFilter = null; // Clear filter on close so next open defaults to activeBoardId
  }

  /* ── RESTORE from bin ── */
  $('#bin-list').on('click', '.btn-bin-restore', function (e) {
    e.stopPropagation();
    var id   = $(this).closest('.bin-row').attr('data-bin-id');
    var task = binTasks.find(function (t) { return t.id === id; });
    if (!task) return;

    // Prepare the custom restore modal
    var $overlay = $('#restore-modal-overlay');
    if (!$overlay.length) {
      // Fallback if modal elements missing in DOM
      var targetBoardId = task.boardId || 'default';
      doRestore(targetBoardId);
      return;
    }

    // Set task name
    $('#restore-modal-task-name').text('"' + task.text.slice(0, 80) + (task.text.length > 80 ? '…' : '') + '"');

    // Populate board select option list
    var $select = $('#restore-board-select');
    $select.empty();
    
    var hasDefault = false;
    // Add custom boards
    $.each(boards, function (i, b) {
      if (b.id === 'default') hasDefault = true;
      $select.append($('<option>').val(b.id).text(b.name));
    });

    // Fallback in case 'default' was not in boards array
    if (!hasDefault) {
      $select.prepend($('<option>').val('default').text('My Workspace'));
    }

    // Check if the original board still exists in our boards list (or if it was "default" / My Workspace)
    var originalBoardId = task.boardId || 'default';
    var originalBoardExists = (originalBoardId === 'default') || boards.some(function (b) { return b.id === originalBoardId; });

    // Set default selection
    if (originalBoardExists) {
      $select.val(originalBoardId);
      $('#restore-modal-desc').html('Originally on board: <strong>' + (task.boardName || 'My Workspace') + '</strong>');
    } else {
      $select.val('default');
      $('#restore-modal-desc').html('Originally on board: <strong>' + (task.boardName || 'Unknown') + '</strong> <span style="color: var(--rust); font-weight: bold;">(Deleted)</span>. Will default to My Workspace.');
    }

    // Show modal with flex display
    $overlay[0].style.display = 'flex';

    function closeModal() {
      $overlay.hide();
      $('#restore-modal-confirm').off('click.restore');
      $('#restore-modal-cancel').off('click.restore');
      $overlay.off('click.restore');
      $(document).off('keydown.restore');
    }

    $('#restore-modal-confirm').off('click.restore').on('click.restore', function () {
      var selectedBoardId = $select.val();
      closeModal();
      setTimeout(function () {
        doRestore(selectedBoardId);
      }, 180);
    });

    $('#restore-modal-cancel').off('click.restore').on('click.restore', function () {
      closeModal();
    });

    $overlay.off('click.restore').on('click.restore', function (e) {
      if ($(e.target).is($overlay)) closeModal();
    });

    $(document).off('keydown.restore').on('keydown.restore', function (e) {
      if (e.key === 'Escape') closeModal();
    });

    function doRestore(targetBoardId) {
      // Find the board name for the target board
      var targetBoardName = 'My Workspace';
      if (targetBoardId !== 'default') {
        var b = boards.find(function (board) { return board.id === targetBoardId; });
        if (b) targetBoardName = b.name;
      }

      // Remove deletedAt and restore to active tasks with new board info
      delete task.deletedAt;
      task.boardId = targetBoardId;
      task.boardName = targetBoardName;

      tasks.unshift(task);
      saveTasks();

      // Remove from bin
      binTasks = binTasks.filter(function (t) { return t.id !== id; });
      saveBin();
      if (typeof window.deleteTaskFromBinFirestore === 'function') {
        window.deleteTaskFromBinFirestore(id);
      }

      renderBin();
      renderTasks();
      showToast('Task restored ↩', 'success');
    }
  });

  /* ── PERMANENT DELETE (single) — shows confirm modal ── */
  var pendingDeleteId = null;   // stores the id waiting for confirmation

  $('#bin-list').on('click', '.btn-bin-permdel', function (e) {
    e.stopPropagation();
    var id   = $(this).closest('.bin-row').attr('data-bin-id');
    var task = binTasks.find(function (t) { return t.id === id; });
    if (!task) return;

    pendingDeleteId = id;
    $('#confirm-msg').text('"' + task.text + '" will be permanently deleted. This cannot be undone.');
    $('#confirm-overlay').fadeIn(200);
  });

  /* ── EMPTY BIN — shows confirm modal for all ── */
  $('#btn-bin-empty').on('click', function () {
    if (binTasks.length === 0) { showToast('Bin is already empty', 'info'); return; }
    pendingDeleteId = 'ALL';
    $('#confirm-msg').text('All ' + binTasks.length + ' item(s) in the bin will be permanently deleted. This cannot be undone.');
    $('#confirm-overlay').fadeIn(200);
  });

  /* ── CONFIRM MODAL: Cancel ── */
  $('#btn-confirm-cancel').on('click', function () {
    pendingDeleteId = null;
    $('#confirm-overlay').fadeOut(200);
  });
  /* Close confirm if clicking outside box */
  $('#confirm-overlay').on('click', function (e) {
    if ($(e.target).is('#confirm-overlay')) {
      pendingDeleteId = null;
      $('#confirm-overlay').fadeOut(200);
    }
  });

  /* ── CONFIRM MODAL: Delete Permanently ── */
  $('#btn-confirm-delete').on('click', function () {
    if (pendingDeleteId === 'ALL') {
      binTasks = [];
      saveBin();
      if (typeof window.clearBinInFirestore === 'function') {
        window.clearBinInFirestore();
      }
      showToast('Bin emptied permanently 🗑', 'danger');
    } else if (pendingDeleteId) {
      var id = pendingDeleteId;
      binTasks = binTasks.filter(function (t) { return t.id !== id; });
      saveBin();
      if (typeof window.deleteTaskFromBinFirestore === 'function') {
        window.deleteTaskFromBinFirestore(id);
      }
      showToast('Deleted permanently', 'danger');
    }

    pendingDeleteId = null;
    $('#confirm-overlay').fadeOut(200);
    renderBin();
  });

  /* ──────────────────────────────────────────────────────────────
     17. INIT
  ────────────────────────────────────────────────────────────── */
  function backfillTasks() {
    tasks.forEach(function (t) {
      if (!t.createdAt)          t.createdAt   = Date.now();
      if (!('completedAt' in t)) t.completedAt = t.completed ? Date.now() : null;
      if (!('desc' in t))        t.desc        = '';
      if (!('subTasks' in t)) {
        if (t.desc && t.desc.trim()) {
          var lines = t.desc.split('\n').map(function(l){ return l.trim(); }).filter(Boolean);
          t.subTasks = lines.map(function(line) {
            return { id: uid(), text: line, completed: t.completed,
                     completedAt: t.completed ? (t.completedAt || Date.now()) : null,
                     createdAt: Date.now() };
          });
        } else {
          t.subTasks = [];
        }
      }
    });
  }

  (function init() {
    try { tasks    = JSON.parse(localStorage.getItem('taskboard-tasks') || '[]'); } catch(e) { tasks = []; }
    try { binTasks = JSON.parse(localStorage.getItem('taskboard-bin')   || '[]'); } catch(e) { binTasks = []; }
    try { boards   = JSON.parse(localStorage.getItem('taskboard-boards') || '[]'); } catch(e) { boards = []; }
    activeBoardId = localStorage.getItem('taskboard-active-board') || 'default';
    if (boards.length === 0) {
      boards = [{ id: 'default', name: 'My Workspace', createdAt: Date.now() }];
      localStorage.setItem('taskboard-boards', JSON.stringify(boards));
    }
    updateBinBadge();

    // ── IMPORTANT: Never overwrite existing data with demo tasks ──
    // If tasks is empty it could mean Firestore hasn't loaded yet.
    // firestore-sync.js will call window._taskboardInit() when ready.
    // Only show demo tasks if we are certain there is NO cloud data
    // (i.e. the migrated flag is set but still no tasks after loading).
    var migrated = false;
    for (var k = 0; k < localStorage.length; k++) {
      if (localStorage.key(k) && localStorage.key(k).startsWith('taskboard-migrated-')) {
        migrated = true; break;
      }
    }

    // ── Restore saved priority on page load ──
    var storedPrefs = {};
    try { storedPrefs = JSON.parse(localStorage.getItem('taskboard-prefs') || '{}'); } catch(e) {}
    var defaultPri  = storedPrefs.defaultPriority || localStorage.getItem('taskboard-last-priority') || 'none';
    $('.pri-btn').removeClass('active');
    if (defaultPri !== 'none') {
      $('.pri-btn[data-priority="' + defaultPri + '"]').addClass('active');
    }

    // Always load from localStorage immediately — never show a spinner
    // Firestore-sync will call _taskboardInit() later to update if cloud data is newer
    if (tasks.length === 0) {
      tasks = [];
    }

    backfillTasks();
    renderTasks();
  })();


  /* ══════════════════════════════════════════════════════════════
     WEEK 3 — DATA EXPORT  (PDF + CSV) — wired via onclick
  ══════════════════════════════════════════════════════════════ */
  // Export functions moved to global scope — see bottom of file

  // exportPDF moved to global scope

  /* Wire buttons on main page and settings page */
  // Export buttons wired via onclick attributes and global functions

});

/* ================================================================
   GLOBAL EXPORT FUNCTIONS — Week 3
   Outside jQuery block so onclick can call them immediately
================================================================ */
function tbFormatDate(ts) {
  if (!ts) return '';
  var d = new Date(ts);
  return ('0'+d.getDate()).slice(-2)+'/'+('0'+(d.getMonth()+1)).slice(-2)+'/'+d.getFullYear()+' '+('0'+d.getHours()).slice(-2)+':'+('0'+d.getMinutes()).slice(-2);
}

window.exportCSV = function() {
  var taskList = (tasks || []).filter(function(t) {
    return (t.boardId || 'default') === activeBoardId;
  });
  if (!taskList.length) { alert('No tasks to export on this board!'); return; }
  var rows = [['#','Task','Priority','Status','Sub-tasks','Added','Completed']];
  taskList.forEach(function(t, i) {
    var subList = (t.subTasks||[]).map(function(s){ return s.text; }).join(' | ');
    rows.push([
      i+1,
      '"'+(t.text||'').replace(/"/g,'""')+'"',
      t.priority||'none',
      t.completed?'Done':'Active',
      '"'+subList.replace(/"/g,'""')+'"',
      tbFormatDate(t.createdAt),
      t.completedAt ? tbFormatDate(t.completedAt) : ''
    ]);
    (t.subTasks||[]).forEach(function(s,j){
      rows.push([(i+1)+'.'+(j+1),'"  sub: '+(s.text||'').replace(/"/g,'""')+'"','',s.completed?'Done':'Active','',tbFormatDate(s.createdAt),s.completedAt?tbFormatDate(s.completedAt):'']);
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
  if (typeof showToast === 'function') showToast('CSV exported! ✓', 'success');
  else alert('CSV exported!');
};

window.exportPDF = function() {
  var taskList = (tasks || []).filter(function(t) {
    return (t.boardId || 'default') === activeBoardId;
  });
  if (!taskList.length) { alert('No tasks to export on this board!'); return; }
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
      '<td style="padding:8px;font-size:11px;color:#bbb;border-bottom:1px solid #f0ead8">',tbFormatDate(t.createdAt),'</td>',
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
  if (typeof showToast === 'function') showToast('PDF preview opened! ✓', 'success');
};

/* ================================================================
   END script.js
================================================================ */
