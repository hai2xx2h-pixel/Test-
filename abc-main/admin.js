import {
    auth,
    db
} from "./firebase.js";


import {
    signInWithEmailAndPassword,
    signOut,
    onAuthStateChanged
} from
    "https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";


import {
    collection,
    getDocs,
    doc,
    getDoc,
    setDoc,
    updateDoc,
    deleteDoc,
    serverTimestamp
} from
    "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";


/* =====================================================
   DOM
===================================================== */

const adminLogin =
    document.getElementById(
        "adminLogin"
    );


const adminPanel =
    document.getElementById(
        "adminPanel"
    );


const email =
    document.getElementById(
        "adminEmail"
    );


const password =
    document.getElementById(
        "adminPassword"
    );


const loginButton =
    document.getElementById(
        "adminLoginButton"
    );


const loginMessage =
    document.getElementById(
        "adminLoginMessage"
    );


const logoutButton =
    document.getElementById(
        "adminLogout"
    );


const employeeId =
    document.getElementById(
        "employeeId"
    );


const employeeName =
    document.getElementById(
        "employeeName"
    );


const employeeRole =
    document.getElementById(
        "employeeRole"
    );


const startDate =
    document.getElementById(
        "startDate"
    );


const endDate =
    document.getElementById(
        "endDate"
    );


const employeeColor =
    document.getElementById(
        "employeeColor"
    );


const saveButton =
    document.getElementById(
        "saveUser"
    );


const clearButton =
    document.getElementById(
        "clearForm"
    );


const usersList =
    document.getElementById(
        "usersList"
    );


/* =====================================================
   LOGIN
===================================================== */

loginButton.addEventListener(
    "click",
    async () => {

        const mail =
            email.value.trim();

        const pass =
            password.value;


        if (
            !mail ||
            !pass
        ) {

            loginMessage.textContent =
                "Nhập email và mật khẩu.";

            return;
        }


        try {

            await signInWithEmailAndPassword(
                auth,
                mail,
                pass
            );


            loginMessage.textContent =
                "";

        } catch (error) {

            console.error(error);

            loginMessage.textContent =
                "Đăng nhập thất bại.";

        }

    }
);


/* =====================================================
   AUTH
===================================================== */

onAuthStateChanged(
    auth,
    async user => {

        if (!user) {

            adminLogin.classList.remove(
                "hidden"
            );

            adminPanel.classList.add(
                "hidden"
            );

            return;
        }


        /*
         * Security Rules vẫn là lớp
         * bảo vệ chính.
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

            await signOut(auth);

            loginMessage.textContent =
                "Tài khoản này không có quyền admin.";

            return;
        }


        adminLogin.classList.add(
            "hidden"
        );


        adminPanel.classList.remove(
            "hidden"
        );


        loadUsers();

    }
);


/* =====================================================
   LOGOUT
===================================================== */

logoutButton.addEventListener(
    "click",
    () => signOut(auth)
);


/* =====================================================
   SAVE USER
===================================================== */

saveButton.addEventListener(
    "click",
    saveUser
);


async function saveUser() {

    const id =
        employeeId.value
            .trim()
            .toUpperCase();


    const name =
        employeeName.value
            .trim();


    if (
        !id ||
        !name
    ) {

        alert(
            "Nhập mã và tên."
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


    let oldData =
        oldSnapshot.exists()
            ? oldSnapshot.data()
            : null;


    await setDoc(
        userRef,
        {

            employeeId:
                id,

            name:
                name,

            role:
                employeeRole.value,

            active:
                oldData?.active ??
                true,

            color:
                employeeColor.value,

            startDate:
                startDate.value
                    ? new Date(
                        startDate.value
                    )
                    : null,

            endDate:
                endDate.value
                    ? new Date(
                        endDate.value
                    )
                    : null,

            activeSession:
                oldData?.activeSession ??
                null,

            timerStart:
                oldData?.timerStart ??
                serverTimestamp(),

            createdAt:
                oldData?.createdAt ??
                serverTimestamp(),

            updatedAt:
                serverTimestamp()

        },
        {
            merge: true
        }
    );


    alert(
        "Đã lưu nhân viên."
    );


    clearForm();

    loadUsers();
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

        console.error(error);

        usersList.innerHTML =
            "<p>Không thể tải dữ liệu.</p>";
    }
}


/* =====================================================
   RENDER USER
===================================================== */

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


    info.innerHTML = `
        <strong>
            ${escapeHTML(
                user.name || ""
            )}
        </strong>

        <small>
            Mã: ${escapeHTML(id)}
            <br>
            Quyền:
            ${escapeHTML(
                user.role || "user"
            )}
            <br>
            Trạng thái:
            ${
                user.active
                    ? "🟢 Active"
                    : "🔴 Inactive"
            }
        </small>
    `;


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
        () => fillForm(
            id,
            user
        );


    /* TOGGLE */

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
        () => toggleUser(
            id,
            user.active
        );


    /* RESET DEVICE */

    const reset =
        createButton(
            "Reset thiết bị",
            "button-gray"
        );


    reset.onclick =
        () => resetDevice(
            id
        );


    /* DELETE */

    const remove =
        createButton(
            "Xóa",
            "button-red"
        );


    remove.onclick =
        () => deleteUser(
            id
        );


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


/* =====================================================
   CREATE BUTTON
===================================================== */

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


/* =====================================================
   EDIT FORM
===================================================== */

function fillForm(
    id,
    user
) {

    employeeId.value =
        id;


    employeeId.disabled =
        true;


    employeeName.value =
        user.name || "";


    employeeRole.value =
        user.role || "user";


    employeeColor.value =
        user.color || "yellow";


    startDate.value =
        toInputDate(
            user.startDate
        );


    endDate.value =
        toInputDate(
            user.endDate
        );
}


/* =====================================================
   DATE → INPUT
===================================================== */

function toInputDate(
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
            date.getTimezoneOffset() *
            60000
        );


    return local
        .toISOString()
        .slice(
            0,
            16
        );
}


/* =====================================================
   TOGGLE
===================================================== */

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


/* =====================================================
   RESET DEVICE
===================================================== */

async function resetDevice(
    id
) {

    const confirmed =
        confirm(
            "Reset thiết bị của nhân viên này?"
        );


    if (!confirmed) {
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
}


/* =====================================================
   DELETE
===================================================== */

async function deleteUser(
    id
) {

    const confirmed =
        confirm(
            "Bạn chắc chắn muốn xóa nhân viên này?"
        );


    if (!confirmed) {
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


/* =====================================================
   CLEAR
===================================================== */

clearButton.addEventListener(
    "click",
    clearForm
);


function clearForm() {

    employeeId.value =
        "";

    employeeName.value =
        "";

    employeeRole.value =
        "user";

    employeeColor.value =
        "yellow";

    startDate.value =
        "";

    endDate.value =
        "";

    employeeId.disabled =
        false;
}


/* =====================================================
   ESCAPE HTML
===================================================== */

function escapeHTML(
    value
) {

    return String(value)

        .replaceAll(
            "&",
            "&amp;"
        )

        .replaceAll(
            "<",
            "&lt;"
        )

        .replaceAll(
            ">",
            "&gt;"
        )

        .replaceAll(
            '"',
            "&quot;"
        )

        .replaceAll(
            "'",
            "&#039;"
        );
}
