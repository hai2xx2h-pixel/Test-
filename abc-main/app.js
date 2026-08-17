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

let employeeId = null;

let deviceId =
    localStorage.getItem(
        DEVICE_KEY
    );

let unsubscribeUser = null;

let clockInterval = null;

let timerStart = null;

let loginInProgress = false;

let pressTimer = null;

let isAppLoggedIn = false;

let offlineHandled = false;


/* =====================================================
   DEVICE ID
===================================================== */

/*
 * DEVICE ID chỉ tạo 1 lần.
 *
 * KHÔNG BAO GIỜ xóa khi:
 *
 * - logout
 * - mất mạng
 * - reload
 * - vuốt app
 *
 * Vì Firebase dùng ID này để biết
 * đây vẫn là cùng một thiết bị.
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
   QUAN TRỌNG
   KHÔNG AUTO LOGIN
===================================================== */

/*
 * Mỗi lần file app.js được chạy lại:
 *
 * employeeId luôn phải là null.
 *
 * Người dùng phải nhập mã lại.
 */

localStorage.removeItem(
    EMPLOYEE_KEY
);


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
   NETWORK
===================================================== */

/*
 * MẤT MẠNG:
 *
 * Chuyển về login ngay lập tức.
 *
 * Không chờ Firebase 15 giây.
 */

function handleOffline() {

    if (offlineHandled) {
        return;
    }


    offlineHandled = true;


    console.warn(
        "NETWORK OFFLINE -> LOGIN"
    );


    forceLocalLogout(
        "Mất kết nối mạng. Vui lòng đăng nhập lại."
    );
}


function handleOnline() {

    offlineHandled = false;


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
   APP BỊ VUỐT RA / BACKGROUND
===================================================== */

/*
 * ĐÂY LÀ PHẦN SỬA QUAN TRỌNG NHẤT.
 *
 * Khi người dùng:
 *
 * - vuốt app lên
 * - chuyển sang app khác
 * - khóa màn hình
 * - đưa trình duyệt xuống background
 *
 * => chuyển về LOGIN.
 *
 * Nhưng KHÔNG xóa DEVICE_ID.
 *
 * Khi mở lại:
 * => phải nhập mã nhân viên.
 */

document.addEventListener(
    "visibilitychange",
    () => {

        if (
            document.visibilityState ===
            "hidden"
        ) {

            /*
             * Chỉ logout local.
             *
             * Không update Firebase.
             *
             * Không xóa deviceId.
             */

            if (isAppLoggedIn) {

                forceLocalLogout(
                    ""
                );
            }

            return;
        }


        /*
         * Khi mở lại app.
         *
         * Luôn hiển thị login.
         */

        if (
            document.visibilityState ===
            "visible"
        ) {

            /*
             * Nếu không có mạng
             */

            if (
                !navigator.onLine
            ) {

                handleOffline();

                return;
            }


            /*
             * Nếu trước đó đang ở app
             * thì tuyệt đối không tự mở lại.
             */

            if (
                !isAppLoggedIn
            ) {

                showLogin();
            }
        }
    }
);


/* =====================================================
   FIREBASE AUTH
===================================================== */

async function ensureFirebaseLogin() {

    if (auth.currentUser) {

        return auth.currentUser;
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
        ref: userRef,
        data: snapshot.data()
    };
}


/* =====================================================
   CHECK ACCOUNT
===================================================== */

function checkEmployeeAccount(
    user
) {

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


    /*
     * Không có mạng
     */

    if (!navigator.onLine) {

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


    loginInProgress = true;

    loginButton.disabled = true;


    showLoginMessage(
        "正在验证..."
    );


    try {

        /* =========================================
           FIREBASE AUTH
        ========================================= */

        await ensureFirebaseLogin();


        if (!navigator.onLine) {

            throw new Error(
                "Mất kết nối mạng."
            );
        }


        /* =========================================
           USER
        ========================================= */

        const result =
            await getEmployee(
                code
            );


        const userRef =
            result.ref;


        checkEmployeeAccount(
            result.data
        );


        /* =========================================
           DEVICE CHECK
        ========================================= */

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
                 * CHƯA CÓ THIẾT BỊ
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
                 * CÙNG THIẾT BỊ
                 *
                 * Cho phép đăng nhập.
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
                 * THIẾT BỊ KHÁC
                 */

                throw new Error(
                    "Mã nhân viên này đang được sử dụng trên thiết bị khác."
                );
            }
        );


        /*
         * LƯU SESSION LOCAL
         */

        employeeId =
            code;


        localStorage.setItem(
            EMPLOYEE_KEY,
            employeeId
        );


        isAppLoggedIn = true;


        showLoginMessage("");


        /*
         * MỞ APP
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

        loginInProgress = false;

        loginButton.disabled = false;
    }
}


/* =====================================================
   OPEN APP
===================================================== */

async function openApp() {

    if (!navigator.onLine) {

        handleOffline();

        return;
    }


    isAppLoggedIn = true;


    loginScreen.classList.add(
        "hidden"
    );


    appScreen.classList.remove(
        "hidden"
    );


    /*
     * ẨN HOÀN TOÀN NÚT LOGOUT
     */

    const logoutButton =
        document.getElementById(
            "logoutButton"
        );


    if (logoutButton) {

        logoutButton.style.display =
            "none";
    }


    startClock();


    await loadUser();


    if (
        isAppLoggedIn
    ) {

        generateQRCode();
    }
}


/* =====================================================
   LOAD USER REALTIME
===================================================== */

async function loadUser() {

    if (!employeeId) {

        showLogin();

        return;
    }


    const userRef =
        doc(
            db,
            "users",
            employeeId
        );


    if (unsubscribeUser) {

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

                    forceLocalLogout(
                        "Tài khoản không còn tồn tại."
                    );

                    return;
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

                    forceLocalLogout(
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

                    forceLocalLogout(
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

                    forceLocalLogout(
                        error.message
                    );

                    return;
                }


                /*
                 * RENDER
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
                 * Mất mạng
                 */

                if (
                    !navigator.onLine
                ) {

                    handleOffline();

                    return;
                }


                /*
                 * Permission denied
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
                    "Firestore tạm thời không kết nối."
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


    const green =
        user.color === "green";


    applyHeaderColor(
        green
    );


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
        !isAppLoggedIn
    ) {

        return;
    }


    if (!navigator.onLine) {

        handleOffline();

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


        if (!navigator.onLine) {

            handleOffline();

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

    if (clockInterval) {

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
   QR CODE
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
        !isAppLoggedIn ||
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


        if (!qrcodeElement) {
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


        if (!navigator.onLine) {

            handleOffline();
        }
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

    if (pressTimer) {

        clearTimeout(
            pressTimer
        );

        pressTimer = null;
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
   LOCAL LOGOUT
===================================================== */

function forceLocalLogout(
    message
) {

    console.warn(
        "LOCAL LOGOUT:",
        message
    );


    showLogin();


    if (message) {

        showLoginMessage(
            message
        );
    }
}


/* =====================================================
   SHOW LOGIN
===================================================== */

function showLogin() {

    /*
     * Dừng realtime listener
     */

    if (unsubscribeUser) {

        unsubscribeUser();

        unsubscribeUser =
            null;
    }


    /*
     * Dừng clock
     */

    if (clockInterval) {

        clearInterval(
            clockInterval
        );

        clockInterval =
            null;
    }


    /*
     * Hủy hold
     */

    cancelPress();


    /*
     * Reset phiên
     */

    employeeId = null;

    timerStart = null;

    isAppLoggedIn = false;


    /*
     * XÓA employee
     *
     * NHƯNG KHÔNG XÓA DEVICE ID.
     */

    localStorage.removeItem(
        EMPLOYEE_KEY
    );


    /*
     * Ẩn APP
     */

    appScreen.classList.add(
        "hidden"
    );


    /*
     * Hiện LOGIN
     */

    loginScreen.classList.remove(
        "hidden"
    );


    /*
     * Xóa QR
     */

    const qrcodeElement =
        document.getElementById(
            "qrcode"
        );


    if (qrcodeElement) {

        qrcodeElement.innerHTML =
            "";
    }


    /*
     * XÓA NÚT ĐĂNG XUẤT KHỎI GIAO DIỆN
     */

    const logoutButton =
        document.getElementById(
            "logoutButton"
        );


    if (logoutButton) {

        logoutButton.style.display =
            "none";
    }


    /*
     * Reset input
     */

    employeeCodeInput.value =
        "";
}


/* =====================================================
   LOGIN MESSAGE
===================================================== */

function showLoginMessage(
    message
) {

    if (loginMessage) {

        loginMessage.textContent =
            message;
    }
}


/* =====================================================
   EVENTS
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

/*
 * LUÔN BẮT ĐẦU Ở LOGIN.
 *
 * Không auto login.
 */

function start() {

    showLogin();


    if (!navigator.onLine) {

        showLoginMessage(
            "Không có kết nối mạng."
        );
    }
}


start();
