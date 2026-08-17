import { initializeApp } from
    "https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js";

import {
    getAuth,
    signInAnonymously,
    onAuthStateChanged
} from
    "https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";

import { getFirestore } from
    "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";


const firebaseConfig = {
    apiKey: "AIzaSyDqVgpx9OSwEl_NQIR-KflGD-B0FIysZhc",
    authDomain: "du-an-cua-hai.firebaseapp.com",
    projectId: "du-an-cua-hai",
    storageBucket: "du-an-cua-hai.firebasestorage.app",
    messagingSenderId: "924184286263",
    appId: "1:924184286263:web:3d7b6b94e74fef87585bb2"
};


// Khởi tạo Firebase
const app = initializeApp(firebaseConfig);

// Firebase Authentication
const auth = getAuth(app);

// Firestore
const db = getFirestore(app);


// Đăng nhập Anonymous
async function loginAnonymous() {
    try {
        // Nếu đã đăng nhập rồi thì dùng tài khoản hiện tại
        if (auth.currentUser) {
            console.log("Firebase đã đăng nhập:", auth.currentUser.uid);
            return auth.currentUser;
        }

        // Nếu chưa có tài khoản thì đăng nhập Anonymous
        const result = await signInAnonymously(auth);

        console.log(
            "Firebase Anonymous Login thành công:",
            result.user.uid
        );

        return result.user;

    } catch (error) {

        console.error("Firebase Login thất bại");
        console.error("Error code:", error.code);
        console.error("Error message:", error.message);

        throw error;
    }
}


// Theo dõi trạng thái đăng nhập
onAuthStateChanged(auth, (user) => {

    if (user) {
        console.log("Firebase User:", user.uid);
        console.log("Anonymous:", user.isAnonymous);
    } else {
        console.log("Firebase chưa đăng nhập");
    }

});


export {
    app,
    auth,
    db,
    loginAnonymous
};
