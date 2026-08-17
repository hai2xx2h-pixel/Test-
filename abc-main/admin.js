import {
    auth,
    db
} from "./firebase.js";

import {
    signInWithEmailAndPassword,
    signOut,
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";

import {
    collection,
    getDocs,
    getDoc,
    doc,
    setDoc,
    updateDoc,
    deleteDoc,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";


/* =====================================================
   DOM
===================================================== */

const adminLogin = document.getElementById("adminLogin");
const adminPanel = document.getElementById("adminPanel");

const adminEmail = document.getElementById("adminEmail");
const adminPassword = document.getElementById("adminPassword");

const adminLoginButton =
    document.getElementById("adminLoginButton");

const adminLoginMessage =
    document.getElementById("adminLoginMessage");

const adminLogout =
    document.getElementById("adminLogout");

const employeeIdInput =
    document.getElementById("employeeId");

const employeeNameInput =
    document.getElementById("employeeName");

const employeeRoleInput =
    document.getElementById("employeeRole");

const startDateInput =
    document.getElementById("startDate");

const endDateInput =
    document.getElementById("endDate");

const employeeColorInput =
    document.getElementById("employeeColor");

const saveUserButton =
    document.getElementById("saveUser");

const clearFormButton =
    document.getElementById("clearForm");

const usersList =
    document.getElementById("usersList");


/* =====================================================
   HIỂN THỊ
===================================================== */

function showAdminLogin() {

    adminLogin.classList.remove("hidden");

    adminPanel.classList.add("hidden");
}


function showAdminPanel() {

    adminLogin.classList.add("hidden");

    adminPanel.classList.remove("hidden");
}


/* =====================================================
   HIỂN THỊ LỖI FIREBASE
===================================================== */

function getFirebaseErrorMessage(error) {

    console.error("Firebase error:", error);
    console.error("Error code:", error?.code);
    console.error("Error message:", error?.message);

    switch (error?.code) {

        case "auth/invalid-credential":
            return "Email hoặc mật khẩu không đúng.";

        case "auth/invalid-email":
            return "Email không hợp lệ.";

        case "auth/user-disabled":
            return "Tài khoản này đã bị khóa.";

        case "auth/user-not-found":
            return "Không tìm thấy tài khoản.";

        case "auth/wrong-password":
            return "Mật khẩu không đúng.";

        case "auth/too-many-requests":
            return "Có quá nhiều lần đăng nhập thất bại. Hãy thử lại sau.";

        case "auth/operation-not-allowed":
            return "Phương thức Email/Password chưa được bật trong Firebase.";

        case "auth/network-request-failed":
            return "Không thể kết nối Firebase. Kiểm tra Internet.";

        case "auth/unauthorized-domain":
            return "Domain hiện tại chưa được thêm vào Authorized domains.";

        default:
            return "Đăng nhập thất bại: " +
                (error?.message || "Lỗi không xác định.");
    }
}


/* =====================================================
   ADMIN LOGIN
===================================================== */

adminLoginButton.addEventListener(
    "click",
    loginAdmin
);


adminPassword.addEventListener(
    "keydown",
    event => {

        if (event.key === "Enter") {
            loginAdmin();
        }

    }
);


adminEmail.addEventListener(
    "keydown",
    event => {

        if (event.key === "Enter") {
            loginAdmin();
        }

    }
);


async function loginAdmin() {

    const email =
        adminEmail.value.trim();

    const password =
        adminPassword.value;


    if (!email || !password) {

        adminLoginMessage.textContent =
            "Vui lòng nhập email và mật khẩu.";

        return;
    }


    adminLoginButton.disabled = true;

    adminLoginMessage.textContent =
        "Đang đăng nhập...";


    try {

        const result =
            await signInWithEmailAndPassword(
                auth,
                email,
                password
            );


        console.log(
            "Firebase Auth thành công:",
            result.user.uid
        );


        adminLoginMessage.textContent =
            "Đăng nhập thành công.";

    } catch (error) {

        adminLoginMessage.textContent =
            getFirebaseErrorMessage(error);

    } finally {

        adminLoginButton.disabled = false;

    }

}


/* =====================================================
   KIỂM TRA ADMIN
===================================================== */

onAuthStateChanged(
    auth,
    async user => {

        console.log(
            "Auth state:",
            user
                ? user.uid
                : "Chưa đăng nhập"
        );


        if (!user) {

            showAdminLogin();

            return;
        }


        try {

            const adminRef =
                doc(
                    db,
                    "admins",
                    user.uid
                );


            const adminSnapshot =
                await getDoc(
                    adminRef
                );


            if (!adminSnapshot.exists()) {

                console.error(
                    "UID không tồn tại trong admins:",
                    user.uid
                );


                await signOut(auth);


                adminLoginMessage.textContent =
                    "Tài khoản đăng nhập được nhưng chưa được cấp quyền Admin.";

                showAdminLogin();

                return;
            }


            console.log(
                "Admin xác thực thành công:",
                user.uid
            );


            showAdminPanel();

            await loadUsers();


        } catch (error) {

            console.error(
                "Lỗi kiểm tra Admin:",
                error
            );


            await signOut(auth);


            adminLoginMessage.textContent =
                "Không thể kiểm tra quyền Admin: " +
                (error.message || "");

            showAdminLogin();

        }

    }
);


/* =====================================================
   LOGOUT
===================================================== */

adminLogout.addEventListener(
    "click",
    async () => {

        try {

            await signOut(auth);

            clearForm();

            showAdminLogin();

        } catch (error) {

            console.error(
                "Logout error:",
                error
            );

        }

    }
);


/* =====================================================
   SAVE USER
===================================================== */

saveUserButton.addEventListener(
    "click",
    saveUser
);


async function saveUser() {

    const id =
        employeeIdInput.value
            .trim()
            .toUpperCase();


    const name =
        employeeNameInput.value
            .trim();


    const role =
        employeeRoleInput.value;


    const color =
        employeeColorInput.value;


    if (!id || !name) {

        alert(
            "Vui lòng nhập mã nhân viên và tên."
        );

        return;
    }


    if (!/^[A-Z0-9_-]+$/.test(id)) {

        alert(
            "Mã nhân viên chỉ được dùng A-Z, 0-9, _ hoặc -."
        );

        return;
    }


    saveUserButton.disabled = true;


    try {

        const userRef =
            doc(
                db,
                "users",
                id
            );


        const oldSnapshot =
            await getDoc(userRef);


        const oldData =
            oldSnapshot.exists()
                ? oldSnapshot.data()
                : {};


        const data = {

            employeeId: id,

            name: name,

            role: role,

            active:
                oldData.active ??
                true,

            color:
                color,

            startDate:
                startDateInput.value
                    ? new Date(
                        startDateInput.value
                    )
                    : null,

            endDate:
                endDateInput.value
                    ? new Date(
                        endDateInput.value
                    )
                    : null,

            activeSession:
                oldData.activeSession ??
                null,

            timerStart:
                oldData.timerStart ??
                serverTimestamp(),

            createdAt:
                oldData.createdAt ??
                serverTimestamp(),

            updatedAt:
                serverTimestamp()
        };


        await setDoc(
            userRef,
            data,
            {
                merge: true
            }
        );


        alert(
            "Đã lưu nhân viên."
        );


        clearForm();

        await loadUsers();


    } catch (error) {

        console.error(
            "Save user error:",
            error
        );


        alert(
            "Không thể lưu nhân viên:\n" +
            (error.message || "Lỗi không xác định.")
        );

    } finally {

        saveUserButton.disabled = false;

    }

}


/* =====================================================
   LOAD USERS
===================================================== */

async function loadUsers() {

    usersList.innerHTML =
        "Đang tải...";


    try {

        const snapshot =
            await getDocs(
                collection(
                    db,
                    "users"
                )
            );


        usersList.innerHTML = "";


        if (snapshot.empty) {

            usersList.innerHTML =
                "<p>Chưa có nhân viên.</p>";

            return;
        }


        snapshot.forEach(
            userDoc => {

                renderUser(
                    userDoc.id,
                    userDoc.data()
                );

            }
        );


    } catch (error) {

        console.error(
            "Load users error:",
            error
        );


        usersList.innerHTML =
            "<p>Không thể tải danh sách.</p>";

    }

}


/* =====================================================
   RENDER USER
===================================================== */

function renderUser(id, user) {

    const row =
        document.createElement("div");

    row.className =
        "user-row";


    const info =
        document.createElement("div");

    info.className =
        "user-info";


    const name =
        document.createElement("div");

    name.className =
        "user-name";

    name.textContent =
        user.name || "";


    const details =
        document.createElement("div");

    details.className =
        "user-details";


    details.textContent =
        [
            `Mã: ${id}`,

            `Quyền: ${user.role || "user"}`,

            `Trạng thái: ${
                user.active
                    ? "🟢 Active"
                    : "🔴 Inactive"
            }`,

            `Thiết bị: ${
                user.activeSession
                    ? "🟢 Đang sử dụng"
                    : "⚪ Chưa đăng nhập"
            }`

        ].join("\n");


    info.appendChild(name);

    info.appendChild(details);


    const actions =
        document.createElement("div");

    actions.className =
        "user-actions";


    /* EDIT */

    const edit =
        createButton(
            "Sửa",
            "button-gray"
        );


    edit.onclick =
        () => {

            fillForm(
                id,
                user
            );

        };


    /* LOCK */

    const toggle =
        createButton(

            user.active
                ? "Khóa"
                : "Mở khóa",

            user.active
                ? "button-red"
                : "button-green"

        );


    toggle.onclick =
        () => {

            toggleUser(
                id,
                user.active
            );

        };


    /* RESET DEVICE */

    const reset =
        createButton(
            "Reset thiết bị",
            "button-gray"
        );


    reset.onclick =
        () => {

            resetDevice(id);

        };


    /* DELETE */

    const remove =
        createButton(
            "Xóa",
            "button-red"
        );


    remove.onclick =
        () => {

            deleteUser(id);

        };


    actions.appendChild(edit);

    actions.appendChild(toggle);

    actions.appendChild(reset);

    actions.appendChild(remove);


    row.appendChild(info);

    row.appendChild(actions);


    usersList.appendChild(row);

}


/* =====================================================
   CREATE BUTTON
===================================================== */

function createButton(
    text,
    className
) {

    const button =
        document.createElement("button");


    button.textContent =
        text;


    button.className =
        className;


    return button;

}


/* =====================================================
   FILL FORM
===================================================== */

function fillForm(
    id,
    user
) {

    employeeIdInput.value =
        id;

    employeeIdInput.disabled =
        true;


    employeeNameInput.value =
        user.name || "";


    employeeRoleInput.value =
        user.role || "user";


    employeeColorInput.value =
        user.color || "yellow";


    startDateInput.value =
        convertDate(
            user.startDate
        );


    endDateInput.value =
        convertDate(
            user.endDate
        );

}


/* =====================================================
   CONVERT DATE
===================================================== */

function convertDate(value) {

    if (!value) {
        return "";
    }


    let date;


    if (
        typeof value.toDate ===
        "function"
    ) {

        date =
            value.toDate();

    } else {

        date =
            new Date(value);

    }


    if (
        Number.isNaN(
            date.getTime()
        )
    ) {

        return "";
    }


    const local =
        new Date(
            date.getTime() -
            date.getTimezoneOffset() *
            60000
        );


    return local
        .toISOString()
        .slice(0, 16);

}


/* =====================================================
   TOGGLE ACTIVE
===================================================== */

async function toggleUser(
    id,
    current
) {

    try {

        await updateDoc(

            doc(
                db,
                "users",
                id
            ),

            {

                active:
                    !current,

                updatedAt:
                    serverTimestamp()

            }

        );


        await loadUsers();


    } catch (error) {

        console.error(
            "Toggle user error:",
            error
        );


        alert(
            "Không thể thay đổi trạng thái:\n" +
            error.message
        );

    }

}


/* =====================================================
   RESET DEVICE
===================================================== */

async function resetDevice(id) {

    if (
        !confirm(
            "Bạn chắc chắn muốn reset thiết bị của nhân viên này?"
        )
    ) {

        return;
    }


    try {

        await updateDoc(

            doc(
                db,
                "users",
                id
            ),

            {

                activeSession:
                    null,

                updatedAt:
                    serverTimestamp()

            }

        );


        alert(
            "Đã reset thiết bị."
        );


        await loadUsers();


    } catch (error) {

        console.error(
            "Reset device error:",
            error
        );


        alert(
            "Không thể reset thiết bị:\n" +
            error.message
        );

    }

}


/* =====================================================
   DELETE USER
===================================================== */

async function deleteUser(id) {

    if (
        !confirm(
            "Bạn chắc chắn muốn xóa nhân viên này?"
        )
    ) {

        return;
    }


    try {

        await deleteDoc(

            doc(
                db,
                "users",
                id
            )

        );


        await loadUsers();


    } catch (error) {

        console.error(
            "Delete user error:",
            error
        );


        alert(
            "Không thể xóa nhân viên:\n" +
            error.message
        );

    }

}


/* =====================================================
   CLEAR FORM
===================================================== */

clearFormButton.addEventListener(
    "click",
    clearForm
);


function clearForm() {

    employeeIdInput.value =
        "";

    employeeIdInput.disabled =
        false;


    employeeNameInput.value =
        "";


    employeeRoleInput.value =
        "user";


    employeeColorInput.value =
        "yellow";


    startDateInput.value =
        "";

    endDateInput.value =
        "";

}
