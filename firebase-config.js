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
  apiKey: 'YOUR_API_KEY',
  authDomain: 'YOUR_PROJECT_ID.firebaseapp.com',
  projectId: 'YOUR_PROJECT_ID',
  storageBucket: 'YOUR_PROJECT_ID.appspot.com',
  messagingSenderId: 'YOUR_SENDER_ID',
  appId: 'YOUR_APP_ID',
};

/* Do not edit this — it checks that you pasted real keys */
const FIREBASE_CONFIGURED =
  firebaseConfig.apiKey && firebaseConfig.apiKey !== 'YOUR_API_KEY';

if (FIREBASE_CONFIGURED && typeof firebase !== 'undefined') {
  firebase.initializeApp(firebaseConfig);
}
