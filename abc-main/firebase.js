import { initializeApp } from
    "https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js";

import { getAuth } from
    "https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";

import { getFirestore } from
    "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";


const firebaseConfig = {

    apiKey: "DÁN_API_KEY_CỦA_BẠN",

    authDomain:
        "DÁN_PROJECT_ID.firebaseapp.com",

    projectId:
        "DÁN_PROJECT_ID",

    storageBucket:
        "DÁN_PROJECT_ID.firebasestorage.app",

    messagingSenderId:
        "DÁN_MESSAGING_SENDER_ID",

    appId:
        "DÁN_APP_ID"
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
    db
};
