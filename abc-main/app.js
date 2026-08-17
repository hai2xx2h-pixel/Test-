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


/* =====================================================
   STORAGE
===================================================== */

const EMPLOYEE_KEY =
    "thor_employee_id";

const DEVICE_KEY =
    "thor_device_id";


/* =====================================================
   STATE
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

let appReady =
    false;

let offlineHandled =
    false;


/* =====================================================
   DEVICE ID
===================================================== */

/*
 * DEVICE ID chỉ tạo 1 lần.
 *
 * Không được xóa khi:
 * - reload
 * - vuốt trang
 * - đăng nhập lại
 * - mất mạng
 *
 * Nhờ vậy Firebase biết đây vẫn là cùng một thiết bị.
 */

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

    if (auth.currentUser) {

        return auth.currentUser;
    }


    if (!navigator.onLine) {

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
   GET EMPLOYEE
===================================================== */

async function getEmployee(code) {

    if (!navigator.onLine) {

        throw new Error(
            "OFFLINE"
        );
    }


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


    if (!snapshot.exists()) {

        throw new Error(
            "Mã nhân viên không tồn tại."
        );
    }


    return {
        ref: userRef,
        data: snapshot.data()
    };
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
   LOGIN
===================================================== */

async function login() {

    if (loginInProgress) {

        return;
    }


    if (!navigator.onLine) {

        showLoginMessage(
            "当前无网络连接"
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
         * Firebase
         */

        await ensureFirebaseLogin();


        /*
         * Lấy user
         */

        const result =
            await getEmployee(
                code
            );


        const userRef =
            result.ref;


        /*
         * Kiểm tra account
         */

        checkEmployeeAccount(
            result.data
        );


        /*
         * =============================================
         * KIỂM TRA DEVICE
         * =============================================
         *
         * activeSession lưu DEVICE ID.
         *
         * Cùng device:
         *
         * activeSession === deviceId
         *
         * => cho phép đăng nhập lại.
         *
         * Device khác:
         *
         * activeSession !== deviceId
         *
         * => từ chối.
         */

        await runTransaction(
            db,
            async transaction => {

                const freshSnapshot =
                    await transaction.get(
                        userRef
                    );


                if (
                    !freshSnapshot.exists()
                ) {

                    throw new Error(
                        "Mã nhân viên không tồn tại."
                    );
                }


                const freshUser =
                    freshSnapshot.data();


                checkEmployeeAccount(
                    freshUser
                );


                const currentDevice =
                    freshUser.activeSession ||
                    null;


                /*
                 * Đang có thiết bị khác
                 */

                if (
                    currentDevice &&
                    currentDevice !== deviceId
                ) {

                    throw new Error(
                        "Mã nhân viên này đang được sử dụng trên thiết bị khác."
                    );
                }


                /*
                 * Cùng thiết bị hoặc chưa có thiết bị
                 */

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
            }
        );


        /*
         * Lưu employee
         */

        employeeId =
            code;


        localStorage.setItem(
            EMPLOYEE_KEY,
            employeeId
        );


        offlineHandled =
            false;


        showLoginMessage(
            ""
        );


        /*
         * Mở app
         */

        await openApp();


    } catch (error) {

        console.error(
            "LOGIN ERROR:",
            error
        );


        if (
            error.message ===
            "OFFLINE"
        ) {

            showLoginMessage(
                "当前无网络连接"
            );

        } else if (
            error.code ===
            "permission-denied"
        ) {

            showLoginMessage(
                "Firebase 无权限访问，请检查 Firestore Rules"
            );

        } else if (
            error.code ===
            "auth/operation-not-allowed"
        ) {

            showLoginMessage(
                "Firebase Anonymous Authentication 未开启"
            );

        } else {

            showLoginMessage(
                error.message ||
                "登录失败"
            );
        }


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

    if (!navigator.onLine) {

        showLogin(
            "当前无网络连接"
        );

        return;
    }


    loginScreen.classList.add(
        "hidden"
    );


    appScreen.classList.remove(
        "hidden"
    );


    appReady =
        true;


    startClock();


    await loadUser();


    if (
        employeeId &&
        navigator.onLine
    ) {

        generateQRCode();
    }
}


/* =====================================================
   LOAD USER
===================================================== */

async function loadUser() {

    if (
        !employeeId
    ) {

        showLogin();

        return;
    }


    if (!navigator.onLine) {

        showLogin(
            "当前无网络连接"
        );

        return;
    }


    const userRef =
        doc(
            db,
            "users",
            employeeId
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
     * REALTIME
     */

    unsubscribeUser =
        onSnapshot(

            userRef,

            snapshot => {

                if (!navigator.onLine) {

                    return;
                }


                /*
                 * User bị xóa
                 */

                if (
                    !snapshot.exists()
                ) {

                    forceLogout(
                        "Tài khoản không còn tồn tại."
                    );

                    return;
                }


                const user =
                    snapshot.data();


                /*
                 * KIỂM TRA DEVICE
                 */

                if (
                    user.activeSession !==
                    deviceId
                ) {

                    forceLogout(
                        "Thiết bị này không còn giữ quyền đăng nhập."
                    );

                    return;
                }


                /*
                 * ACTIVE
                 */

                if (
                    user.active !== true
                ) {

                    forceLogout(
                        "Tài khoản đã bị khóa."
                    );

                    return;
                }


                /*
                 * DATE
                 */

                try {

                    checkEmployeeAccount(
                        user
                    );

                } catch (error) {

                    forceLogout(
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
                    "FIRESTORE ERROR:",
                    error
                );


                /*
                 * Nếu đang offline,
                 * xử lý bằng event offline.
                 */

                if (!navigator.onLine) {

                    return;
                }


                /*
                 * Không tự logout chỉ vì
                 * Firebase tạm thời lỗi mạng.
                 */

                console.warn(
                    "Firestore connection temporarily unavailable."
                );
            }
        );
}


/* =====================================================
   RENDER USER
===================================================== */

function renderUser(user) {

    employeeHeader.textContent =
        `${user.employeeId || employeeId} (${user.name || ""})`;


    /*
     * COLOR
     */

    const green =
        user.color === "green";


    applyHeaderColor(
        green
    );


    /*
     * TIMER
     */

    timerStart =
        normalizeDate(
            user.timerStart
        );


    if (!timerStart) {

        timerStart =
            new Date();


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


    updateTimer();
}


/* =====================================================
   HEADER COLOR
===================================================== */

function applyHeaderColor(green) {

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
        !employeeId ||
        !navigator.onLine
    ) {

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
                 * DEVICE
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
                 * ĐỔI MÀU
                 */

                const newGreen =
                    user.color !== "green";


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
            navigator.onLine
        ) {

            alert(
                error.message ||
                "Không thể đổi trạng thái."
            );
        }
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

    if (!timerStart) {

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
===================================================== */

window.generateQRCode =
    generateQRCode;


async function generateQRCode(event) {

    if (
        event &&
        event.currentTarget
    ) {

        event.currentTarget.blur();
    }


    if (
        !employeeId ||
        !navigator.onLine
    ) {

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

            return;
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

            forceLogout(
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
         * GIỮ NGUYÊN CƠ CHẾ QR
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


        const qrcodeElement =
            document.getElementById(
                "qrcode"
            );


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
    }
}


/* =====================================================
   REFRESH QR
===================================================== */

if (refreshQRCode) {

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

let pressTimer =
    null;

const HOLD_DURATION =
    5000;


function startPress(event) {

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

    if (pressTimer) {

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
   FORCE LOGOUT
===================================================== */

function forceLogout(message) {

    console.warn(
        "FORCE LOGOUT:",
        message
    );


    showLogin(
        message
    );
}


/* =====================================================
   SHOW LOGIN
===================================================== */

function showLogin(message = "") {

    /*
     * Hủy listener
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
     * Reset
     */

    employeeId =
        null;

    timerStart =
        null;

    appReady =
        false;


    /*
     * QUAN TRỌNG:
     *
     * Chỉ xóa employeeId.
     *
     * KHÔNG xóa deviceId.
     */

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


    employeeCodeInput.value =
        "";


    showLoginMessage(
        message
    );
}


/* =====================================================
   LOGIN MESSAGE
===================================================== */

function showLoginMessage(message) {

    loginMessage.textContent =
        message || "";
}


/* =====================================================
   NETWORK
   MẤT MẠNG => ĐĂNG XUẤT NGAY
===================================================== */

function handleOffline() {

    if (
        offlineHandled
    ) {

        return;
    }


    offlineHandled =
        true;


    console.warn(
        "NETWORK OFFLINE"
    );


    /*
     * Đưa về login ngay lập tức.
     *
     * Không chờ Firebase 15 giây.
     */

    if (
        employeeId
    ) {

        showLogin(
            "网络连接已断开，请重新连接网络后登录"
        );

    } else {

        showLoginMessage(
            "网络连接已断开"
        );
    }
}


function handleOnline() {

    offlineHandled =
        false;


    /*
     * Không tự login khi vừa có mạng.
     *
     * Nếu user đang ở login:
     * user tự nhập mã.
     *
     * Nếu app vẫn đang mở:
     * Firebase realtime tiếp tục hoạt động.
     */

    console.log(
        "NETWORK ONLINE"
    );
}


window.addEventListener(
    "offline",
    handleOffline
);


window.addEventListener(
    "online",
    handleOnline
);


/* =====================================================
   PAGE VISIBILITY
===================================================== */

document.addEventListener(
    "visibilitychange",
    () => {

        /*
         * Khi quay lại trang,
         * nếu mất mạng => login ngay.
         */

        if (
            !document.hidden &&
            !navigator.onLine
        ) {

            handleOffline();

            return;
        }


        /*
         * Nếu online và employeeId còn,
         * kiểm tra lại user.
         */

        if (
            !document.hidden &&
            navigator.onLine &&
            employeeId &&
            !unsubscribeUser
        ) {

            loadUser();
        }
    }
);


/* =====================================================
   BEFORE UNLOAD
===================================================== */

/*
 * KHÔNG logout khi reload / vuốt / đóng trang.
 *
 * Đây là điểm rất quan trọng.
 *
 * Không được gọi showLogin()
 * ở beforeunload.
 */


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
   START
===================================================== */

async function start() {

    /*
     * Nếu hiện tại offline:
     * vào thẳng màn login.
     */

    if (
        !navigator.onLine
    ) {

        showLogin(
            "当前无网络连接"
        );

        return;
    }


    /*
     * Không có employee
     */

    if (
        !employeeId
    ) {

        showLogin();

        return;
    }


    /*
     * Có employee cũ:
     * thử khôi phục phiên.
     *
     * KHÔNG tạo deviceId mới.
     */

    try {

        await ensureFirebaseLogin();


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
         * Không tìm thấy user
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
         * Kiểm tra account
         */

        checkEmployeeAccount(
            user
        );


        /*
         * =========================================
         * QUAN TRỌNG
         *
         * Nếu activeSession chính là device này
         * => KHÔNG bắt đăng nhập lại.
         *
         * Đây là phần sửa lỗi vuốt/reload.
         * =========================================
         */

        if (
            user.activeSession !==
            deviceId
        ) {

            showLogin(
                "Thiết bị này không còn giữ quyền đăng nhập."
            );

            return;
        }


        /*
         * Mở app
         */

        loginScreen.classList.add(
            "hidden"
        );


        appScreen.classList.remove(
            "hidden"
        );


        appReady =
            true;


        startClock();


        await loadUser();


        if (
            employeeId &&
            navigator.onLine
        ) {

            generateQRCode();
        }


    } catch (error) {

        console.error(
            "START ERROR:",
            error
        );


        /*
         * Nếu mất mạng
         */

        if (
            !navigator.onLine ||
            error.message === "OFFLINE"
        ) {

            showLogin(
                "当前无网络连接"
            );

            return;
        }


        /*
         * Session không còn hợp lệ
         */

        showLogin(
            error.message ||
            "Phiên đăng nhập không hợp lệ."
        );
    }
}


/* =====================================================
   START APPLICATION
===================================================== */

start();
