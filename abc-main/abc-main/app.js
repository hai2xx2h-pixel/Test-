import {
    db
} from "./firebase.js";


import {
    doc,
    getDoc,
    updateDoc,
    onSnapshot,
    serverTimestamp
} from
    "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";


/* =====================================================
   DOM
===================================================== */

const loginScreen =
    document.getElementById(
        "loginScreen"
    );


const appScreen =
    document.getElementById(
        "appScreen"
    );


const employeeCodeInput =
    document.getElementById(
        "employeeCodeInput"
    );


const loginButton =
    document.getElementById(
        "loginButton"
    );


const loginMessage =
    document.getElementById(
        "loginMessage"
    );


const employeeHeader =
    document.getElementById(
        "employeeHeader"
    );


const userName =
    document.getElementById(
        "userName"
    );


const accountStatus =
    document.getElementById(
        "accountStatus"
    );


const cardHeader =
    document.getElementById(
        "cardHeader"
    );


const headerText =
    document.getElementById(
        "headerText"
    );


const currentTime =
    document.getElementById(
        "currentTime"
    );


const statusTimer =
    document.getElementById(
        "statusTimer"
    );


const qrcode =
    document.getElementById(
        "qrcode"
    );


const refreshButton =
    document.getElementById(
        "refreshButton"
    );


const logoutButton =
    document.getElementById(
        "logoutButton"
    );


/* =====================================================
   SESSION
===================================================== */

const SESSION_KEY =
    "thor_session_id";


const EMPLOYEE_KEY =
    "thor_employee_id";


let employeeId =
    localStorage.getItem(
        EMPLOYEE_KEY
    );


let sessionId =
    localStorage.getItem(
        SESSION_KEY
    );


let unsubscribeUser =
    null;


let timerInterval =
    null;


/* =====================================================
   DEVICE SESSION ID
===================================================== */

function createSessionId() {

    return (
        crypto.randomUUID() +
        "-" +
        Date.now().toString(36)
    );
}


/* =====================================================
   DATE
===================================================== */

function normalizeDate(value) {

    if (!value) {
        return null;
    }


    if (
        typeof value.toDate ===
        "function"
    ) {

        return value.toDate();

    }


    if (value instanceof Date) {

        return value;

    }


    const date =
        new Date(value);


    if (
        Number.isNaN(
            date.getTime()
        )
    ) {

        return null;

    }


    return date;
}


/* =====================================================
   CHECK DATE
===================================================== */

function checkDateRange(user) {

    const now =
        new Date();


    const start =
        normalizeDate(
            user.startDate
        );


    const end =
        normalizeDate(
            user.endDate
        );


    if (
        start &&
        now < start
    ) {

        return {
            ok: false,
            message:
                "Tài khoản chưa đến thời gian sử dụng."
        };

    }


    if (
        end &&
        now > end
    ) {

        return {
            ok: false,
            message:
                "Tài khoản đã hết hạn."
        };

    }


    return {
        ok: true
    };
}


/* =====================================================
   LOGIN
===================================================== */

async function login() {

    const code =
        employeeCodeInput.value
            .trim()
            .toUpperCase();


    if (!code) {

        showLoginError(
            "请输入员工编号"
        );

        return;
    }


    loginButton.disabled =
        true;


    loginMessage.textContent =
        "正在验证...";


    try {

        const userRef =
            doc(
                db,
                "users",
                code
            );


        const snapshot =
            await getDoc(
                userRef
            );


        if (
            !snapshot.exists()
        ) {

            throw new Error(
                "Mã nhân viên không tồn tại."
            );

        }


        const user =
            snapshot.data();


        if (
            user.active !== true
        ) {

            throw new Error(
                "Tài khoản đã bị vô hiệu hóa."
            );

        }


        const dateCheck =
            checkDateRange(
                user
            );


        if (
            !dateCheck.ok
        ) {

            throw new Error(
                dateCheck.message
            );

        }


        /*
         * Mỗi lần đăng nhập tạo
         * session ID mới.
         *
         * Nếu thiết bị khác đăng nhập
         * bằng cùng mã, session cũ
         * sẽ không còn hợp lệ.
         */

        const newSession =
            createSessionId();


        await updateDoc(
            userRef,
            {

                activeSession:
                    newSession,

                lastLogin:
                    serverTimestamp()

            }
        );


        employeeId =
            code;


        sessionId =
            newSession;


        localStorage.setItem(
            EMPLOYEE_KEY,
            employeeId
        );


        localStorage.setItem(
            SESSION_KEY,
            sessionId
        );


        openApp();

    } catch (error) {

        console.error(error);

        showLoginError(
            error.message ||
            "Không thể đăng nhập."
        );

    } finally {

        loginButton.disabled =
            false;

    }
}


/* =====================================================
   OPEN APP
===================================================== */

async function openApp() {

    loginScreen.classList.add(
        "hidden"
    );


    appScreen.classList.remove(
        "hidden"
    );


    await loadUser();


    startClock();

}


/* =====================================================
   LOAD USER
===================================================== */

async function loadUser() {

    if (
        !employeeId ||
        !sessionId
    ) {

        logout();

        return;
    }


    const userRef =
        doc(
            db,
            "users",
            employeeId
        );


    /*
     * realtime listener
     *
     * Admin thay đổi dữ liệu
     * → app nhận thay đổi.
     */

    unsubscribeUser =
        onSnapshot(
            userRef,
            snapshot => {

                if (
                    !snapshot.exists()
                ) {

                    logout();

                    return;
                }


                const user =
                    snapshot.data();


                /*
                 * Kiểm tra session
                 */

                if (
                    user.activeSession !==
                    sessionId
                ) {

                    alert(
                        "Phiên đăng nhập đã được sử dụng trên thiết bị khác."
                    );

                    logout();

                    return;
                }


                /*
                 * Kiểm tra active
                 */

                if (
                    user.active !== true
                ) {

                    alert(
                        "Tài khoản đã bị khóa."
                    );

                    logout();

                    return;
                }


                /*
                 * Kiểm tra thời gian
                 */

                const dateCheck =
                    checkDateRange(
                        user
                    );


                if (
                    !dateCheck.ok
                ) {

                    alert(
                        dateCheck.message
                    );

                    logout();

                    return;
                }


                renderUser(
                    user
                );

            },
            error => {

                console.error(
                    error
                );

            }
        );
}


/* =====================================================
   RENDER USER
===================================================== */

function renderUser(user) {

    employeeHeader.textContent =
        `${user.employeeId || employeeId}` +
        `(${user.name || ""})`;


    userName.textContent =
        user.name ||
        "";


    accountStatus.textContent =
        user.active
            ? "Active"
            : "Inactive";


    /*
     * Màu được lưu trên server.
     */

    applyColor(
        user.color === "green"
    );


    /*
     * Timer
     */

    if (
        user.timerStart
    ) {

        startTimer(
            normalizeDate(
                user.timerStart
            )
        );

    }


    /*
     * QR demo
     */

    generateDemoQR(
        user.employeeId ||
        employeeId,
        user.name || ""
    );
}


/* =====================================================
   COLOR
===================================================== */

function applyColor(isGreen) {

    if (isGreen) {

        cardHeader.style.backgroundColor =
            "#38a754";


        headerText.textContent =
            "DEMO - GREEN STATE";

    } else {

        cardHeader.style.backgroundColor =
            "#f2c75b";


        headerText.textContent =
            "DEMO - YELLOW STATE";
    }
}


/* =====================================================
   CLOCK
===================================================== */

function startClock() {

    if (
        timerInterval
    ) {

        clearInterval(
            timerInterval
        );

    }


    function update() {

        const now =
            new Date();


        currentTime.textContent =
            `${now.getFullYear()}-` +
            `${String(
                now.getMonth() + 1
            ).padStart(2, "0")}-` +
            `${String(
                now.getDate()
            ).padStart(2, "0")} ` +
            `${String(
                now.getHours()
            ).padStart(2, "0")}:` +
            `${String(
                now.getMinutes()
            ).padStart(2, "0")}:` +
            `${String(
                now.getSeconds()
            ).padStart(2, "0")}`;
    }


    update();


    setInterval(
        update,
        1000
    );
}


/* =====================================================
   TIMER
===================================================== */

function startTimer(start) {

    if (!start) {
        return;
    }


    function updateTimer() {

        const elapsed =
            Math.max(
                0,
                Math.floor(
                    (
                        Date.now() -
                        start.getTime()
                    ) / 1000
                )
            );


        const h =
            Math.floor(
                elapsed / 3600
            );


        const m =
            Math.floor(
                (elapsed % 3600) / 60
            );


        const s =
            elapsed % 60;


        statusTimer.textContent =
            `${pad(h)}:` +
            `${pad(m)}:` +
            `${pad(s)}`;
    }


    updateTimer();


    setInterval(
        updateTimer,
        1000
    );
}


function pad(value) {

    return String(value)
        .padStart(2, "0");
}


/* =====================================================
   QR DEMO
===================================================== */

function generateDemoQR(
    employeeId,
    name
) {

    const data =
        JSON.stringify({

            type: "THOR-DEMO",

            employeeId:
                employeeId,

            name:
                name,

            timestamp:
                Date.now()

        });


    qrcode.innerHTML = "";


    /*
     * QR demo bằng dịch vụ tạo ảnh.
     *
     * Không dùng làm mã xác thực
     * ra/vào thực tế.
     */

    const img =
        document.createElement(
            "img"
        );


    img.alt =
        "THOR Demo QR";


    img.src =
        "https://api.qrserver.com/v1/create-qr-code/" +
        "?size=220x220&data=" +
        encodeURIComponent(
            data
        );


    qrcode.appendChild(
        img
    );
}


refreshButton.addEventListener(
    "click",
    async () => {

        if (!employeeId) {
            return;
        }


        const ref =
            doc(
                db,
                "users",
                employeeId
            );


        const snapshot =
            await getDoc(
                ref
            );


        if (
            snapshot.exists()
        ) {

            const user =
                snapshot.data();


            generateDemoQR(
                user.employeeId ||
                employeeId,
                user.name || ""
            );

        }

    }
);


/* =====================================================
   LOGOUT
===================================================== */

async function logout() {

    if (
        unsubscribeUser
    ) {

        unsubscribeUser();

        unsubscribeUser =
            null;
    }


    employeeId = null;
    sessionId = null;


    localStorage.removeItem(
        EMPLOYEE_KEY
    );


    localStorage.removeItem(
        SESSION_KEY
    );


    appScreen.classList.add(
        "hidden"
    );


    loginScreen.classList.remove(
        "hidden"
    );


    employeeCodeInput.value =
        "";


    loginMessage.textContent =
        "";
}


logoutButton.addEventListener(
    "click",
    logout
);


/* =====================================================
   LOGIN ERROR
===================================================== */

function showLoginError(
    message
) {

    loginMessage.textContent =
        message;
}


/* =====================================================
   LOGIN BUTTON
===================================================== */

loginButton.addEventListener(
    "click",
    login
);


employeeCodeInput.addEventListener(
    "keydown",
    event => {

        if (
            event.key === "Enter"
        ) {

            login();

        }

    }
);
