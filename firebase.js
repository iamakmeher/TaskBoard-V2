/* ================================================================
   firebase.js — Firebase Connection & Initialization (v2)
   Added: Firebase Storage for profile picture uploads
================================================================ */

import { initializeApp }               from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, GoogleAuthProvider } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore }                from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { getStorage }                  from "https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js";

const firebaseConfig = {
  apiKey:            "AIzaSyBY2V3W_I6ryyDh413MuOSQun8s2F5mevY",
  authDomain:        "taskboard-21e77.firebaseapp.com",
  projectId:         "taskboard-21e77",
  storageBucket:     "taskboard-21e77.firebasestorage.app",
  messagingSenderId: "234189363705",
  appId:             "1:234189363705:web:54e1d8193594c182758528"
};

const app = initializeApp(firebaseConfig);

export const auth          = getAuth(app);
export const db            = getFirestore(app);
export const storage       = getStorage(app);
export const googleProvider = new GoogleAuthProvider();

console.log("✅ Firebase initialized — taskboard-21e77");
