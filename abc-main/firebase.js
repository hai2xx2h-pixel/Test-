import { initializeApp } from
    "https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js";

import { getAuth } from
    "https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";

import { getFirestore } from
    "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";


// 🎯 Dán thông số thực tế của bạn vào đây:
const firebaseConfig = {
    apiKey: "AIzaSyDqVgpx9OSwEl_NQIR-KflGD-B0FIysZhc",
    authDomain: "du-an-cua-hai.firebaseapp.com",
    projectId: "du-an-cua-hai",
    storageBucket: "du-an-cua-hai.firebasestorage.app",
    messagingSenderId: "924184286263",
    appId: "1:924184286263:web:3d7b6b94e74fef87585bb2",
    measurementId: "G-8DZLWTWTKW"
};


const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

export {
    app,
    auth,
    db
};firebase.js
