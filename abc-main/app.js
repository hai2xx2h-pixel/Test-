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

const QR_SIZE = 220;

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

let unsubscribeUser = null;

let clockInterval = null;

let timerStart = null;

let loginInProgress = false;

let pressTimer = null;

let isLoggedIn = false;


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
     * JavaScript Date
     */

    if (
        value instanceof Date
    ) {

        return value;
    }


    /*
     * Milliseconds
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
   DISPLAY TIME

   Ảnh gốc:
   2026-8-7 10:14:54

   Month/day KHÔNG thêm số 0 phía trước.
===================================================== */

function getDisplayTimeString() {

    const now =
        new Date();

    return (
        `${now.getFullYear()}-` +
        `${now.getMonth() + 1}-` +
        `${now.getDate()} ` +
        `${pad(now.getHours())}:` +
        `${pad(now.getMinutes())}:` +
        `${pad(now.getSeconds())}`
    );
}


/* =====================================================
   QR PAYLOAD TIME
===================================================== */

function getQRTimeString() {

    const now =
        new Date();

    return (
        `${now.getFullYear()}-` +
        `${pad(now.getMonth() + 1)}-` +
        `${pad(now.getDate())} ` +
        `${pad(now.getHours())}:` +
        `${pad(now.getMinutes())}:` +
        `${pad(now.getSeconds())}`
    );
}


/* =====================================================
   CACHE
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


function getUserCache() {

    try {

        const raw =
            localStorage.getItem(
                USER_CACHE_KEY
            );

        if (!raw) {

            return null;
        }

        const user =
            JSON.parse(raw);

        if (
            !user ||
            typeof user !== "object"
        ) {

            return null;
        }

        return user;

    } catch (error) {

        console.error(
            "READ CACHE ERROR:",
            error
        );

        return null;
    }
}


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
   CHECK EMPLOYEE
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
   ACTION ROW

   YELLOW:
       刷新二维码

   GREEN:
       申请离场    刷新二维码
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
   HEADER COLOR / TEXT
===================================================== */

function applyHeaderColor(green) {

    if (green) {

        /*
         * GREEN = 进场
         */

        cardHeader.style.backgroundColor =
            "#38a754";

        headerText.textContent =
            "将二维码对准扫描器刷码进场";

        applyActionRow(true);

    } else {

        /*
         * YELLOW = 出场
         */

        cardHeader.style.backgroundColor =
            "#f2c75b";

        headerText.textContent =
            "将二维码对准扫描器刷码出场";

        applyActionRow(false);
    }
}


/* =====================================================
   QR RENDER
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


    if (
        cached.employeeId &&
        cached.employeeId !==
        employeeId
    ) {

        return false;
    }


    try {

        /*
         * Employee header
         *
         * KHÔNG hard-code tên.
         * Không có khoảng trắng trước dấu (
         */

        employeeHeader.textContent =
            `${cached.employeeId || employeeId}` +
            `(${cached.name || ""})`;


        /*
         * State
         */

        const green =
            cached.color ===
            "green";

        applyHeaderColor(
            green
        );


        /*
         * Timer
         */

        timerStart =
            normalizeDate(
                cached.timerStart
            );


        /*
         * UI
         */

        loginScreen.classList.add(
            "hidden"
        );

        appScreen.classList.remove(
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

        await ensureFirebaseLogin();


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
         * ===========================================
         * 1 EMPLOYEE CODE / 1 DEVICE
         * ===========================================
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
                 * Chưa có device
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
                 * Cùng device
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
                 * Device khác
                 */

                throw new Error(
                    "Mã nhân viên này đang được sử dụng trên thiết bị khác."
                );
            }
        );


        employeeId =
            code;


        localStorage.setItem(
            EMPLOYEE_KEY,
            employeeId
        );


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


    /*
     * Hiện cache trước
     */

    showCachedAppImmediately();


    if (
        !navigator.onLine
    ) {

        clearUserSession(
            "Mất kết nối mạng. Vui lòng đăng nhập lại."
        );

        return;
    }


    await verifyCurrentSession();
}


/* =====================================================
   VERIFY CURRENT SESSION
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


        checkEmployeeAccount(
            user
        );


        /*
         * Admin Reset hoặc device khác
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


        saveUserCache(
            user
        );


        renderUser(
            user
        );


        isLoggedIn =
            true;


        loginScreen.classList.add(
            "hidden"
        );

        appScreen.classList.remove(
            "hidden"
        );


        startClock();


        renderQRCode(
            user
        );


        loadUser();


        return true;


    } catch (error) {

        console.error(
            "VERIFY SESSION ERROR:",
            error
        );


        if (
            !navigator.onLine
        ) {

            clearUserSession(
                "Mất kết nối mạng. Vui lòng đăng nhập lại."
            );

            return false;
        }


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
   REALTIME USER
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


    if (
        unsubscribeUser
    ) {

        unsubscribeUser();

        unsubscribeUser =
            null;
    }


    unsubscribeUser =
        onSnapshot(

            userRef,

            snapshot => {

                /*
                 * User deleted
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
                 * Employee changed
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
                 * Admin Reset / device khác
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


                saveUserCache(
                    user
                );


                /*
                 * Realtime cập nhật:
                 * - màu
                 * - text
                 * - action
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

    saveUserCache(
        user
    );


    /*
     * Dữ liệu lấy từ Firebase.
     * KHÔNG hard-code tên/mã ảnh mẫu.
     */

    employeeHeader.textContent =
        `${user.employeeId || employeeId}` +
        `(${user.name || ""})`;


    /*
     * Color + action row
     */

    const green =
        user.color ===
        "green";

    applyHeaderColor(
        green
    );


    /*
     * Timer
     */

    timerStart =
        normalizeDate(
            user.timerStart
        );


    /*
     * User cũ chưa có timerStart
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
   HOLD 5 SEC -> CHANGE STATE

   YELLOW
       ↓ 5s
   GREEN

   GREEN
       ↓ 5s
   YELLOW

   MỖI LẦN ĐỔI:
   timerStart = NOW
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
                     * Session
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
                     * Toggle
                     */

                    const nextGreen =
                        user.color !==
                        "green";


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


                    return nextGreen;
                }
            );


        /*
         * Cập nhật giao diện NGAY,
         * không phải chờ onSnapshot.
         */

        applyHeaderColor(
            newGreen
        );


        /*
         * Reset timer ngay về 00:00:00
         */

        timerStart =
            new Date();

        updateTimer();


        /*
         * Cập nhật cache ngay
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
                ) / 1000
            )
        );


    const hours =
        Math.floor(
            elapsed / 3600
        );


    const minutes =
        Math.floor(
            (
                elapsed % 3600
            ) / 60
        );


    const seconds =
        elapsed % 60;


    statusTimer.textContent =
        `${pad(hours)}:` +
        `${pad(minutes)}:` +
        `${pad(seconds)}`;
}


/* =====================================================
   QR FIREBASE REFRESH
===================================================== */

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


        if (
            user.activeSession !==
            deviceId
        ) {

            clearUserSession(
                "Thiết bị này không còn quyền đăng nhập."
            );

            return;
        }


        renderQRCode(
            user
        );


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


window.generateQRCode =
    generateQRCode;


/* =====================================================
   REFRESH QR CLICK
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

   Hiện tại chỉ là dòng hiển thị theo ảnh gốc.
   KHÔNG tự gán chức năng khác.
===================================================== */

if (
    leaveAction
) {

    leaveAction.addEventListener(
        "click",
        event => {

            event.preventDefault();

            /*
             * Không thực hiện action.
             * Chỉ hiển thị theo trạng thái GREEN.
             */
        }
    );
}


/* =====================================================
   HOLD 5 SECONDS
===================================================== */

function startPress(event) {

    /*
     * Không giữ bên trong card.
     */

    if (
        event.target.closest &&
        event.target.closest(
            ".card"
        )
    ) {

        return;
    }


    /*
     * Không chạy trong admin.
     */

    if (
        document.body.classList.contains(
            "admin-body"
        )
    ) {

        return;
    }


    clearTimeout(
        pressTimer
    );


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
   PREVENT EMPLOYEE PAGE SCROLL

   ADMIN vẫn cuộn được.
===================================================== */

document.addEventListener(

    "touchmove",

    event => {

        if (
            document.body.classList.contains(
                "admin-body"
            )
        ) {

            return;
        }


        event.preventDefault();
    },

    {
        passive: false
    }
);


/* =====================================================
   CLEAR SESSION

   Admin Reset / khóa / xóa / offline
   sẽ quay về login.

   DEVICE ID KHÔNG XÓA.
===================================================== */

function clearUserSession(
    message = ""
) {

    console.warn(
        "CLEAR USER SESSION:",
        message
    );


    /*
     * Realtime
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
     * Xóa employee,
     * KHÔNG xóa DEVICE_KEY
     */

    localStorage.removeItem(
        EMPLOYEE_KEY
    );


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
     * Action row về mặc định
     */

    applyActionRow(
        false
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


    if (
        employeeCodeInput
    ) {

        employeeCodeInput.value =
            "";
    }


    if (
        logoutButton
    ) {

        logoutButton.style.display =
            "none";
    }


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

    if (
        unsubscribeUser
    ) {

        unsubscribeUser();

        unsubscribeUser =
            null;
    }


    if (
        clockInterval
    ) {

        clearInterval(
            clockInterval
        );

        clockInterval =
            null;
    }


    cancelPress();


    employeeId =
        localStorage.getItem(
            EMPLOYEE_KEY
        );


    isLoggedIn =
        false;


    appScreen.classList.add(
        "hidden"
    );

    loginScreen.classList.remove(
        "hidden"
    );


    if (
        logoutButton
    ) {

        logoutButton.style.display =
            "none";
    }


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
   VISIBILITY

   Đóng/minimize app KHÔNG logout.
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


        if (
            !navigator.onLine
        ) {

            clearUserSession(
                "Mất kết nối mạng. Vui lòng đăng nhập lại."
            );

            return;
        }


        employeeId =
            localStorage.getItem(
                EMPLOYEE_KEY
            );


        if (
            employeeId &&
            !isLoggedIn
        ) {

            showCachedAppImmediately();
        }


        if (
            employeeId
        ) {

            verifyCurrentSession();
        }
    }
);


/* =====================================================
   PAGESHOW
   iPhone Safari / PWA bfcache
===================================================== */

window.addEventListener(
    "pageshow",
    () => {

        employeeId =
            localStorage.getItem(
                EMPLOYEE_KEY
            );


        if (
            !employeeId
        ) {

            showLogin();

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


        /*
         * Hiện cache ngay
         */

        showCachedAppImmediately();


        /*
         * Firebase verify sau
         */

        verifyCurrentSession();
    }
);


/* =====================================================
   START
===================================================== */

async function start() {

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
     * Chưa login
     */

    if (
        !employeeId
    ) {

        showLogin();

        return;
    }


    /*
     * Cache hiện ngay
     */

    const cacheShown =
        showCachedAppImmediately();


    /*
     * Nếu chưa có cache
     */

    if (
        !cacheShown
    ) {

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


            if (
                !snapshot.exists()
            ) {

                clearUserSession(
                    "Tài khoản không còn tồn tại."
                );

                return;
            }


            const user =
                snapshot.data();


            checkEmployeeAccount(
                user
            );


            if (
                user.activeSession !==
                deviceId
            ) {

                clearUserSession(
                    "Thiết bị này không còn quyền đăng nhập."
                );

                return;
            }


            saveUserCache(
                user
            );


            renderUser(
                user
            );


            isLoggedIn =
                true;


            loginScreen.classList.add(
                "hidden"
            );

            appScreen.classList.remove(
                "hidden"
            );


            startClock();


            renderQRCode(
                user
            );


            loadUser();


        } catch (error) {

            console.error(
                "BOOT ERROR:",
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


            showLogin(
                error?.message ||
                "Không thể khôi phục phiên đăng nhập."
            );
        }


        return;
    }


    /*
     * Cache đã hiện.
     * Firebase kiểm tra phía sau.
     */

    verifyCurrentSession();
}


/* =====================================================
   LOGIN EVENTS
===================================================== */

if (
    loginButton
) {

    loginButton.addEventListener(
        "click",
        login
    );
}


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
