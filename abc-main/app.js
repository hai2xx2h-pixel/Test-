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

/*
 * employeeId:
 * Chỉ dùng trong phiên hiện tại.
 *
 * deviceId:
 * ID cố định của trình duyệt/thiết bị.
 *
 * QUAN TRỌNG:
 * Không bao giờ xóa deviceId khi logout,
 * mất mạng hoặc reload.
 */

const EMPLOYEE_KEY =
    "thor_employee_id";

const DEVICE_KEY =
    "thor_device_id";


/* =====================================================
   GLOBAL STATE
===================================================== */

let employeeId =
    null;

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

let offlineHandled =
    false;

let appActive =
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


/*
 * XÓA EMPLOYEE CŨ
 *
 * Đây là điểm rất quan trọng.
 *
 * Khi tải lại trang / vuốt app ra rồi mở lại:
 *
 * KHÔNG tự động đăng nhập.
 *
 * Người dùng phải nhập lại mã nhân viên.
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
     * String / number
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
   NETWORK
===================================================== */

/*
 * Mất mạng:
 *
 * Không chờ Firestore timeout.
 *
 * Chuyển login ngay lập tức.
 */

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


    forceLocalLogout(
        "Mất kết nối mạng. Vui lòng đăng nhập lại."
    );
}


/*
 * Có mạng trở lại.
 */

function handleOnline() {

    offlineHandled =
        false;

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
 * Không tự logout chỉ vì app chuyển
 * sang background.
 *
 * Nhưng khi trình duyệt reload / trang
 * được tạo lại thì employeeId đã bị xóa
 * ở phía trên.
 */

document.addEventListener(
    "visibilitychange",
    () => {

        /*
         * Không làm gì khi hidden.
         *
         * Tránh lỗi:
         *
         * Vuốt app
         * ->
         * visibilitychange
         * ->
         * logout
         *
         * gây mất phiên ngoài ý muốn.
         */

        if (
            document.visibilityState ===
            "visible"
        ) {

            /*
             * Nếu đang ở app mà mạng đã mất
             */

            if (
                !navigator.onLine
            ) {

                handleOffline();
            }
        }
    }
);


/* =====================================================
   FIREBASE LOGIN
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
     * DATE
     */

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


    /*
     * Nếu mất mạng:
     * không cho đăng nhập.
     */

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

        /* =========================================
           FIREBASE AUTH
        ========================================= */

        await ensureFirebaseLogin();


        /* =========================================
           LẤY USER
        ========================================= */

        const result =
            await getEmployee(
                code
            );


        const userRef =
            result.ref;


        /* =========================================
           KIỂM TRA ACCOUNT
        ========================================= */

        checkEmployeeAccount(
            result.data
        );


        /* =========================================
           KIỂM TRA DEVICE
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
                 * DATE
                 */

                checkEmployeeAccount(
                    user
                );


                /*
                 * DEVICE HIỆN TẠI
                 */

                const currentDevice =
                    user.activeSession ||
                    null;


                /*
                 * Không có thiết bị
                 * đang giữ tài khoản.
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
                 * Cho phép đăng nhập lại.
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
           LƯU PHIÊN HIỆN TẠI
        ========================================= */

        employeeId =
            code;


        /*
         * Chỉ lưu employee trong
         * phiên hiện tại.
         */

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

    /*
     * Nếu mất mạng ngay lúc mở
     */

    if (
        !navigator.onLine
    ) {

        handleOffline();

        return;
    }


    appActive =
        true;


    loginScreen.classList.add(
        "hidden"
    );


    appScreen.classList.remove(
        "hidden"
    );


    startClock();


    await loadUser();


    /*
     * QR
     */

    generateQRCode();
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
                    "FIRESTORE LISTENER ERROR:",
                    error
                );


                /*
                 * Permission denied
                 * => logout ngay.
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
                 * Nếu browser báo offline
                 */

                if (
                    !navigator.onLine
                ) {

                    handleOffline();

                    return;
                }


                /*
                 * Lỗi tạm thời:
                 * không logout ngay.
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

function renderUser(
    user
) {

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


    /*
     * Nếu chưa có timer
     */

    if (
        !timerStart
    ) {

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


        /*
         * Nếu mất mạng
         */

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

let pressTimer =
    null;


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

/*
 * Đây là logout phía trình duyệt.
 *
 * KHÔNG xóa activeSession trên Firebase.
 *
 * Vì vậy:
 *
 * - Mất mạng -> về login
 * - Vuốt app -> login khi mở lại
 * - Cùng thiết bị đăng nhập lại -> Firebase
 *   vẫn nhận ra deviceId cũ.
 */

function forceLocalLogout(
    message
) {

    console.warn(
        "LOCAL LOGOUT:",
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
     * Hủy timer giữ
     */

    cancelPress();


    /*
     * Reset phiên hiện tại
     */

    employeeId =
        null;


    timerStart =
        null;


    appActive =
        false;


    /*
     * XÓA employee.
     *
     * KHÔNG XÓA deviceId.
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


    /*
     * Xóa QR cũ
     */

    const qrcodeElement =
        document.getElementById(
            "qrcode"
        );


    if (
        qrcodeElement
    ) {

        qrcodeElement.innerHTML =
            "";
    }


    employeeCodeInput.value =
        "";


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
   PAGE RELOAD / START
===================================================== */

/*
 * QUAN TRỌNG:
 *
 * KHÔNG AUTO LOGIN.
 *
 * Mỗi lần:
 *
 * - reload
 * - mở lại web
 * - vuốt app rồi mở lại
 *
 * đều phải nhập mã nhân viên.
 */

function start() {

    /*
     * Luôn bắt đầu ở màn hình login.
     */

    showLogin();


    /*
     * Nếu hiện tại mất mạng
     */

    if (
        !navigator.onLine
    ) {

        showLoginMessage(
            "Không có kết nối mạng."
        );
    }
}


/* =====================================================
   START
===================================================== */

start();
