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
   ẨN NÚT ĐĂNG XUẤT NẾU HTML CŨ VẪN CÒN
===================================================== */

const logoutButton =
    document.getElementById("logoutButton");

if (logoutButton) {

    logoutButton.style.display =
        "none";
}


/* =====================================================
   STORAGE KEYS
===================================================== */

const EMPLOYEE_KEY =
    "thor_employee_id";

const DEVICE_KEY =
    "thor_device_id";

const USER_CACHE_KEY =
    "thor_user_cache";


/* =====================================================
   GLOBAL STATE
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
     * Milliseconds từ cache
     */

    if (
        typeof value === "number"
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
   CACHE USER
===================================================== */

function saveUserCache(user) {

    try {

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
                normalizeDate(
                    user.timerStart
                )
                    ? normalizeDate(
                        user.timerStart
                    ).getTime()
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
   LOAD USER CACHE
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


/* =====================================================
   DELETE USER CACHE
===================================================== */

function clearUserCache() {

    localStorage.removeItem(
        USER_CACHE_KEY
    );
}


/* =====================================================
   FIREBASE LOGIN
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
   SHOW APP IMMEDIATELY FROM CACHE
===================================================== */

function showCachedAppImmediately() {

    if (
        !employeeId
    ) {

        return false;
    }


    const cached =
        getUserCache();


    if (
        !cached
    ) {

        return false;
    }


    if (
        cached.employeeId &&
        cached.employeeId !== employeeId
    ) {

        return false;
    }


    try {

        employeeHeader.textContent =
            `${cached.employeeId || employeeId} (${cached.name || ""})`;


        applyHeaderColor(
            cached.color === "green"
        );


        timerStart =
            normalizeDate(
                cached.timerStart
            );


        loginScreen.classList.add(
            "hidden"
        );


        appScreen.classList.remove(
            "hidden"
        );


        isLoggedIn =
            true;


        startClock();


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
   QR FROM CACHE
===================================================== */

function generateQRCodeFromCache(
    user
) {

    if (
        !qrcodeElement
    ) {

        return;
    }


    if (
        !employeeId
    ) {

        return;
    }


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


    const employeeName =
        user.name || "";


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
            formattedTime
        )}` +
        `&token=${encodeURIComponent(
            uniqueToken
        )}`;


    qrcodeElement.innerHTML =
        "";


    if (
        typeof QRCode === "undefined"
    ) {

        console.error(
            "QRCode library chưa được tải."
        );

        return;
    }


    /*
     * QUAN TRỌNG:
     * Tạo QR trực tiếp 220 × 220.
     * Không tạo 230 rồi CSS thu nhỏ.
     */

    new QRCode(
        qrcodeElement,
        {

            text:
                accessData,

            width:
                220,

            height:
                220,

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
   GET EMPLOYEE
===================================================== */

async function getEmployee(
    code
) {

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


    showCachedAppImmediately();


    if (
        !navigator.onLine
    ) {

        forceLocalLogout(
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


        if (
            isLoggedIn
        ) {

            generateQRCode();
        }


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


        console.warn(
            "Firebase kiểm tra tạm thời thất bại."
        );


        return true;
    }
}


/* =====================================================
   RESTORE APP
===================================================== */

async function restoreApp() {

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

        showLogin(
            "Mất kết nối mạng. Vui lòng đăng nhập lại."
        );

        return;
    }


    const cacheShown =
        showCachedAppImmediately();


    if (!cacheShown) {

        loginScreen.classList.remove(
            "hidden"
        );

        appScreen.classList.add(
            "hidden"
        );
    }


    await verifyCurrentSession();
}


/* =====================================================
   LOAD USER REALTIME
===================================================== */

async function loadUser() {

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

                if (
                    !snapshot.exists()
                ) {

                    clearUserSession(
                        "Tài khoản không còn tồn tại."
                    );

                    return;
                }


                if (
                    employeeId !==
                    currentEmployee
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
                        "Tài khoản đã được Admin reset hoặc chuyển sang thiết bị khác."
                    );

                    return;
                }


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

function renderUser(
    user
) {

    saveUserCache(
        user
    );


    employeeHeader.textContent =
        `${user.employeeId || employeeId} (${user.name || ""})`;


    applyHeaderColor(
        user.color === "green"
    );


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


                if (
                    user.activeSession !==
                    deviceId
                ) {

                    throw new Error(
                        "Thiết bị này không còn quyền sử dụng tài khoản."
                    );
                }


                if (
                    user.active !== true
                ) {

                    throw new Error(
                        "Tài khoản đã bị khóa."
                    );
                }


                const newGreen =
                    user.color !==
                    "green";


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
   QR FROM FIREBASE
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


        if (
            user.activeSession !==
            deviceId
        ) {

            clearUserSession(
                "Thiết bị này không còn quyền đăng nhập."
            );

            return;
        }


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


        const employeeName =
            user.name || "";


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


        /*
         * QR FIREBASE
         * GIỮ ĐÚNG 220 × 220
         */

        new QRCode(
            qrcodeElement,
            {

                text:
                    accessData,

                width:
                    220,

                height:
                    220,

                colorDark:
                    "#000000",

                colorLight:
                    "#ffffff",

                correctLevel:
                    QRCode.CorrectLevel.M
            }
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
   PREVENT PAGE SCROLL
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
   CLEAR USER SESSION
===================================================== */

function clearUserSession(
    message = ""
) {

    console.warn(
        "CLEAR USER SESSION:",
        message
    );


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
        null;


    timerStart =
        null;


    isLoggedIn =
        false;


    localStorage.removeItem(
        EMPLOYEE_KEY
    );


    clearUserCache();


    appScreen.classList.add(
        "hidden"
    );


    loginScreen.classList.remove(
        "hidden"
    );


    if (
        qrcodeElement
    ) {

        qrcodeElement.innerHTML =
            "";
    }


    if (
        logoutButton
    ) {

        logoutButton.style.display =
            "none";
    }


    employeeCodeInput.value =
        "";


    loginMessage.textContent =
        message;
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


    if (message) {

        loginMessage.textContent =
            message;
    }
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
===================================================== */

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

                clearUserSession(
                    "Mất kết nối mạng. Vui lòng đăng nhập lại."
                );

                return;
            }


            if (
                employeeId &&
                !isLoggedIn
            ) {

                showCachedAppImmediately();

                verifyCurrentSession();
            }
        }
    }
);


/* =====================================================
   PAGESHOW
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


        showCachedAppImmediately();


        verifyCurrentSession();
    }
);


/* =====================================================
   BOOT
===================================================== */

async function start() {

    employeeId =
        localStorage.getItem(
            EMPLOYEE_KEY
        );


    if (
        !navigator.onLine
    ) {

        showLogin(
            "Mất kết nối mạng. Vui lòng đăng nhập lại."
        );

        return;
    }


    if (
        !employeeId
    ) {

        showLogin();

        return;
    }


    const cacheShown =
        showCachedAppImmediately();


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


            generateQRCode();


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


    verifyCurrentSession();
}


/* =====================================================
   EVENTS LOGIN
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
