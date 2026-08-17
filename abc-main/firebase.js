// =====================================================
// FIREBASE CONFIGURATION
// THOR PROJECT
// =====================================================

import {
    initializeApp
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js";

import {
    getAuth,
    signInAnonymously
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";

import {
    getFirestore
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";


// =====================================================
// FIREBASE CONFIG
// =====================================================

const firebaseConfig = {

    apiKey:
        "AIzaSyDqVgpx9OSwEl_NQIR-KflGD-B0FIysZhc",

    authDomain:
        "du-an-cua-hai.firebaseapp.com",

    projectId:
        "du-an-cua-hai",

    storageBucket:
        "du-an-cua-hai.firebasestorage.app",

    messagingSenderId:
        "924184286263",

    appId:
        "1:924184286263:web:3d7b6b94e74fef87585bb2"

};


// =====================================================
// INITIALIZE FIREBASE
// =====================================================

const app =
    initializeApp(
        firebaseConfig
    );


// =====================================================
// AUTH
// =====================================================

const auth =
    getAuth(
        app
    );


// =====================================================
// FIRESTORE
// =====================================================

const db =
    getFirestore(
        app
    );


// =====================================================
// ANONYMOUS LOGIN
// =====================================================

async function loginAnonymous() {

    try {

        // Nếu thiết bị đã có phiên Firebase
        // thì sử dụng lại phiên hiện tại.

        if (auth.currentUser) {

            return auth.currentUser;

        }


        const result =
            await signInAnonymously(
                auth
            );


        return result.user;

    } catch (error) {

        console.error(
            "Firebase Anonymous Login Error:",
            error
        );

        throw error;
    }
}


// =====================================================
// EXPORT
// =====================================================

export {

    app,

    auth,

    db,

    signInAnonymously,

    loginAnonymous

};
