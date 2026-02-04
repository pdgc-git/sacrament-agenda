// Import the functions you need from the SDKs you need
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-analytics.js";
import { getFirestore, connectFirestoreEmulator } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
import { getAuth, connectAuthEmulator } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";

// TODO: Replace the following with your app's Firebase project configuration
// See: https://firebase.google.com/docs/web/setup#config-object

const firebaseConfig = {
    apiKey: "AIzaSyCv2BUKsFBE_2J-xcmVCVT2LXBT18vxFiQ",
    authDomain: "ward-planner-agenda.firebaseapp.com",
    projectId: "ward-planner-agenda",
    storageBucket: "ward-planner-agenda.firebasestorage.app",
    messagingSenderId: "845516166505",
    appId: "1:845516166505:web:e17772fe0d4025e4bd59f8",
    measurementId: "G-0Y3YPBHHS5"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
// const analytics = getAnalytics(app); // Optional

export const db = getFirestore(app);
export const auth = getAuth(app);

console.log("Firebase initialized");

// Uncomment to use local emulators for testing
// connectFirestoreEmulator(db, '127.0.0.1', 8080);
// connectAuthEmulator(auth, 'http://127.0.0.1:9099');
