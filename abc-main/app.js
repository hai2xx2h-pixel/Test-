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
   ẨN NÚT ĐĂNG XUẤT
   Không cần sửa HTML cũng được.
===================================================== */

const logoutButton =
    document.getElementById("logoutButton");

if (logoutButton) {

    logoutButton.style.display =
        "none";
}


/* =====================================================
   STORAGE
===================================================== */

/*
 * employeeId:
 * Chỉ lưu trong phiên local hiện tại.
 *
 * deviceId:
 * ID cố định của trình duyệt / thiết bị.
 *
 * QUAN TRỌNG:
 * KHÔNG BAO GIỜ xóa DEVICE_KEY.
 */

const EMPLOYEE_KEY =
    "thor_employee_id";

const DEVICE_KEY =
    "thor_device_id";


/* =====================================================
   GLOBAL STATE
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

let offlineHandled = false;

let isShowingLogin = false;

let pressTimer = null;


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
   QUAN TRỌNG
   KHÔNG AUTO LOGIN
===================================================== */

/*
 * Xóa employee cũ ngay khi JavaScript chạy.
 *
 * Nhưng KHÔNG xóa deviceId.
 *
 * Vì vậy:
 *
 * Máy A:
 * deviceId = ABC
 *
 * Đăng nhập:
 * activeSession = ABC
 *
 * Sau khi đóng / vuốt app:
 * employeeId bị xóa
 *
 * Đăng nhập lại:
 * deviceId vẫn là ABC
 *
 * Firebase nhận ra:
 * ABC == ABC
 *
 * => cùng thiết bị.
 */

localStorage.removeItem(
    EMPLOYEE_KEY
);

employeeId = null;


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
   NETWORK - MẤT MẠNG LOGOUT NGAY
===================================================== */

function handleOffline() {

    if (offlineHandled) {

        return;
    }


    offlineHandled = true;


    console.warn(
        "NETWORK OFFLINE - LOGOUT IMMEDIATELY"
    );


    /*
     * Không chờ Firestore.
     *
     * Không update activeSession.
     *
     * Chỉ đưa giao diện về login.
     */

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
   PAGE VISIBILITY
===================================================== */

/*
 * KHÔNG logout khi:
 *
 * - bấm Home
 * - chuyển sang app khác
 * - màn hình tắt
 *
 * Vì đây chưa chắc là app bị đóng.
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

                handleOffline();
            }
        }
    }
);


/* =====================================================
   PAGESHOW
   FIX LỖI IPHONE / SAFARI / PWA / BFCache
===================================================== */

/*
 * Đây là phần quan trọng nhất để sửa:
 *
 * "Vuốt app đi rồi mở lại vẫn vào thẳng app."
 *
 * Safari có thể khôi phục trang từ bfcache
 * mà không chạy lại toàn bộ JavaScript.
 *
 * pageshow vẫn được gọi.
 */

window.addEventListener(
    "pageshow",
    event => {

        console.log(
            "PAGESHOW:",
            event.persisted
        );


        /*
         * Nếu trang được khôi phục từ bfcache
         */

        if (
            event.persisted
        ) {

            forceLocalLogout(
                "Vui lòng đăng nhập lại."
            );

            return;
        }


        /*
         * Kiểm tra mạng
         */

        if (
            !navigator.onLine
        ) {

            handleOffline();

            return;
        }


        /*
         * Luôn đảm bảo lúc mở trang
         * không còn employee cũ.
         */

        employeeId =
            null;

        localStorage.removeItem(
            EMPLOYEE_KEY
        );


        showLogin();
    }
);


/* =====================================================
   FIREBASE ANONYMOUS LOGIN
===================================================== */

async function ensureFirebaseLogin() {

    if (
        auth.currentUser
    ) {

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


        if (
            !navigator.onLine
        ) {

            handleOffline();

            return;
        }


        /* =========================================
           GET USER
        ========================================= */

        const result =
            await getEmployee(
                code
            );


        const userRef =
            result.ref;


        /* =========================================
           CHECK ACCOUNT
        ========================================= */

        checkEmployeeAccount(
            result.data
        );


        /* =========================================
           DEVICE LOCK
        ========================================= */

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


        /* =========================================
           SAVE EMPLOYEE
        ========================================= */

        employeeId =
            code;


        localStorage.setItem(
            EMPLOYEE_KEY,
            employeeId
        );


        showLoginMessage(
            ""
        );


        /* =========================================
           OPEN APP
        ========================================= */

        await openApp();


    } catch (error) {

        console.error(
            "LOGIN ERROR:",
            error
        );


        if (
            !navigator.onLine
        ) {

            handleOffline();

            return;
        }


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

    if (
        !navigator.onLine
    ) {

        handleOffline();

        return;
    }


    if (!employeeId) {

        showLogin();

        return;
    }


    isShowingLogin = false;


    loginScreen.classList.add(
        "hidden"
    );


    appScreen.classList.remove(
        "hidden"
    );


    /*
     * Đảm bảo nút logout biến mất
     */

    if (logoutButton) {

        logoutButton.style.display =
            "none";
    }


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
   LOAD USER REALTIME
===================================================== */

async function loadUser() {

    if (!employeeId) {

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


    if (
        unsubscribeUser
    ) {

        unsubscribeUser();

        unsubscribeUser = null;
    }


    unsubscribeUser =
        onSnapshot(

            userRef,

            snapshot => {

                /*
                 * Nếu trong lúc chờ
                 * người dùng đã logout
                 */

                if (
                    employeeId !==
                    currentEmployee
                ) {

                    return;
                }


                /*
                 * USER BỊ XÓA
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
                 * Lỗi mạng khác
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
        !employeeId ||
        !navigator.onLine
    ) {

        if (
            !navigator.onLine
        ) {

            handleOffline();
        }

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


        if (
            !navigator.onLine
        ) {

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
   GIỮ NGUYÊN CƠ CHẾ
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


        const currentEmployee =
            employeeId;


        const userRef =
            doc(
                db,
                "users",
                currentEmployee
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


        /*
         * GIỮ NGUYÊN CƠ CHẾ QR
         */

        const accessData =
            `https://YOUR-AUTHORIZED-DOMAIN/access` +
            `?id=${encodeURIComponent(
                currentEmployee
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


        if (
            !navigator.onLine
        ) {

            handleOffline();
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


function startPress(
    event
) {

    /*
     * Không kích hoạt trong card.
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
   FORCE LOCAL LOGOUT
===================================================== */

function forceLocalLogout(
    message
) {

    console.warn(
        "FORCE LOCAL LOGOUT:",
        message
    );


    showLogin();


    showLoginMessage(
        message
    );
}


/* =====================================================
   SHOW LOGIN
===================================================== */

function showLogin() {

    if (isShowingLogin) {

        /*
         * Vẫn đảm bảo UI đúng.
         */

        appScreen.classList.add(
            "hidden"
        );

        loginScreen.classList.remove(
            "hidden"
        );

        return;
    }


    isShowingLogin = true;


    /*
     * Hủy Firestore listener
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
     * Hủy hold timer
     */

    cancelPress();


    /*
     * Reset phiên hiện tại
     */

    employeeId =
        null;


    timerStart =
        null;


    /*
     * QUAN TRỌNG:
     *
     * XÓA employeeId
     *
     * NHƯNG KHÔNG XÓA deviceId.
     */

    localStorage.removeItem(
        EMPLOYEE_KEY
    );


    /*
     * UI LOGIN
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
     * Xóa thông tin cũ
     */

    employeeCodeInput.value =
        "";


    /*
     * Ẩn logout tuyệt đối
     */

    if (logoutButton) {

        logoutButton.style.display =
            "none";
    }


    /*
     * Không tự focus input
     */

    loginMessage.textContent =
        "";
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

function start() {

    /*
     * LUÔN bắt đầu bằng LOGIN.
     *
     * Không auto login.
     */

    employeeId =
        null;


    localStorage.removeItem(
        EMPLOYEE_KEY
    );


    showLogin();


    if (
        !navigator.onLine
    ) {

        offlineHandled =
            true;


        showLoginMessage(
            "Không có kết nối mạng."
        );
    }
}


/* =====================================================
   START APPLICATION
===================================================== */

start();
