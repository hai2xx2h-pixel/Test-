import {
    auth,
    db
} from "./firebase.js";


import {
    signInWithEmailAndPassword,
    signOut,
    onAuthStateChanged
} from
    "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";


import {
    collection,
    getDocs,
    getDoc,
    doc,
    setDoc,
    updateDoc,
    deleteDoc,
    serverTimestamp
} from
    "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";


/* ======================================
   DOM
====================================== */

const adminLogin =
    document.getElementById(
        "adminLogin"
    );


const adminPanel =
    document.getElementById(
        "adminPanel"
    );


const adminEmail =
    document.getElementById(
        "adminEmail"
    );


const adminPassword =
    document.getElementById(
        "adminPassword"
    );


const adminLoginButton =
    document.getElementById(
        "adminLoginButton"
    );


const adminLoginMessage =
    document.getElementById(
        "adminLoginMessage"
    );


const adminLogout =
    document.getElementById(
        "adminLogout"
    );


const employeeIdInput =
    document.getElementById(
        "employeeId"
    );


const employeeNameInput =
    document.getElementById(
        "employeeName"
    );


const employeeRoleInput =
    document.getElementById(
        "employeeRole"
    );


const startDateInput =
    document.getElementById(
        "startDate"
    );


const endDateInput =
    document.getElementById(
        "endDate"
    );


const employeeColorInput =
    document.getElementById(
        "employeeColor"
    );


const saveUserButton =
    document.getElementById(
        "saveUser"
    );


const clearFormButton =
    document.getElementById(
        "clearForm"
    );


const usersList =
    document.getElementById(
        "usersList"
    );


/* ======================================
   ADMIN LOGIN
====================================== */

adminLoginButton.addEventListener(
    "click",
    async () => {

        const email =
            adminEmail.value.trim();


        const password =
            adminPassword.value;


        if (
            !email ||
            !password
        ) {

            adminLoginMessage.textContent =
                "Vui lòng nhập email và mật khẩu.";

            return;
        }


        adminLoginButton.disabled =
            true;


        try {

            await signInWithEmailAndPassword(
                auth,
                email,
                password
            );


            adminLoginMessage.textContent =
                "";

        } catch (error) {

            console.error(error);

            adminLoginMessage.textContent =
                "Email hoặc mật khẩu không đúng.";

        } finally {

            adminLoginButton.disabled =
                false;
        }

    }
);


/* ======================================
   AUTH CHECK
====================================== */

onAuthStateChanged(
    auth,
    async user => {

        if (!user) {

            showAdminLogin();

            return;
        }


        /*
         * Kiểm tra UID có nằm trong
         * collection admins hay không.
         */

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


        if (
            !adminSnapshot.exists()
        ) {

            await signOut(
                auth
            );


            adminLoginMessage.textContent =
                "Tài khoản này không có quyền Admin.";

            return;
        }


        showAdminPanel();


        loadUsers();

    }
);


/* ======================================
   SHOW LOGIN
====================================== */

function showAdminLogin() {

    adminLogin.classList.remove(
        "hidden"
    );


    adminPanel.classList.add(
        "hidden"
    );
}


/* ======================================
   SHOW PANEL
====================================== */

function showAdminPanel() {

    adminLogin.classList.add(
        "hidden"
    );


    adminPanel.classList.remove(
        "hidden"
    );
}


/* ======================================
   LOGOUT
====================================== */

adminLogout.addEventListener(
    "click",
    () => {

        signOut(
            auth
        );

    }
);


/* ======================================
   SAVE USER
====================================== */

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


    if (
        !id ||
        !name
    ) {

        alert(
            "Vui lòng nhập mã nhân viên và tên."
        );

        return;
    }


    /*
     * Kiểm tra ký tự ID.
     */

    if (
        !/^[A-Z0-9_-]+$/.test(
            id
        )
    ) {

        alert(
            "Mã nhân viên chỉ được dùng A-Z, 0-9, _ hoặc -."
        );

        return;
    }


    const userRef =
        doc(
            db,
            "users",
            id
        );


    const oldSnapshot =
        await getDoc(
            userRef
        );


    const oldData =
        oldSnapshot.exists()
            ? oldSnapshot.data()
            : {};


    const data = {

        employeeId:
            id,

        name:
            name,

        role:
            role,

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

        /*
         * Không reset session khi sửa
         * thông tin bình thường.
         */

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
            merge:
                true
        }
    );


    alert(
        "Đã lưu nhân viên."
    );


    clearForm();


    loadUsers();
}


/* ======================================
   LOAD USERS
====================================== */

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


        usersList.innerHTML =
            "";


        if (
            snapshot.empty
        ) {

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
            error
        );


        usersList.innerHTML =
            "<p>Không thể tải danh sách.</p>";
    }
}


/* ======================================
   RENDER
====================================== */

function renderUser(
    id,
    user
) {

    const row =
        document.createElement(
            "div"
        );


    row.className =
        "user-row";


    const info =
        document.createElement(
            "div"
        );


    info.className =
        "user-info";


    const name =
        document.createElement(
            "div"
        );


    name.className =
        "user-name";


    name.textContent =
        user.name ||
        "";


    const details =
        document.createElement(
            "div"
        );


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

        ].join(
            "\n"
        );


    info.appendChild(
        name
    );


    info.appendChild(
        details
    );


    const actions =
        document.createElement(
            "div"
        );


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


    /* RESET */

    const reset =
        createButton(
            "Reset thiết bị",
            "button-gray"
        );


    reset.onclick =
        () => {

            resetDevice(
                id
            );

        };


    /* DELETE */

    const remove =
        createButton(
            "Xóa",
            "button-red"
        );


    remove.onclick =
        () => {

            deleteUser(
                id
            );

        };


    actions.appendChild(
        edit
    );


    actions.appendChild(
        toggle
    );


    actions.appendChild(
        reset
    );


    actions.appendChild(
        remove
    );


    row.appendChild(
        info
    );


    row.appendChild(
        actions
    );


    usersList.appendChild(
        row
    );
}


/* ======================================
   BUTTON
====================================== */

function createButton(
    text,
    className
) {

    const button =
        document.createElement(
            "button"
        );


    button.textContent =
        text;


    button.className =
        className;


    return button;
}


/* ======================================
   FILL FORM
====================================== */

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
        user.role ||
        "user";


    employeeColorInput.value =
        user.color ||
        "yellow";


    startDateInput.value =
        convertDate(
            user.startDate
        );


    endDateInput.value =
        convertDate(
            user.endDate
        );
}


/* ======================================
   DATE
====================================== */

function convertDate(
    value
) {

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
            date.getTimezoneOffset()
            * 60000
        );


    return local
        .toISOString()
        .slice(
            0,
            16
        );
}


/* ======================================
   TOGGLE ACTIVE
====================================== */

async function toggleUser(
    id,
    current
) {

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


    loadUsers();
}


/* ======================================
   RESET DEVICE
====================================== */

async function resetDevice(
    id
) {

    if (
        !confirm(
            "Bạn chắc chắn muốn reset thiết bị của nhân viên này?"
        )
    ) {

        return;
    }


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


    loadUsers();
}


/* ======================================
   DELETE
====================================== */

async function deleteUser(
    id
) {

    if (
        !confirm(
            "Bạn chắc chắn muốn xóa nhân viên này?"
        )
    ) {

        return;
    }


    await deleteDoc(
        doc(
            db,
            "users",
            id
        )
    );


    loadUsers();
}


/* ======================================
   CLEAR
====================================== */

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
