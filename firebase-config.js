/**
 * STEP 1: Go to https://console.firebase.google.com
 * STEP 2: Open your project (or create one named "simon-color")
 * STEP 3: Click the gear icon → Project settings
 * STEP 4: Scroll to "Your apps" → click the Web app </> (or "Add app" → Web)
 * STEP 5: You will see something like:
 *
 *   const firebaseConfig = {
 *     apiKey: "AIzaSyB...",
 *     authDomain: "simon-color-abc123.firebaseapp.com",
 *     projectId: "simon-color-abc123",
 *     ...
 *   };
 *
 * STEP 6: Copy EACH value from Firebase and paste below (keep the quotes).
 *         Replace the fake YOUR_... text — do not leave YOUR_API_KEY etc.
 */

const firebaseConfig = {
  apiKey: "AIzaSyC6joFA5cI-5WowbBUaifX9b9rDMcosUU4",
  authDomain: "simon-color.firebaseapp.com",
  projectId: "simon-color",
  storageBucket: "simon-color.firebasestorage.app",
  messagingSenderId: "275708527921",
  appId: "1:275708527921:web:20cf869f528abefe9f9c10",
  measurementId: "G-SKQGDT1BMD"
};

/* Do not edit this — it checks that you pasted real keys */
const FIREBASE_CONFIGURED =
  firebaseConfig.apiKey && firebaseConfig.apiKey !== 'YOUR_API_KEY';

if (FIREBASE_CONFIGURED && typeof firebase !== 'undefined') {
  firebase.initializeApp(firebaseConfig);
}
