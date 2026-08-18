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

const logoutButton =
    document.getElementById("logoutButton");


/* =====================================================
   ẨN LOGOUT NẾU HTML CŨ CÒN NÚT
===================================================== */

if (logoutButton) {
    logoutButton.style.display = "none";
}


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
   QR SIZE

   QUAN TRỌNG:
   CSS cũng phải để 180 × 180.
===================================================== */

const QR_SIZE =
    180;


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

let pressTimer =
    null;

let loginInProgress =
    false;

let isLoggedIn =
    false;


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
   UTILITIES
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
        typeof value.toDate === "function"
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
     * Number / String
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
   CURRENT TIME STRING
===================================================== */

function getCurrentTimeString() {

    const now =
        new Date();


    return (
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
        ).padStart(2, "0")}`
    );
}


/* =====================================================
   CACHE USER
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
   READ CACHE
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
            typeof data !== "object"
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
   HEADER COLOR
===================================================== */

function applyHeaderColor(green) {

    if (!cardHeader || !headerText) {
        return;
    }


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
   QR DATA
===================================================== */

function createQRData(
    name
) {

    const formattedTime =
        getCurrentTimeString();


    const uniqueToken =
        Math.random()
            .toString(36)
            .substring(2) +
        Date.now()
            .toString(36);


    return (
        `https://YOUR-AUTHORIZED-DOMAIN/access` +
        `?id=${encodeURIComponent(
            employeeId || ""
        )}` +
        `&name=${encodeURIComponent(
            name || ""
        )}` +
        `&time=${encodeURIComponent(
            formattedTime
        )}` +
        `&token=${encodeURIComponent(
            uniqueToken
        )}`
    );
}


/* =====================================================
   RENDER QR

   QR được sinh trực tiếp đúng 180 × 180.
===================================================== */

function renderQRCode(
    employeeName
) {

    if (
        !qrcodeElement ||
        !employeeId
    ) {

        return;
    }


    if (
        typeof QRCode === "undefined"
    ) {

        console.error(
            "QRCode library chưa được tải."
        );

        return;
    }


    const accessData =
        createQRData(
            employeeName
        );


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
   QR FROM CACHE
===================================================== */

function generateQRCodeFromCache(user) {

    if (
        !employeeId ||
        !user
    ) {

        return;
    }


    renderQRCode(
        user.name || ""
    );
}


/* =====================================================
   SHOW CACHED APP IMMEDIATELY
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
        cached.employeeId !== employeeId
    ) {

        return false;
    }


    try {

        /*
         * Name
         */

        if (employeeHeader) {

            employeeHeader.textContent =
                `${cached.employeeId || employeeId}(${cached.name || ""})`;

        }


        /*
         * Color
         */

        applyHeaderColor(
            cached.color === "green"
        );


        /*
         * Timer
         */

        timerStart =
            normalizeDate(
                cached.timerStart
            );


        /*
         * Hiện APP ngay
         */

        loginScreen.classList.add(
            "hidden"
        );


        appScreen.classList.remove(
            "hidden"
        );


        isLoggedIn =
            true;


        /*
         * Clock
         */

        startClock();


        /*
         * QR ngay
         */

        generateQRCodeFromCache(
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
   EMPLOYEE LOGIN
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
         * Firebase login
         */

        await ensureFirebaseLogin();


        /*
         * User
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
         * 1 MÃ = 1 THIẾT BỊ
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


                checkEmployeeAccount(
                    user
                );


                const currentDevice =
                    user.activeSession ||
                    null;


                /*
                 * Chưa có thiết bị
                 */

                if (!currentDevice) {

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
         * Lưu mã
         */

        employeeId =
            code;


        localStorage.setItem(
            EMPLOYEE_KEY,
            employeeId
        );


        /*
         * Cache
         */

        saveUserCache({

            employeeId:
                code,

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


        /*
         * Open
         */

        await openApp();


    } catch (error) {

        console.error(
            "LOGIN ERROR:",
            error
        );


        let message =
            error?.message ||
            "Đăng nhập thất bại.";


        if (
            error?.message ===
            "OFFLINE"
        ) {

            message =
                "Không có kết nối mạng.";
        }


        if (
            error?.code ===
            "permission-denied"
        ) {

            message =
                "Firebase từ chối quyền truy cập Firestore.";
        }


        if (
            error?.code ===
            "auth/operation-not-allowed"
        ) {

            message =
                "Firebase Anonymous Authentication chưa được bật.";
        }


        showLoginMessage(
            message
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
     * Firebase verify
     */

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
         * Admin Reset / Device
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
         * Update cache
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
         * QR Firebase
         */

        if (
            isLoggedIn
        ) {

            renderQRCode(
                user.name || ""
            );
        }


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
         * giữ cache/QR hiện tại.
         */

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
                 * User bị xóa
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
                 * Tránh listener cũ
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
                 * Admin Reset
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
                 * Render
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
                }
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
     *
     * Bỏ khoảng trắng trước dấu (
     * để gần giao diện ảnh gốc.
     */

    if (employeeHeader) {

        employeeHeader.textContent =
            `${user.employeeId || employeeId}(${user.name || ""})`;

    }


    /*
     * Color
     */

    applyHeaderColor(
        user.color === "green"
    );


    /*
     * Timer
     */

    timerStart =
        normalizeDate(
            user.timerStart
        );


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
   TOGGLE COLOR
   HOLD 5 GIÂY
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
                 * Toggle
                 */

                const newGreen =
                    user.color !==
                    "green";


                /*
                 * Reset timer
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
                getCurrentTimeString();
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
   GENERATE QR FROM FIREBASE
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
         * Device
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
         * QR 180 × 180
         */

        renderQRCode(
            user.name || ""
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
     * Không đổi màu khi nhấn
     * trong card.
     */

    if (
        event.target.closest(
            ".card"
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
   PREVENT APP SCROLL
===================================================== */

document.addEventListener(
    "touchmove",
    event => {

        /*
         * Trang Admin được CSS xử lý riêng.
         */

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
   CLEAR USER SESSION

   Dùng khi:
   - Admin Reset
   - User bị khóa
   - User bị xóa
   - Mất mạng
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
     * Employee
     */

    localStorage.removeItem(
        EMPLOYEE_KEY
    );


    /*
     * Cache
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


    showLoginMessage(
        message
    );
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


    isLoggedIn =
        false;


    appScreen.classList.add(
        "hidden"
    );


    loginScreen.classList.remove(
        "hidden"
    );


    showLoginMessage(
        message
    );
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
   NETWORK
===================================================== */

window.addEventListener(
    "offline",
    () => {

        /*
         * Mất mạng → login ngay.
         */

        clearUserSession(
            "Mất kết nối mạng. Vui lòng đăng nhập lại."
        );
    }
);


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
   Vuốt app / đưa app xuống background
   KHÔNG logout.
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
         * Lấy employee lại
         */

        employeeId =
            localStorage.getItem(
                EMPLOYEE_KEY
            );


        /*
         * Không có employee
         */

        if (!employeeId) {

            return;
        }


        /*
         * Nếu app chưa render
         */

        if (
            !isLoggedIn
        ) {

            showCachedAppImmediately();
        }


        /*
         * Firebase kiểm tra phía sau
         */

        verifyCurrentSession();
    }
);


/* =====================================================
   PAGESHOW
   Safari / iPhone BFCache
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
         * Verify Firebase phía sau
         */

        verifyCurrentSession();
    }
);


/* =====================================================
   START APP
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
     * Chưa từng đăng nhập
     */

    if (
        !employeeId
    ) {

        showLogin();

        return;
    }


    /*
     * =================================================
     * CACHE FIRST
     *
     * Vuốt app rồi mở lại:
     * QR hiện ngay trước Firebase.
     * =================================================
     */

    const cacheShown =
        showCachedAppImmediately();


    /*
     * Có cache
     */

    if (
        cacheShown
    ) {

        verifyCurrentSession();

        return;
    }


    /*
     * Không cache:
     * Firebase verify trước.
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


        /*
         * Device
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
         * App state
         */

        isLoggedIn =
            true;


        loginScreen.classList.add(
            "hidden"
        );


        appScreen.classList.remove(
            "hidden"
        );


        /*
         * Clock
         */

        startClock();


        /*
         * QR
         */

        renderQRCode(
            user.name || ""
        );


        /*
         * Realtime
         */

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
                event.key === "Enter"
            ) {

                login();
            }
        }
    );
}


/* =====================================================
   START
===================================================== */

start();
