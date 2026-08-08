/* ================================================================
   firebase.js — Firebase Connection & Initialization (v2)
   Added: Firebase Storage for profile picture uploads
================================================================ */

import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, GoogleAuthProvider } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { 
  initializeFirestore, 
  getFirestore,
  persistentLocalCache, 
  persistentMultipleTabManager 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { getStorage }                  from "https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js";

const firebaseConfig = {
  apiKey:            "AIzaSyBY2V3W_I6ryyDh413MuOSQun8s2F5mevY",
  authDomain:        "taskboard-21e77.firebaseapp.com",
  projectId:         "taskboard-21e77",
  storageBucket:     "taskboard-21e77.firebasestorage.app",
  messagingSenderId: "234189363705",
  appId:             "1:234189363705:web:54e1d8193594c182758528"
};

// Safe initialization of Firebase App to prevent duplicate initialization error
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

export const auth          = getAuth(app);

// Safe initialization of Firestore with persistent local cache.
// If it fails (e.g. storage restriction in some mobile/PWA contexts), fallback to standard Firestore db client.
let tempDb;
try {
  tempDb = initializeFirestore(app, {
    localCache: persistentLocalCache({
      tabManager: persistentMultipleTabManager()
    })
  });
} catch (e) {
  console.warn("Failed to initialize Firestore with persistent local cache. Falling back to default.", e);
  tempDb = getFirestore(app);
}

export const db = tempDb;
export const storage       = getStorage(app);
export const googleProvider = new GoogleAuthProvider();

console.log("✅ Firebase initialized — taskboard-21e77");
