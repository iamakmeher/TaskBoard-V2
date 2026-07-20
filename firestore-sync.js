/* ================================================================
   firestore-sync.js — Sync Tasks with Firebase Firestore
   ================================================================
   This file handles:
   1. Saving tasks to Firestore (per user)
   2. Loading tasks from Firestore
   3. One-time migration from localStorage → Firestore
   4. Recycle bin sync
   ================================================================ */

import { auth, db } from './firebase.js';

import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

import {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  deleteDoc,
  writeBatch,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

/* ──────────────────────────────────────────────────────────────
   1. CURRENT USER — stored globally once auth loads
────────────────────────────────────────────────────────────── */
let currentUser = null;

/* ──────────────────────────────────────────────────────────────
   2. WAIT FOR AUTH — then sync tasks
────────────────────────────────────────────────────────────── */
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    if (localStorage.getItem('resetting-password') === 'true') {
      console.log('Skipping redirect because password reset is in progress');
      return;
    }
    // Not logged in — redirect to login
    window.location.href = 'login.html';
    return;
  }

  currentUser = user;
  localStorage.removeItem('resetting-password');
  console.log('✅ Logged in as:', user.email);

  // Check if this is first login → run migration
  const migrated = localStorage.getItem('taskboard-migrated-' + user.uid);

  if (!migrated) {
    // First time this user logs in on this device
    // Check if they have localStorage tasks to import
    await runMigration(user);
  } else {
    // Already migrated — just load from Firestore
    await loadTasksFromFirestore(user);
  }
});

/* ──────────────────────────────────────────────────────────────
   3. MIGRATION — Import localStorage tasks to Firestore
   Runs ONCE per user per device on first login
────────────────────────────────────────────────────────────── */
async function runMigration(user) {
  try {
    // Check if user already has tasks in Firestore
    const tasksRef  = collection(db, 'users', user.uid, 'tasks');
    const snapshot  = await getDocs(tasksRef);
    const hasCloud  = !snapshot.empty;

    // Check if user has tasks in localStorage
    const localData = localStorage.getItem('taskboard-tasks');
    const localTasks = localData ? JSON.parse(localData) : [];
    const hasTasks  = localTasks.length > 0;

    if (hasTasks && !hasCloud) {
      // Has local tasks but no cloud tasks → show migration prompt
      showMigrationPrompt(user, localTasks);
    } else if (hasCloud) {
      // Already has cloud tasks → just load them
      await loadTasksFromFirestore(user);
      markMigrated(user);
    } else {
      // No tasks anywhere → fresh start
      markMigrated(user);
      window._firestoreReady = true;
    }
  } catch (error) {
    console.error('Migration check error:', error);
    // Fallback — load from localStorage as usual
    markMigrated(user);
    window._firestoreReady = true;
  }
}

/* ──────────────────────────────────────────────────────────────
   4. MIGRATION PROMPT UI
   Shows a beautiful popup asking user if they want to import
   their existing local tasks to the cloud
────────────────────────────────────────────────────────────── */
function showMigrationPrompt(user, localTasks) {
  // Create overlay
  const overlay = document.createElement('div');
  overlay.id    = 'migration-overlay';
  overlay.innerHTML = `
    <div class="migration-box">
      <div class="migration-icon">📦</div>
      <h2 class="migration-title">Import Your Tasks?</h2>
      <p class="migration-msg">
        We found <strong>${localTasks.length} task${localTasks.length !== 1 ? 's' : ''}</strong>
        saved on this device.<br/>
        Would you like to import them to your account
        so you can access them from any device?
      </p>
      <div class="migration-actions">
        <button class="btn-migration-import" id="btn-migration-yes">
          ✅ Yes, Import My Tasks
        </button>
        <button class="btn-migration-skip" id="btn-migration-skip">
          Skip — Start Fresh
        </button>
      </div>
      <p class="migration-note">
        ⓘ Your tasks will be safely stored in the cloud under your account.
      </p>
    </div>
  `;
  document.body.appendChild(overlay);

  // Import button
  document.getElementById('btn-migration-yes').addEventListener('click', async () => {
    overlay.querySelector('.migration-box').innerHTML = `
      <div class="migration-icon">⏳</div>
      <h2 class="migration-title">Importing…</h2>
      <p class="migration-msg">Saving your tasks to the cloud. Please wait.</p>
    `;
    await importLocalTasksToFirestore(user, localTasks);
    overlay.remove();
  });

  // Skip button
  document.getElementById('btn-migration-skip').addEventListener('click', async () => {
    overlay.remove();
    markMigrated(user);
    window._firestoreReady = true;
  });
}

/* ──────────────────────────────────────────────────────────────
   5. IMPORT LOCAL TASKS → FIRESTORE
────────────────────────────────────────────────────────────── */
async function importLocalTasksToFirestore(user, localTasks) {
  try {
    const batch = writeBatch(db);

    localTasks.forEach((task) => {
      const taskRef = doc(db, 'users', user.uid, 'tasks', task.id);
      batch.set(taskRef, {
        ...task,
        importedAt: Date.now()
      });
    });

    await batch.commit();
    console.log('✅ Migrated', localTasks.length, 'tasks to Firestore');

    // Also migrate bin tasks
    const localBin = localStorage.getItem('taskboard-bin');
    if (localBin) {
      const binTasks = JSON.parse(localBin);
      if (binTasks.length > 0) {
        const binBatch = writeBatch(db);
        binTasks.forEach((task) => {
          const ref = doc(db, 'users', user.uid, 'bin', task.id);
          binBatch.set(ref, task);
        });
        await binBatch.commit();
      }
    }

    markMigrated(user);
    await loadTasksFromFirestore(user);

  } catch (error) {
    console.error('Import error:', error);
    markMigrated(user);
    window._firestoreReady = true;
  }
}

/* ──────────────────────────────────────────────────────────────
   6. LOAD TASKS FROM FIRESTORE → localStorage
   We load into localStorage so the existing script.js works
   without needing to rewrite all task logic
────────────────────────────────────────────────────────────── */
async function loadTasksFromFirestore(user) {
  try {
    // Load boards and active board ID from the user document
    const userDocRef = doc(db, 'users', user.uid);
    const userDocSnap = await getDoc(userDocRef);
    let boards = [];
    let activeBoardId = localStorage.getItem('taskboard-active-board') || 'default';
    if (userDocSnap.exists()) {
      const userData = userDocSnap.data();
      if (userData.boards) boards = userData.boards;
      if (userData.activeBoardId) activeBoardId = userData.activeBoardId;
    }

    if (boards.length === 0) {
      const localBoardsStr = localStorage.getItem('taskboard-boards');
      if (localBoardsStr) {
        try { boards = JSON.parse(localBoardsStr); } catch (e) {}
      }
      if (boards.length === 0) {
        boards = [{ id: 'default', name: 'My Workspace', createdAt: Date.now() }];
      }
      // Save it back to Firestore since it wasn't there
      await setDoc(userDocRef, { boards, activeBoardId }, { merge: true });
    }

    localStorage.setItem('taskboard-boards', JSON.stringify(boards));
    localStorage.setItem('taskboard-active-board', activeBoardId);

    // Load tasks
    const tasksSnap = await getDocs(
      collection(db, 'users', user.uid, 'tasks')
    );
    const tasks = [];
    tasksSnap.forEach((d) => tasks.push(d.data()));

    // Sort by createdAt descending (newest first)
    tasks.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

    // Save to localStorage so script.js can use it
    localStorage.setItem('taskboard-tasks', JSON.stringify(tasks));

    // Load bin
    const binSnap = await getDocs(
      collection(db, 'users', user.uid, 'bin')
    );
    const binTasks = [];
    binSnap.forEach((d) => binTasks.push(d.data()));
    localStorage.setItem('taskboard-bin', JSON.stringify(binTasks));

    console.log('✅ Loaded', tasks.length, 'tasks from Firestore');

    // Signal that Firestore is ready
    window._firestoreReady = true;
    window._firestoreUser  = user;

    // Trigger script.js to re-render with fresh cloud data
    // Use retry loop in case script.js hasn't loaded yet
    function triggerInit(attempts) {
      if (typeof window._taskboardInit === 'function') {
        window._taskboardInit();
      } else if (attempts < 30) {
        setTimeout(function() { triggerInit(attempts + 1); }, 100);
      } else {
        console.warn('firestore-sync: _taskboardInit never appeared');
      }
    }
    triggerInit(0);

  } catch (error) {
    console.error('Load error:', error);
    window._firestoreReady = true;
    // Still try to trigger init so page doesn't stay blank
    if (typeof window._taskboardInit === 'function') window._taskboardInit();
  }
}

/* ──────────────────────────────────────────────────────────────
   7. SAVE TASKS TO FIRESTORE
   Called every time tasks change in script.js
────────────────────────────────────────────────────────────── */
window.saveTasksToFirestore = async function(tasks) {
  if (!currentUser) return;
  try {
    const batch = writeBatch(db);

    // Clear existing tasks and re-save all
    // (Simple approach — works well for small task lists)
    tasks.forEach((task) => {
      const ref = doc(db, 'users', currentUser.uid, 'tasks', task.id);
      batch.set(ref, task);
    });

    await batch.commit();
  } catch (error) {
    console.error('Save error:', error);
  }
};

/* ──────────────────────────────────────────────────────────────
   8. DELETE TASK FROM FIRESTORE
────────────────────────────────────────────────────────────── */
window.deleteTaskFromFirestore = async function(taskId) {
  if (!currentUser) return;
  try {
    await deleteDoc(doc(db, 'users', currentUser.uid, 'tasks', taskId));
  } catch (error) {
    console.error('Delete error:', error);
  }
};

/* ──────────────────────────────────────────────────────────────
   9. SAVE BIN TO FIRESTORE
────────────────────────────────────────────────────────────── */
window.saveBinToFirestore = async function(binTasks) {
  if (!currentUser) return;
  try {
    const batch = writeBatch(db);
    binTasks.forEach((task) => {
      const ref = doc(db, 'users', currentUser.uid, 'bin', task.id);
      batch.set(ref, task);
    });
    await batch.commit();
  } catch (error) {
    console.error('Bin save error:', error);
  }
};

/* ──────────────────────────────────────────────────────────────
   9b. DELETE TASK FROM BIN IN FIRESTORE
────────────────────────────────────────────────────────────── */
window.deleteTaskFromBinFirestore = async function(taskId) {
  if (!currentUser) return;
  try {
    await deleteDoc(doc(db, 'users', currentUser.uid, 'bin', taskId));
  } catch (error) {
    console.error('Bin delete error:', error);
  }
};

/* ──────────────────────────────────────────────────────────────
   9c. CLEAR BIN IN FIRESTORE
────────────────────────────────────────────────────────────── */
window.clearBinInFirestore = async function() {
  if (!currentUser) return;
  try {
    const snap = await getDocs(collection(db, 'users', currentUser.uid, 'bin'));
    const batch = writeBatch(db);
    snap.forEach((d) => {
      batch.delete(doc(db, 'users', currentUser.uid, 'bin', d.id));
    });
    await batch.commit();
  } catch (error) {
    console.error('Clear bin error:', error);
  }
};

/* ──────────────────────────────────────────────────────────────
   9d. SAVE BOARDS TO FIRESTORE
────────────────────────────────────────────────────────────── */
window.saveBoardsToFirestore = async function(boards, activeBoardId) {
  if (!currentUser) return;
  try {
    await setDoc(
      doc(db, 'users', currentUser.uid),
      { boards, activeBoardId, boardsUpdatedAt: Date.now() },
      { merge: true }
    );
  } catch (error) {
    console.error('Boards save error:', error);
  }
};

/* ──────────────────────────────────────────────────────────────
   10. HELPER — Mark migration as done for this user
────────────────────────────────────────────────────────────── */
function markMigrated(user) {
  localStorage.setItem('taskboard-migrated-' + user.uid, 'true');
}
