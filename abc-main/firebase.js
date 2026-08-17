import { initializeApp } from
    "https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js";

import { getAuth, signInAnonymously } from
    "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";

import { getFirestore } from
    "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";


const firebaseConfig = {

    apiKey: "DAN_API_KEY_CUA_BAN",

    authDomain:
        "DAN_PROJECT_ID.firebaseapp.com",

    projectId:
        "DAN_PROJECT_ID",

    storageBucket:
        "DAN_PROJECT_ID.firebasestorage.app",

    messagingSenderId:
        "DAN_MESSAGING_SENDER_ID",

    appId:
        "DAN_APP_ID"
};


const app =
    initializeApp(firebaseConfig);


const auth =
    getAuth(app);


const db =
    getFirestore(app);


export {
    app,
    auth,
    db,
    signInAnonymously
};
