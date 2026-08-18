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

const qrActions =
    document.getElementById("qrActions");

const leaveAction =
    document.getElementById("leaveAction");

const logoutButton =
    document.getElementById("logoutButton");


/* =====================================================
   CONFIG
===================================================== */

/*
 * Phải trùng với styles.css
 */
const QR_SIZE = 210;


/*
 * Giữ 5 giây
 */
const HOLD_DURATION = 5000;


/* =====================================================
   STORAGE
===================================================== */

const EMPLOYEE_KEY =
    "thor_employee_id";

const DEVICE_KEY =
    "thor_device_id";

const USER_CACHE_KEY =
    "thor_user_cache";


/* =====================================================
   STATE
===================================================== */

let employeeId =
    localStorage.getItem(
        EMPLOYEE_KEY
    );

let deviceId =
    localStorage.getItem(
        DEVICE_KEY
    );

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
   LOGOUT BUTTON
===================================================== */

if (logoutButton) {

    logoutButton.style.display =
        "none";
}


/* =====================================================
   DEVICE ID
===================================================== */

function createDeviceId() {

    if (
        typeof crypto !== "undefined" &&
        typeof crypto.randomUUID === "function"
    ) {

        return crypto.randomUUID();
    }


    return (
        Date.now()
            .toString(36) +
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
   BASIC UTILITY
===================================================== */

function pad(number) {

    return String(number)
        .padStart(
            2,
            "0"
        );
}


/* =====================================================
   NORMALIZE DATE
===================================================== */

function normalizeDate(value) {

    if (!value) {

        return null;
    }


    /*
     * Firestore Timestamp
     */
    if (
        typeof value.toDate ===
        "function"
    ) {

        return value.toDate();
    }


    /*
     * JS Date
     */
    if (
        value instanceof Date
    ) {

        return value;
    }


    /*
     * Timestamp milliseconds
     */
    if (
        typeof value ===
        "number"
    ) {

        const date =
            new Date(value);

        if (
            !Number.isNaN(
                date.getTime()
            )
        ) {

            return date;
        }
    }


    /*
     * String
     */
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
   DISPLAY CLOCK

   Ví dụ:
   2026-8-18 23:39:59

   Tháng/ngày không thêm số 0 phía trước.
===================================================== */

function getDisplayTimeString() {

    const now =
        new Date();


    return (
        `${now.getFullYear()}-` +
        `${now.getMonth() + 1}-` +
        `${now.getDate()} ` +

        `${pad(
            now.getHours()
        )}:` +

        `${pad(
            now.getMinutes()
        )}:` +

        `${pad(
            now.getSeconds()
        )}`
    );
}


/* =====================================================
   QR TIME

   QR payload vẫn dùng format đầy đủ.
===================================================== */

function getQRTimeString() {

    const now =
        new Date();


    return (
        `${now.getFullYear()}-` +

        `${pad(
            now.getMonth() + 1
        )}-` +

        `${pad(
            now.getDate()
        )} ` +

        `${pad(
            now.getHours()
        )}:` +

        `${pad(
            now.getMinutes()
        )}:` +

        `${pad(
            now.getSeconds()
        )}`
    );
}


/* =====================================================
   SAVE CACHE
===================================================== */

function saveUserCache(user) {

    try {

        const normalizedTimer =
            normalizeDate(
                user.timerStart
            );


        const cachedUser = {

            employeeId:
                user.employeeId ||
                employeeId ||
                "",

            name:
                user.name ||
                "",

            color:
                user.color ||
                "yellow",

            timerStart:
                normalizedTimer
                    ? normalizedTimer.getTime()
                    : null
        };


        localStorage.setItem(
            USER_CACHE_KEY,
            JSON.stringify(
                cachedUser
            )
        );


    } catch (error) {

        console.error(
            "SAVE CACHE ERROR:",
            error
        );
    }
}


/* =====================================================
   GET CACHE
===================================================== */

function getUserCache() {

    try {

        const raw =
            localStorage.getItem(
                USER_CACHE_KEY
            );


        if (!raw) {

            return null;
        }


        const data =
            JSON.parse(raw);


        if (
            !data ||
            typeof data !==
            "object"
        ) {

            return null;
        }


        return data;


    } catch (error) {

        console.error(
            "READ CACHE ERROR:",
            error
        );


        return null;
    }
}


/* =====================================================
   CLEAR CACHE
===================================================== */

function clearUserCache() {

    localStorage.removeItem(
        USER_CACHE_KEY
    );
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
   CHECK EMPLOYEE ACCOUNT
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
   EMPLOYEE HEADER

   Không hard-code dữ liệu từ ảnh mẫu.
===================================================== */

function renderEmployeeHeader(user) {

    if (!employeeHeader) {

        return;
    }


    employeeHeader.textContent =
        `${user.employeeId || employeeId}` +
        `(${user.name || ""})`;
}


/* =====================================================
   ACTION ROW

   YELLOW:
       刷新二维码

   GREEN:
       申请离场   刷新二维码
===================================================== */

function applyActionRow(green) {

    if (
        !leaveAction ||
        !qrActions
    ) {

        return;
    }


    if (green) {

        leaveAction.classList.remove(
            "hidden"
        );

        qrActions.classList.add(
            "has-leave"
        );

    } else {

        leaveAction.classList.add(
            "hidden"
        );

        qrActions.classList.remove(
            "has-leave"
        );
    }
}


/* =====================================================
   APPLY HEADER STATE
===================================================== */

function applyHeaderColor(green) {

    if (
        !cardHeader ||
        !headerText
    ) {

        return;
    }


    /*
     * GREEN
     */
    if (green) {

        cardHeader.style.backgroundColor =
            "#38a754";

        headerText.textContent =
            "将二维码对准扫描器刷码进场";

        applyActionRow(
            true
        );

        return;
    }


    /*
     * YELLOW
     */
    cardHeader.style.backgroundColor =
        "#f2c75b";

    headerText.textContent =
        "将二维码对准扫描器刷码出场";

    applyActionRow(
        false
    );
}


/* =====================================================
   QR RENDER

   Dùng CHUNG một hàm.
   Không còn 2 kích thước khác nhau.
===================================================== */

function renderQRCode(user) {

    if (
        !qrcodeElement ||
        !employeeId
    ) {

        return;
    }


    if (
        typeof QRCode ===
        "undefined"
    ) {

        console.error(
            "QRCode library chưa được tải."
        );

        return;
    }


    const employeeName =
        user?.name ||
        "";


    const uniqueToken =
        Math.random()
            .toString(36)
            .substring(2) +

        Date.now()
            .toString(36);


    const accessData =
        `https://YOUR-AUTHORIZED-DOMAIN/access` +

        `?id=${encodeURIComponent(
            employeeId
        )}` +

        `&name=${encodeURIComponent(
            employeeName
        )}` +

        `&time=${encodeURIComponent(
            getQRTimeString()
        )}` +

        `&token=${encodeURIComponent(
            uniqueToken
        )}`;


    qrcodeElement.innerHTML =
        "";


    new QRCode(
        qrcodeElement,
        {

            text:
                accessData,

            width:
                QR_SIZE,

            height:
                QR_SIZE,

            colorDark:
                "#000000",

            colorLight:
                "#ffffff",

            correctLevel:
                QRCode.CorrectLevel.M
        }
    );
}


/* =====================================================
   SHOW APP FROM CACHE IMMEDIATELY
===================================================== */

function showCachedAppImmediately() {

    if (
        !employeeId
    ) {

        return false;
    }


    const cached =
        getUserCache();


    if (!cached) {

        return false;
    }


    /*
     * Cache phải đúng employee hiện tại
     */
    if (
        cached.employeeId &&
        cached.employeeId !==
        employeeId
    ) {

        return false;
    }


    try {

        renderEmployeeHeader(
            cached
        );


        const green =
            cached.color ===
            "green";


        applyHeaderColor(
            green
        );


        timerStart =
            normalizeDate(
                cached.timerStart
            );


        /*
         * Hiện app ngay
         */
        loginScreen?.classList.add(
            "hidden"
        );

        appScreen?.classList.remove(
            "hidden"
        );


        isLoggedIn =
            true;


        startClock();


        /*
         * QR hiện ngay từ cache
         */
        renderQRCode(
            cached
        );


        return true;


    } catch (error) {

        console.error(
            "CACHE APP ERROR:",
            error
        );


        return false;
    }
}


/* =====================================================
   GET EMPLOYEE
===================================================== */

async function getEmployee(code) {

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


    return {

        ref:
            userRef,

        data:
            snapshot.data()
    };
}


/* =====================================================
   LOGIN
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
        employeeCodeInput
            ?.value
            .trim()
            .toUpperCase() ||
        "";


    if (!code) {

        showLoginMessage(
            "请输入员工编号"
        );

        return;
    }


    loginInProgress =
        true;


    if (loginButton) {

        loginButton.disabled =
            true;
    }


    showLoginMessage(
        "正在验证..."
    );


    try {

        /*
         * Firebase Auth
         */
        await ensureFirebaseLogin();


        /*
         * Get employee
         */
        const result =
            await getEmployee(
                code
            );


        const userRef =
            result.ref;


        checkEmployeeAccount(
            result.data
        );


        /*
         * ==========================================
         * 1 EMPLOYEE / 1 DEVICE
         * ==========================================
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


                const user =
                    freshSnapshot.data();


                checkEmployeeAccount(
                    user
                );


                const currentDevice =
                    user.activeSession ||
                    null;


                /*
                 * Chưa có thiết bị
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
                 * Cùng thiết bị
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
                 * Thiết bị khác
                 */
                throw new Error(
                    "Mã nhân viên này đang được sử dụng trên thiết bị khác."
                );
            }
        );


        /*
         * Save employee
         */
        employeeId =
            code;


        localStorage.setItem(
            EMPLOYEE_KEY,
            employeeId
        );


        /*
         * Cache ban đầu
         */
        saveUserCache({

            employeeId:
                userRef.id,

            name:
                result.data.name ||
                "",

            color:
                result.data.color ||
                "yellow",

            timerStart:
                result.data.timerStart ||
                null
        });


        isLoggedIn =
            true;


        showLoginMessage(
            ""
        );


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


        if (loginButton) {

            loginButton.disabled =
                false;
        }
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


    /*
     * Hiện cache trước.
     */
    showCachedAppImmediately();


    /*
     * Offline
     */
    if (
        !navigator.onLine
    ) {

        clearUserSession(
            "Mất kết nối mạng. Vui lòng đăng nhập lại."
        );

        return;
    }


    /*
     * Verify Firebase sau
     */
    await verifyCurrentSession();
}


/* =====================================================
   VERIFY SESSION
===================================================== */

async function verifyCurrentSession() {

    if (
        !employeeId
    ) {

        return false;
    }


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
         * User deleted
         */
        if (
            !snapshot.exists()
        ) {

            clearUserSession(
                "Tài khoản không còn tồn tại."
            );

            return false;
        }


        const user =
            snapshot.data();


        /*
         * Account
         */
        checkEmployeeAccount(
            user
        );


        /*
         * =========================================
         * ACTIVE SESSION / ADMIN RESET
         * =========================================
         */
        if (
            user.activeSession !==
            deviceId
        ) {

            clearUserSession(
                "Tài khoản đã được Admin reset hoặc chuyển sang thiết bị khác."
            );

            return false;
        }


        /*
         * Cache
         */
        saveUserCache(
            user
        );


        /*
         * Render
         */
        renderUser(
            user
        );


        /*
         * Hiện app
         */
        isLoggedIn =
            true;


        loginScreen?.classList.add(
            "hidden"
        );

        appScreen?.classList.remove(
            "hidden"
        );


        /*
         * Clock
         */
        startClock();


        /*
         * QR 210px
         */
        renderQRCode(
            user
        );


        /*
         * Realtime
         */
        loadUser();


        return true;


    } catch (error) {

        console.error(
            "VERIFY SESSION ERROR:",
            error
        );


        /*
         * Offline
         */
        if (
            !navigator.onLine
        ) {

            clearUserSession(
                "Mất kết nối mạng. Vui lòng đăng nhập lại."
            );

            return false;
        }


        /*
         * Permission
         */
        if (
            error?.code ===
            "permission-denied"
        ) {

            clearUserSession(
                "Phiên đăng nhập không còn quyền truy cập."
            );

            return false;
        }


        /*
         * Firebase lỗi tạm thời:
         * giữ cache đang hiển thị.
         */
        console.warn(
            "Firebase kiểm tra tạm thời thất bại."
        );


        return true;
    }
}


/* =====================================================
   REALTIME
===================================================== */

function loadUser() {

    if (
        !employeeId
    ) {

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
     * Clear listener cũ
     */
    if (
        unsubscribeUser
    ) {

        unsubscribeUser();

        unsubscribeUser =
            null;
    }


    /*
     * Firestore realtime
     */
    unsubscribeUser =
        onSnapshot(

            userRef,

            snapshot => {

                /*
                 * Deleted
                 */
                if (
                    !snapshot.exists()
                ) {

                    clearUserSession(
                        "Tài khoản không còn tồn tại."
                    );

                    return;
                }


                /*
                 * Employee thay đổi
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
                 * Admin Reset /
                 * session khác
                 */
                if (
                    user.activeSession !==
                    deviceId
                ) {

                    clearUserSession(
                        "Tài khoản đã được Admin reset hoặc chuyển sang thiết bị khác."
                    );

                    return;
                }


                /*
                 * Locked
                 */
                if (
                    user.active !== true
                ) {

                    clearUserSession(
                        "Tài khoản đã bị khóa."
                    );

                    return;
                }


                /*
                 * Date
                 */
                try {

                    checkEmployeeAccount(
                        user
                    );

                } catch (error) {

                    clearUserSession(
                        error.message
                    );

                    return;
                }


                /*
                 * Cache
                 */
                saveUserCache(
                    user
                );


                /*
                 * Re-render:
                 *
                 * - tên
                 * - màu
                 * - text
                 * - 申请离场
                 * - timer
                 */
                renderUser(
                    user
                );
            },


            error => {

                console.error(
                    "FIRESTORE REALTIME ERROR:",
                    error
                );


                if (
                    !navigator.onLine
                ) {

                    clearUserSession(
                        "Mất kết nối mạng. Vui lòng đăng nhập lại."
                    );

                    return;
                }


                if (
                    error?.code ===
                    "permission-denied"
                ) {

                    clearUserSession(
                        "Phiên đăng nhập không còn quyền truy cập."
                    );

                    return;
                }


                console.warn(
                    "Firestore realtime tạm thời không kết nối."
                );
            }
        );
}


/* =====================================================
   RENDER USER
===================================================== */

function renderUser(user) {

    /*
     * Cache
     */
    saveUserCache(
        user
    );


    /*
     * Employee
     */
    renderEmployeeHeader(
        user
    );


    /*
     * Color
     */
    const green =
        user.color ===
        "green";


    applyHeaderColor(
        green
    );


    /*
     * Timer start
     */
    timerStart =
        normalizeDate(
            user.timerStart
        );


    /*
     * Nếu user cũ chưa có timerStart
     */
    if (
        !timerStart
    ) {

        timerStart =
            new Date();


        if (
            navigator.onLine &&
            employeeId
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
                        "TIMER INIT ERROR:",
                        error
                    );
                }
            );
        }
    }


    updateTimer();
}


/* =====================================================
   TOGGLE STATE

   YELLOW
       giữ 5s
       ↓
   GREEN

   GREEN
       giữ 5s
       ↓
   YELLOW

   Mỗi lần đổi:
   timerStart reset.
===================================================== */

async function toggleHeaderColor() {

    if (
        !employeeId ||
        !isLoggedIn
    ) {

        return;
    }


    if (
        !navigator.onLine
    ) {

        clearUserSession(
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

        const newGreen =
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
                     * Device
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
                     * Active
                     */
                    if (
                        user.active !== true
                    ) {

                        throw new Error(
                            "Tài khoản đã bị khóa."
                        );
                    }


                    /*
                     * Next state
                     */
                    const nextGreen =
                        user.color !==
                        "green";


                    /*
                     * Firestore
                     */
                    transaction.update(
                        userRef,
                        {

                            color:
                                nextGreen
                                    ? "green"
                                    : "yellow",

                            timerStart:
                                serverTimestamp(),

                            updatedAt:
                                serverTimestamp()
                        }
                    );


                    /*
                     * Return new state
                     */
                    return nextGreen;
                }
            );


        /*
         * Update UI ngay.
         */
        applyHeaderColor(
            newGreen
        );


        /*
         * Reset timer ngay về 0.
         */
        timerStart =
            new Date();


        updateTimer();


        /*
         * Cache ngay
         */
        const cached =
            getUserCache() ||
            {};


        saveUserCache({

            ...cached,

            employeeId:
                employeeId,

            color:
                newGreen
                    ? "green"
                    : "yellow",

            timerStart:
                timerStart
        });


    } catch (error) {

        console.error(
            "TOGGLE ERROR:",
            error
        );


        if (
            !navigator.onLine
        ) {

            clearUserSession(
                "Mất kết nối mạng. Vui lòng đăng nhập lại."
            );

            return;
        }


        alert(
            error?.message ||
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

        if (
            currentTime
        ) {

            currentTime.textContent =
                getDisplayTimeString();
        }


        updateTimer();
    }


    /*
     * Render ngay
     */
    updateClock();


    /*
     * 1 second
     */
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
        !statusTimer
    ) {

        return;
    }


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
                ) /
                1000
            )
        );


    const hours =
        Math.floor(
            elapsed /
            3600
        );


    const minutes =
        Math.floor(
            (
                elapsed %
                3600
            ) /
            60
        );


    const seconds =
        elapsed %
        60;


    statusTimer.textContent =
        `${pad(hours)}:` +
        `${pad(minutes)}:` +
        `${pad(seconds)}`;
}


/* =====================================================
   REFRESH QR FROM FIREBASE
===================================================== */

async function generateQRCode(event) {

    /*
     * Remove focus
     */
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
         * Session
         */
        if (
            user.activeSession !==
            deviceId
        ) {

            clearUserSession(
                "Thiết bị này không còn quyền đăng nhập."
            );

            return;
        }


        /*
         * QR = 210px
         */
        renderQRCode(
            user
        );


        /*
         * Cache
         */
        saveUserCache(
            user
        );


    } catch (error) {

        console.error(
            "QR ERROR:",
            error
        );
    }
}


/*
 * Giữ tương thích với code cũ.
 */
window.generateQRCode =
    generateQRCode;


/* =====================================================
   REFRESH BUTTON
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
   申请离场

   Chỉ hiển thị.
   Không tự thêm chức năng khác.
===================================================== */

if (
    leaveAction
) {

    leaveAction.addEventListener(

        "click",

        event => {

            event.preventDefault();

            event.stopPropagation();
        }
    );
}


/* =====================================================
   HOLD START
===================================================== */

function startPress(event) {

    /*
     * Admin không dùng hold.
     */
    if (
        document.body.classList.contains(
            "admin-body"
        )
    ) {

        return;
    }


    /*
     * Chỉ giữ bên ngoài card.
     */
    if (
        event.target?.closest &&
        event.target.closest(
            ".card"
        )
    ) {

        return;
    }


    /*
     * Xóa timer cũ
     */
    clearTimeout(
        pressTimer
    );


    /*
     * 5 seconds
     */
    pressTimer =
        setTimeout(
            () => {

                pressTimer =
                    null;

                toggleHeaderColor();
            },

            HOLD_DURATION
        );
}


/* =====================================================
   CANCEL HOLD
===================================================== */

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


/* =====================================================
   TOUCH HOLD
===================================================== */

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


/* =====================================================
   MOUSE HOLD
===================================================== */

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
   PREVENT EMPLOYEE SCROLL

   Admin vẫn scroll.
===================================================== */

document.addEventListener(

    "touchmove",

    event => {

        /*
         * Admin
         */
        if (
            document.body.classList.contains(
                "admin-body"
            )
        ) {

            return;
        }


        /*
         * Employee app
         */
        event.preventDefault();
    },

    {
        passive: false
    }
);


/* =====================================================
   CLEAR USER SESSION

   Dùng khi:
   - Admin Reset
   - khóa tài khoản
   - xóa tài khoản
   - device khác
   - offline

   DEVICE ID không xóa.
===================================================== */

function clearUserSession(
    message = ""
) {

    console.warn(
        "CLEAR USER SESSION:",
        message
    );


    /*
     * Listener
     */
    if (
        unsubscribeUser
    ) {

        unsubscribeUser();

        unsubscribeUser =
            null;
    }


    /*
     * Clock
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
     * Hold
     */
    cancelPress();


    /*
     * State
     */
    employeeId =
        null;

    timerStart =
        null;

    isLoggedIn =
        false;


    /*
     * Xóa employee
     */
    localStorage.removeItem(
        EMPLOYEE_KEY
    );


    /*
     * Xóa cache
     */
    clearUserCache();


    /*
     * QR
     */
    if (
        qrcodeElement
    ) {

        qrcodeElement.innerHTML =
            "";
    }


    /*
     * Action về mặc định
     */
    applyActionRow(
        false
    );


    /*
     * UI
     */
    appScreen?.classList.add(
        "hidden"
    );

    loginScreen?.classList.remove(
        "hidden"
    );


    /*
     * Input
     */
    if (
        employeeCodeInput
    ) {

        employeeCodeInput.value =
            "";
    }


    /*
     * Logout
     */
    if (
        logoutButton
    ) {

        logoutButton.style.display =
            "none";
    }


    /*
     * Message
     */
    if (
        loginMessage
    ) {

        loginMessage.textContent =
            message;
    }
}


/* =====================================================
   SHOW LOGIN
===================================================== */

function showLogin(
    message = ""
) {

    /*
     * Listener
     */
    if (
        unsubscribeUser
    ) {

        unsubscribeUser();

        unsubscribeUser =
            null;
    }


    /*
     * Clock
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
     * Hold
     */
    cancelPress();


    /*
     * Lấy employee local
     */
    employeeId =
        localStorage.getItem(
            EMPLOYEE_KEY
        );


    isLoggedIn =
        false;


    /*
     * UI
     */
    appScreen?.classList.add(
        "hidden"
    );

    loginScreen?.classList.remove(
        "hidden"
    );


    /*
     * Logout
     */
    if (
        logoutButton
    ) {

        logoutButton.style.display =
            "none";
    }


    /*
     * Message
     */
    if (
        message &&
        loginMessage
    ) {

        loginMessage.textContent =
            message;
    }
}


/* =====================================================
   LOGIN MESSAGE
===================================================== */

function showLoginMessage(message) {

    if (
        loginMessage
    ) {

        loginMessage.textContent =
            message ||
            "";
    }
}


/* =====================================================
   OFFLINE
===================================================== */

window.addEventListener(

    "offline",

    () => {

        clearUserSession(
            "Mất kết nối mạng. Vui lòng đăng nhập lại."
        );
    }
);


/* =====================================================
   ONLINE
===================================================== */

window.addEventListener(

    "online",

    () => {

        console.log(
            "NETWORK ONLINE"
        );
    }
);


/* =====================================================
   VISIBILITY CHANGE

   Minimize / background:
   KHÔNG logout.

   Mở lại:
   cache hiện trước,
   Firebase verify sau.
===================================================== */

document.addEventListener(

    "visibilitychange",

    () => {

        if (
            document.visibilityState !==
            "visible"
        ) {

            return;
        }


        /*
         * Offline
         */
        if (
            !navigator.onLine
        ) {

            clearUserSession(
                "Mất kết nối mạng. Vui lòng đăng nhập lại."
            );

            return;
        }


        /*
         * Lấy employee mới nhất
         */
        employeeId =
            localStorage.getItem(
                EMPLOYEE_KEY
            );


        /*
         * Không employee
         */
        if (
            !employeeId
        ) {

            showLogin();

            return;
        }


        /*
         * App chưa hiện:
         * cache trước
         */
        if (
            !isLoggedIn
        ) {

            showCachedAppImmediately();
        }


        /*
         * Verify Firebase
         */
        verifyCurrentSession();
    }
);


/* =====================================================
   PAGESHOW

   iPhone / Safari bfcache
===================================================== */

window.addEventListener(

    "pageshow",

    () => {

        employeeId =
            localStorage.getItem(
                EMPLOYEE_KEY
            );


        /*
         * Chưa login
         */
        if (
            !employeeId
        ) {

            showLogin();

            return;
        }


        /*
         * Offline
         */
        if (
            !navigator.onLine
        ) {

            clearUserSession(
                "Mất kết nối mạng. Vui lòng đăng nhập lại."
            );

            return;
        }


        /*
         * Cache hiện ngay
         */
        showCachedAppImmediately();


        /*
         * Firebase sau
         */
        verifyCurrentSession();
    }
);


/* =====================================================
   START
===================================================== */

async function start() {

    /*
     * Employee local
     */
    employeeId =
        localStorage.getItem(
            EMPLOYEE_KEY
        );


    /*
     * Offline
     */
    if (
        !navigator.onLine
    ) {

        showLogin(
            "Mất kết nối mạng. Vui lòng đăng nhập lại."
        );

        return;
    }


    /*
     * Chưa đăng nhập
     */
    if (
        !employeeId
    ) {

        showLogin();

        return;
    }


    /*
     * Hiện cache ngay
     */
    const cacheShown =
        showCachedAppImmediately();


    /*
     * Chưa có cache:
     * giữ login cho đến khi Firebase xác minh.
     */
    if (
        !cacheShown
    ) {

        loginScreen?.classList.remove(
            "hidden"
        );

        appScreen?.classList.add(
            "hidden"
        );
    }


    /*
     * Firebase verify
     */
    await verifyCurrentSession();
}


/* =====================================================
   LOGIN BUTTON
===================================================== */

if (
    loginButton
) {

    loginButton.addEventListener(
        "click",
        login
    );
}


/* =====================================================
   ENTER LOGIN
===================================================== */

if (
    employeeCodeInput
) {

    employeeCodeInput.addEventListener(

        "keydown",

        event => {

            if (
                event.key ===
                "Enter"
            ) {

                login();
            }
        }
    );
}


/* =====================================================
   START APP
===================================================== */

start();
