import {
    db,
    auth,
    signInAnonymously
} from "./firebase.js";

import {
    doc,
    getDoc,
    updateDoc,
    onSnapshot,
    runTransaction,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";


/* =====================================================
   DOM
===================================================== */

const loginScreen =
    document.getElementById("loginScreen");

const appScreen =
    document.getElementById("appScreen");

const employeeCodeInput =
    document.getElementById("employeeCodeInput");

const loginButton =
    document.getElementById("loginButton");

const loginMessage =
    document.getElementById("loginMessage");

const employeeHeader =
    document.getElementById("employeeHeader");

const cardHeader =
    document.getElementById("cardHeader");

const headerText =
    document.getElementById("headerText");

const currentTime =
    document.getElementById("currentTime");

const statusTimer =
    document.getElementById("statusTimer");

const refreshQRCode =
    document.getElementById("refreshQRCode");

const qrcodeElement =
    document.getElementById("qrcode");


/* =====================================================
   HIDDEN LOGOUT BUTTON
===================================================== */

const logoutButton =
    document.getElementById("logoutButton");

if (logoutButton) {
    logoutButton.style.display = "none";
}


/* =====================================================
   STORAGE
===================================================== */

/*
 * employeeId:
 * Mã nhân viên đã đăng nhập.
 *
 * deviceId:
 * ID cố định của trình duyệt/thiết bị.
 *
 * KHÔNG tạo deviceId mới mỗi lần mở app.
 */

const EMPLOYEE_KEY =
    "thor_employee_id";

const DEVICE_KEY =
    "thor_device_id";


/* =====================================================
   GLOBAL STATE
===================================================== */

let employeeId =
    localStorage.getItem(EMPLOYEE_KEY);

let deviceId =
    localStorage.getItem(DEVICE_KEY);

let unsubscribeUser =
    null;

let clockInterval =
    null;

let timerStart =
    null;

let loginInProgress =
    false;

let pressTimer =
    null;

let isLoggedIn =
    false;


/* =====================================================
   CREATE DEVICE ID
===================================================== */

function createDeviceId() {

    if (
        typeof crypto !== "undefined" &&
        typeof crypto.randomUUID === "function"
    ) {

        return crypto.randomUUID();
    }


    return (
        Date.now().toString(36) +
        "-" +
        Math.random()
            .toString(36)
            .substring(2) +
        "-" +
        Math.random()
            .toString(36)
            .substring(2)
    );
}


/* =====================================================
   INIT DEVICE ID
===================================================== */

if (!deviceId) {

    deviceId =
        createDeviceId();

    localStorage.setItem(
        DEVICE_KEY,
        deviceId
    );
}


/* =====================================================
   UTILITY
===================================================== */

function pad(number) {

    return String(number)
        .padStart(2, "0");
}


function normalizeDate(value) {

    if (!value) {
        return null;
    }


    if (
        typeof value.toDate === "function"
    ) {

        return value.toDate();
    }


    if (
        value instanceof Date
    ) {

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
   FIREBASE AUTH
===================================================== */

async function ensureFirebaseLogin() {

    if (
        auth.currentUser
    ) {

        return auth.currentUser;
    }


    if (
        !navigator.onLine
    ) {

        throw new Error(
            "OFFLINE"
        );
    }


    const result =
        await signInAnonymously(
            auth
        );


    return result.user;
}


/* =====================================================
   CHECK ACCOUNT
===================================================== */

function checkEmployeeAccount(user) {

    if (
        user.active !== true
    ) {

        throw new Error(
            "Tài khoản đã bị khóa."
        );
    }


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

        throw new Error(
            "Tài khoản chưa đến thời gian sử dụng."
        );
    }


    if (
        end &&
        now > end
    ) {

        throw new Error(
            "Tài khoản đã hết hạn."
        );
    }
}


/* =====================================================
   LOGIN EMPLOYEE
===================================================== */

async function login() {

    if (
        loginInProgress
    ) {

        return;
    }


    if (
        !navigator.onLine
    ) {

        showLoginMessage(
            "Không có kết nối mạng."
        );

        return;
    }


    const code =
        employeeCodeInput.value
            .trim()
            .toUpperCase();


    if (!code) {

        showLoginMessage(
            "请输入员工编号"
        );

        return;
    }


    loginInProgress =
        true;


    loginButton.disabled =
        true;


    showLoginMessage(
        "正在验证..."
    );


    try {

        /*
         * ==========================================
         * FIREBASE AUTH
         * ==========================================
         */

        await ensureFirebaseLogin();


        /*
         * ==========================================
         * USER DOCUMENT
         * ==========================================
         */

        const userRef =
            doc(
                db,
                "users",
                code
            );


        /*
         * ==========================================
         * TRANSACTION
         * ==========================================
         */

        await runTransaction(
            db,
            async transaction => {

                const snapshot =
                    await transaction.get(
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


                /*
                 * Kiểm tra tài khoản
                 */

                checkEmployeeAccount(
                    user
                );


                /*
                 * Device đang giữ mã
                 */

                const currentDevice =
                    user.activeSession ||
                    null;


                /*
                 * ======================================
                 * CHƯA CÓ THIẾT BỊ
                 * ======================================
                 */

                if (
                    !currentDevice
                ) {

                    transaction.update(
                        userRef,
                        {

                            activeSession:
                                deviceId,

                            lastLogin:
                                serverTimestamp(),

                            updatedAt:
                                serverTimestamp()

                        }
                    );

                    return;
                }


                /*
                 * ======================================
                 * CÙNG THIẾT BỊ
                 * ======================================
                 *
                 * Cho đăng nhập lại.
                 */

                if (
                    currentDevice ===
                    deviceId
                ) {

                    transaction.update(
                        userRef,
                        {

                            activeSession:
                                deviceId,

                            lastLogin:
                                serverTimestamp(),

                            updatedAt:
                                serverTimestamp()

                        }
                    );

                    return;
                }


                /*
                 * ======================================
                 * THIẾT BỊ KHÁC
                 * ======================================
                 */

                throw new Error(
                    "Mã nhân viên này đang được sử dụng trên thiết bị khác."
                );
            }
        );


        /*
         * ==========================================
         * LƯU MÃ NHÂN VIÊN
         * ==========================================
         *
         * Rất quan trọng:
         * KHÔNG xóa employeeId khi app được đóng.
         */

        employeeId =
            code;


        localStorage.setItem(
            EMPLOYEE_KEY,
            employeeId
        );


        isLoggedIn =
            true;


        showLoginMessage(
            ""
        );


        /*
         * ==========================================
         * VÀO APP
         * ==========================================
         */

        await openApp();


    } catch (error) {

        console.error(
            "LOGIN ERROR:",
            error
        );


        if (
            error?.message ===
            "OFFLINE"
        ) {

            showLoginMessage(
                "Không có kết nối mạng."
            );

            return;
        }


        if (
            !navigator.onLine
        ) {

            showLoginMessage(
                "Mất kết nối mạng."
            );

            return;
        }


        if (
            error?.code ===
            "permission-denied"
        ) {

            showLoginMessage(
                "Firebase từ chối quyền truy cập Firestore."
            );

            return;
        }


        if (
            error?.code ===
            "auth/operation-not-allowed"
        ) {

            showLoginMessage(
                "Firebase Anonymous Authentication chưa được bật."
            );

            return;
        }


        showLoginMessage(
            error?.message ||
            "Đăng nhập thất bại."
        );


    } finally {

        loginInProgress =
            false;


        loginButton.disabled =
            false;
    }
}


/* =====================================================
   OPEN APP
===================================================== */

async function openApp() {

    if (
        !employeeId
    ) {

        showLogin();

        return;
    }


    if (
        !navigator.onLine
    ) {

        forceLocalLogout(
            "Mất kết nối mạng. Vui lòng đăng nhập lại."
        );

        return;
    }


    isLoggedIn =
        true;


    loginScreen.classList.add(
        "hidden"
    );


    appScreen.classList.remove(
        "hidden"
    );


    /*
     * Giữ nguyên QR
     */

    startClock();


    await loadUser();


    if (
        employeeId &&
        isLoggedIn &&
        navigator.onLine
    ) {

        generateQRCode();
    }
}


/* =====================================================
   RESTORE LOGIN
   ===================================================== */

async function restoreLogin() {

    /*
     * Không có employeeId
     * => chưa đăng nhập lần nào.
     */

    if (
        !employeeId
    ) {

        showLogin();

        return;
    }


    /*
     * Mất mạng
     */

    if (
        !navigator.onLine
    ) {

        showLogin(
            "Mất kết nối mạng. Vui lòng đăng nhập lại."
        );

        return;
    }


    try {

        /*
         * Firebase
         */

        await ensureFirebaseLogin();


        /*
         * Lấy user
         */

        const userRef =
            doc(
                db,
                "users",
                employeeId
            );


        const snapshot =
            await getDoc(
                userRef
            );


        /*
         * Không tồn tại
         */

        if (
            !snapshot.exists()
        ) {

            showLogin(
                "Tài khoản không còn tồn tại."
            );

            return;
        }


        const user =
            snapshot.data();


        /*
         * Kiểm tra active
         */

        checkEmployeeAccount(
            user
        );


        /*
         * ======================================
         * KIỂM TRA THIẾT BỊ
         * ======================================
         */

        if (
            user.activeSession !==
            deviceId
        ) {

            showLogin(
                "Thiết bị này không còn quyền đăng nhập."
            );

            return;
        }


        /*
         * ======================================
         * ĐÚNG THIẾT BỊ
         * ======================================
         *
         * KHÔNG bắt nhập mã.
         *
         * Hiện QR ngay.
         */

        isLoggedIn =
            true;


        await openApp();


    } catch (error) {

        console.error(
            "RESTORE LOGIN ERROR:",
            error
        );


        /*
         * Mất mạng
         */

        if (
            !navigator.onLine ||
            error?.message === "OFFLINE"
        ) {

            showLogin(
                "Mất kết nối mạng. Vui lòng đăng nhập lại."
            );

            return;
        }


        /*
         * Admin đã reset
         *
         * activeSession = null
         */

        showLogin(
            error?.message ||
            "Phiên đăng nhập không còn hợp lệ."
        );
    }
}


/* =====================================================
   LOAD USER REALTIME
===================================================== */

async function loadUser() {

    if (
        !employeeId
    ) {

        showLogin();

        return;
    }


    const currentEmployee =
        employeeId;


    const userRef =
        doc(
            db,
            "users",
            currentEmployee
        );


    /*
     * Hủy listener cũ
     */

    if (
        unsubscribeUser
    ) {

        unsubscribeUser();

        unsubscribeUser =
            null;
    }


    /*
     * Realtime listener
     */

    unsubscribeUser =
        onSnapshot(

            userRef,

            snapshot => {

                /*
                 * User bị xóa
                 */

                if (
                    !snapshot.exists()
                ) {

                    forceLocalLogout(
                        "Tài khoản không còn tồn tại."
                    );

                    return;
                }


                /*
                 * Nếu user khác đã được load
                 */

                if (
                    employeeId !==
                    currentEmployee
                ) {

                    return;
                }


                const user =
                    snapshot.data();


                /*
                 * ======================================
                 * ADMIN RESET
                 * hoặc thiết bị khác chiếm quyền
                 * ======================================
                 */

                if (
                    user.activeSession !==
                    deviceId
                ) {

                    forceLocalLogout(
                        "Quyền sử dụng tài khoản đã được reset hoặc chuyển sang thiết bị khác."
                    );

                    return;
                }


                /*
                 * ======================================
                 * ACTIVE
                 * ======================================
                 */

                if (
                    user.active !== true
                ) {

                    forceLocalLogout(
                        "Tài khoản đã bị khóa."
                    );

                    return;
                }


                /*
                 * ======================================
                 * DATE
                 * ======================================
                 */

                try {

                    checkEmployeeAccount(
                        user
                    );

                } catch (error) {

                    forceLocalLogout(
                        error.message
                    );

                    return;
                }


                /*
                 * Render
                 */

                renderUser(
                    user
                );
            },


            error => {

                console.error(
                    "FIRESTORE LISTENER ERROR:",
                    error
                );


                /*
                 * Mất mạng
                 */

                if (
                    !navigator.onLine
                ) {

                    forceLocalLogout(
                        "Mất kết nối mạng. Vui lòng đăng nhập lại."
                    );

                    return;
                }


                /*
                 * Permission
                 */

                if (
                    error?.code ===
                    "permission-denied"
                ) {

                    forceLocalLogout(
                        "Phiên đăng nhập không còn hợp lệ."
                    );

                    return;
                }


                /*
                 * Lỗi tạm thời:
                 * không logout.
                 */

                console.warn(
                    "Firestore tạm thời mất kết nối."
                );
            }
        );
}


/* =====================================================
   RENDER USER
===================================================== */

function renderUser(
    user
) {

    employeeHeader.textContent =
        `${user.employeeId || employeeId} (${user.name || ""})`;


    /*
     * ==========================================
     * COLOR
     * ==========================================
     */

    const green =
        user.color === "green";


    applyHeaderColor(
        green
    );


    /*
     * ==========================================
     * TIMER
     * ==========================================
     */

    timerStart =
        normalizeDate(
            user.timerStart
        );


    /*
     * Chưa có timer
     */

    if (
        !timerStart
    ) {

        timerStart =
            new Date();


        if (
            navigator.onLine
        ) {

            updateDoc(
                doc(
                    db,
                    "users",
                    employeeId
                ),
                {

                    timerStart:
                        serverTimestamp(),

                    updatedAt:
                        serverTimestamp()

                }
            ).catch(
                error => {

                    console.error(
                        "TIMER ERROR:",
                        error
                    );
                }
            );
        }
    }


    updateTimer();
}


/* =====================================================
   HEADER COLOR
===================================================== */

function applyHeaderColor(
    green
) {

    if (green) {

        cardHeader.style.backgroundColor =
            "#38a754";


        headerText.textContent =
            "将二维码对准扫描器刷码进场";

    } else {

        cardHeader.style.backgroundColor =
            "#f2c75b";


        headerText.textContent =
            "将二维码对准扫描器刷码出场";
    }
}


/* =====================================================
   TOGGLE COLOR
===================================================== */

async function toggleHeaderColor() {

    if (
        !employeeId
    ) {

        return;
    }


    /*
     * Mất mạng
     */

    if (
        !navigator.onLine
    ) {

        forceLocalLogout(
            "Mất kết nối mạng. Vui lòng đăng nhập lại."
        );

        return;
    }


    const userRef =
        doc(
            db,
            "users",
            employeeId
        );


    try {

        await runTransaction(
            db,
            async transaction => {

                const snapshot =
                    await transaction.get(
                        userRef
                    );


                if (
                    !snapshot.exists()
                ) {

                    throw new Error(
                        "Tài khoản không tồn tại."
                    );
                }


                const user =
                    snapshot.data();


                /*
                 * Kiểm tra thiết bị
                 */

                if (
                    user.activeSession !==
                    deviceId
                ) {

                    throw new Error(
                        "Thiết bị này không còn quyền sử dụng tài khoản."
                    );
                }


                /*
                 * ACTIVE
                 */

                if (
                    user.active !== true
                ) {

                    throw new Error(
                        "Tài khoản đã bị khóa."
                    );
                }


                /*
                 * Đổi màu
                 */

                const newGreen =
                    user.color !== "green";


                /*
                 * ==================================
                 * RESET TIMER
                 * ==================================
                 *
                 * Vàng → Xanh = 00:00:00
                 *
                 * Xanh → Vàng = 00:00:00
                 */

                transaction.update(
                    userRef,
                    {

                        color:
                            newGreen
                                ? "green"
                                : "yellow",

                        timerStart:
                            serverTimestamp(),

                        updatedAt:
                            serverTimestamp()

                    }
                );
            }
        );


    } catch (error) {

        console.error(
            "TOGGLE ERROR:",
            error
        );


        if (
            !navigator.onLine
        ) {

            forceLocalLogout(
                "Mất kết nối mạng. Vui lòng đăng nhập lại."
            );

            return;
        }


        alert(
            error.message ||
            "Không thể đổi trạng thái."
        );
    }
}


/* =====================================================
   CLOCK
===================================================== */

function startClock() {

    if (
        clockInterval
    ) {

        clearInterval(
            clockInterval
        );
    }


    function updateClock() {

        const now =
            new Date();


        const formattedTime =
            `${now.getFullYear()}-` +
            `${String(
                now.getMonth() + 1
            ).padStart(2, "0")}-` +
            `${String(
                now.getDate()
            ).padStart(2, "0")} ` +
            `${pad(
                now.getHours()
            )}:` +
            `${pad(
                now.getMinutes()
            )}:` +
            `${pad(
                now.getSeconds()
            )}`;


        currentTime.textContent =
            formattedTime;


        updateTimer();
    }


    updateClock();


    clockInterval =
        setInterval(
            updateClock,
            1000
        );
}


/* =====================================================
   TIMER
===================================================== */

function updateTimer() {

    if (
        !timerStart
    ) {

        statusTimer.textContent =
            "00:00:00";

        return;
    }


    const elapsed =
        Math.max(
            0,
            Math.floor(
                (
                    Date.now() -
                    timerStart.getTime()
                ) / 1000
            )
        );


    const hours =
        Math.floor(
            elapsed / 3600
        );


    const minutes =
        Math.floor(
            (elapsed % 3600) / 60
        );


    const seconds =
        elapsed % 60;


    statusTimer.textContent =
        `${pad(hours)}:` +
        `${pad(minutes)}:` +
        `${pad(seconds)}`;
}


/* =====================================================
   QR CODE
   GIỮ NGUYÊN CƠ CHẾ CŨ
===================================================== */

window.generateQRCode =
    generateQRCode;


async function generateQRCode(
    event
) {

    if (
        event &&
        event.currentTarget
    ) {

        event.currentTarget.blur();
    }


    if (
        !employeeId
    ) {

        return;
    }


    if (
        !navigator.onLine
    ) {

        forceLocalLogout(
            "Mất kết nối mạng. Vui lòng đăng nhập lại."
        );

        return;
    }


    try {

        const now =
            new Date();


        const formattedTime =
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


        const userRef =
            doc(
                db,
                "users",
                employeeId
            );


        const snapshot =
            await getDoc(
                userRef
            );


        if (
            !snapshot.exists()
        ) {

            forceLocalLogout(
                "Tài khoản không còn tồn tại."
            );

            return;
        }


        const user =
            snapshot.data();


        /*
         * Kiểm tra device
         */

        if (
            user.activeSession !==
            deviceId
        ) {

            forceLocalLogout(
                "Thiết bị này không còn quyền đăng nhập."
            );

            return;
        }


        const employeeName =
            user.name || "";


        const uniqueToken =
            Math.random()
                .toString(36)
                .substring(2) +
            Date.now()
                .toString(36);


        /*
         * QR GIỮ NGUYÊN.
         *
         * Chỉ employeeId/name lấy từ Firebase.
         */

        const accessData =
            `https://YOUR-AUTHORIZED-DOMAIN/access` +
            `?id=${encodeURIComponent(
                employeeId
            )}` +
            `&name=${encodeURIComponent(
                employeeName
            )}` +
            `&time=${encodeURIComponent(
                formattedTime
            )}` +
            `&token=${encodeURIComponent(
                uniqueToken
            )}`;


        if (
            !qrcodeElement
        ) {

            return;
        }


        qrcodeElement.innerHTML =
            "";


        new QRCode(
            qrcodeElement,
            {

                text:
                    accessData,

                width:
                    230,

                height:
                    230,

                colorDark:
                    "#000000",

                colorLight:
                    "#ffffff",

                correctLevel:
                    QRCode.CorrectLevel.M
            }
        );


    } catch (error) {

        console.error(
            "QR ERROR:",
            error
        );


        if (
            !navigator.onLine
        ) {

            forceLocalLogout(
                "Mất kết nối mạng. Vui lòng đăng nhập lại."
            );
        }
    }
}


/* =====================================================
   REFRESH QR
===================================================== */

if (
    refreshQRCode
) {

    refreshQRCode.addEventListener(
        "click",
        event => {

            generateQRCode(
                event
            );
        }
    );
}


/* =====================================================
   HOLD 5 SECONDS
===================================================== */

const HOLD_DURATION =
    5000;


function startPress(event) {

    /*
     * Không chạy trong card/QR.
     */

    if (
        event.target.closest(".card")
    ) {

        return;
    }


    clearTimeout(
        pressTimer
    );


    pressTimer =
        setTimeout(
            () => {

                toggleHeaderColor();

            },
            HOLD_DURATION
        );
}


function cancelPress() {

    if (
        pressTimer
    ) {

        clearTimeout(
            pressTimer
        );

        pressTimer =
            null;
    }
}


/* TOUCH */

document.addEventListener(
    "touchstart",
    startPress,
    {
        passive: true
    }
);


document.addEventListener(
    "touchend",
    cancelPress
);


document.addEventListener(
    "touchcancel",
    cancelPress
);


/* MOUSE */

document.addEventListener(
    "mousedown",
    startPress
);


document.addEventListener(
    "mouseup",
    cancelPress
);


document.addEventListener(
    "mouseleave",
    cancelPress
);


/* =====================================================
   PREVENT SCROLL
   Giữ nguyên chức năng giao diện cũ
===================================================== */

document.addEventListener(
    "touchmove",
    event => {

        event.preventDefault();

    },
    {
        passive: false
    }
);


/* =====================================================
   FORCE LOCAL LOGOUT
===================================================== */

function forceLocalLogout(
    message
) {

    console.warn(
        "LOCAL LOGOUT:",
        message
    );


    showLogin(
        message
    );
}


/* =====================================================
   SHOW LOGIN
===================================================== */

function showLogin(
    message = ""
) {

    /*
     * Hủy realtime listener
     */

    if (
        unsubscribeUser
    ) {

        unsubscribeUser();

        unsubscribeUser =
            null;
    }


    /*
     * Dừng clock
     */

    if (
        clockInterval
    ) {

        clearInterval(
            clockInterval
        );

        clockInterval =
            null;
    }


    /*
     * Hủy giữ 5 giây
     */

    cancelPress();


    /*
     * QUAN TRỌNG:
     *
     * Chỉ xóa employeeId.
     *
     * KHÔNG xóa deviceId.
     */

    employeeId =
        null;


    isLoggedIn =
        false;


    timerStart =
        null;


    localStorage.removeItem(
        EMPLOYEE_KEY
    );


    /*
     * UI
     */

    appScreen.classList.add(
        "hidden"
    );


    loginScreen.classList.remove(
        "hidden"
    );


    /*
     * Xóa QR cũ
     */

    if (
        qrcodeElement
    ) {

        qrcodeElement.innerHTML =
            "";
    }


    /*
     * Ẩn nút đăng xuất
     */

    if (
        logoutButton
    ) {

        logoutButton.style.display =
            "none";
    }


    /*
     * Input
     */

    employeeCodeInput.value =
        "";


    /*
     * Message
     */

    loginMessage.textContent =
        message;
}


/* =====================================================
   LOGIN MESSAGE
===================================================== */

function showLoginMessage(
    message
) {

    if (
        loginMessage
    ) {

        loginMessage.textContent =
            message || "";
    }
}


/* =====================================================
   LOGIN EVENTS
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


/* =====================================================
   NETWORK EVENT
===================================================== */

window.addEventListener(
    "offline",
    () => {

        if (
            isLoggedIn
        ) {

            forceLocalLogout(
                "Mất kết nối mạng. Vui lòng đăng nhập lại."
            );

        } else {

            showLoginMessage(
                "Không có kết nối mạng."
            );
        }
    }
);


/* =====================================================
   PAGE VISIBILITY
   KHÔNG LOGOUT KHI VUỐT APP
===================================================== */

/*
 * Tuyệt đối KHÔNG gọi showLogin()
 * ở visibilitychange.
 *
 * Vuốt app xuống nền:
 * => giữ nguyên employeeId
 * => giữ nguyên Firebase session
 * => khi mở lại vẫn hiện QR.
 */

document.addEventListener(
    "visibilitychange",
    () => {

        if (
            document.visibilityState ===
            "visible"
        ) {

            if (
                !navigator.onLine
            ) {

                forceLocalLogout(
                    "Mất kết nối mạng. Vui lòng đăng nhập lại."
                );

                return;
            }


            /*
             * Nếu app đang được mở lại
             * và employeeId vẫn còn,
             * không cần đăng nhập lại.
             */

            if (
                employeeId &&
                !isLoggedIn
            ) {

                restoreLogin();
            }
        }
    }
);


/* =====================================================
   PAGESHOW
   KHÔNG ÉP LOGOUT
===================================================== */

window.addEventListener(
    "pageshow",
    () => {

        /*
         * Nếu employeeId vẫn còn:
         * khôi phục app.
         *
         * KHÔNG xóa employeeId.
         */

        if (
            employeeId
        ) {

            if (
                navigator.onLine
            ) {

                if (
                    !isLoggedIn
                ) {

                    restoreLogin();
                }

            } else {

                forceLocalLogout(
                    "Mất kết nối mạng. Vui lòng đăng nhập lại."
                );
            }

            return;
        }


        /*
         * Chưa đăng nhập.
         */

        showLogin();
    }
);


/* =====================================================
   INITIAL START
===================================================== */

async function start() {

    /*
     * ==========================================
     * ĐANG OFFLINE
     * ==========================================
     */

    if (
        !navigator.onLine
    ) {

        showLogin(
            "Không có kết nối mạng. Vui lòng đăng nhập lại."
        );

        return;
    }


    /*
     * ==========================================
     * CHƯA CÓ USER
     * ==========================================
     */

    if (
        !employeeId
    ) {

        showLogin();

        return;
    }


    /*
     * ==========================================
     * ĐÃ ĐĂNG NHẬP TRƯỚC ĐÓ
     * ==========================================
     *
     * Tự khôi phục.
     */

    await restoreLogin();
}


/* =====================================================
   START
===================================================== */

start();
