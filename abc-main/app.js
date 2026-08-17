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

const logoutButton =
    document.getElementById("logoutButton");

const refreshQRCode =
    document.getElementById("refreshQRCode");


/* =====================================================
   STORAGE KEYS
===================================================== */

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


/* =====================================================
   CREATE DEVICE ID
===================================================== */

/*
 * Mỗi trình duyệt / thiết bị có một ID cố định.
 *
 * KHÔNG tạo ID mới mỗi lần đăng nhập.
 *
 * Đây là phần quan trọng để sửa lỗi:
 *
 * "Mã nhân viên này đang được sử dụng
 * trên thiết bị khác."
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
     * JS Date
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
   FIREBASE ANONYMOUS LOGIN
===================================================== */

async function ensureFirebaseLogin() {

    /*
     * Đã đăng nhập Firebase
     */

    if (auth.currentUser) {

        return auth.currentUser;
    }


    /*
     * Anonymous Authentication
     */

    const result =
        await signInAnonymously(
            auth
        );


    return result.user;
}


/* =====================================================
   CHECK USER
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
     * TIME
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
   EMPLOYEE LOGIN
===================================================== */

async function login() {

    /*
     * Không cho chạy 2 lần cùng lúc.
     */

    if (loginInProgress) {

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
         * =========================================
         * 1. Firebase Anonymous
         * =========================================
         */

        await ensureFirebaseLogin();


        /*
         * =========================================
         * 2. Lấy user
         * =========================================
         */

        const result =
            await getEmployee(
                code
            );


        const userRef =
            result.ref;


        /*
         * =========================================
         * 3. Kiểm tra tài khoản
         * =========================================
         */

        checkEmployeeAccount(
            result.data
        );


        /*
         * =========================================
         * 4. CHỐNG 2 THIẾT BỊ
         *
         * activeSession sẽ chứa DEVICE ID.
         *
         * Nếu:
         *
         * activeSession == deviceId
         *
         * => cùng thiết bị
         * => cho đăng nhập lại.
         *
         *
         * Nếu:
         *
         * activeSession khác deviceId
         *
         * => thiết bị khác đang dùng.
         * =========================================
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


                /*
                 * Kiểm tra active
                 */

                if (
                    freshUser.active !== true
                ) {

                    throw new Error(
                        "Tài khoản đã bị khóa."
                    );
                }


                /*
                 * Kiểm tra thời gian
                 */

                checkEmployeeAccount(
                    freshUser
                );


                /*
                 * Session hiện tại
                 */

                const currentDevice =
                    freshUser.activeSession ||
                    null;


                /*
                 * Nếu đang được dùng
                 * bởi thiết bị khác.
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
                 * Cho phép đăng nhập.
                 *
                 * activeSession = deviceId
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
         * =========================================
         * 5. Lưu nhân viên
         * =========================================
         */

        employeeId =
            code;


        localStorage.setItem(
            EMPLOYEE_KEY,
            employeeId
        );


        showLoginMessage(
            ""
        );


        /*
         * =========================================
         * 6. Mở app
         * =========================================
         */

        await openApp();


    } catch (error) {

        console.error(
            "EMPLOYEE LOGIN ERROR:",
            error
        );


        let message =
            error?.message ||
            "Đăng nhập thất bại.";


        /*
         * Firestore permission
         */

        if (
            error?.code ===
            "permission-denied"
        ) {

            message =
                "Firebase từ chối quyền truy cập Firestore. Hãy kiểm tra Firestore Rules.";
        }


        /*
         * Firebase Auth
         */

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

    loginScreen.classList.add(
        "hidden"
    );


    appScreen.classList.remove(
        "hidden"
    );


    startClock();


    await loadUser();


    /*
     * Tạo QR sau khi load user.
     */

    generateQRCode();
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
     * REALTIME LISTENER
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

                    forceLogout(
                        "Tài khoản không còn tồn tại."
                    );

                    return;
                }


                const user =
                    snapshot.data();


                /*
                 * =================================
                 * KIỂM TRA THIẾT BỊ
                 * =================================
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
                 * =================================
                 * ACTIVE
                 * =================================
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
                 * =================================
                 * THỜI GIAN
                 * =================================
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
                 * =================================
                 * RENDER
                 * =================================
                 */

                renderUser(
                    user
                );

            },

            error => {

                console.error(
                    "Firestore realtime error:",
                    error
                );


                if (
                    error?.code ===
                    "permission-denied"
                ) {

                    showLoginMessage(
                        "Firestore từ chối quyền truy cập."
                    );

                } else {

                    showLoginMessage(
                        "Không thể kết nối dữ liệu Firebase."
                    );
                }

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
     * =========================================
     * COLOR
     * =========================================
     */

    const green =
        user.color === "green";


    applyHeaderColor(
        green
    );


    /*
     * =========================================
     * TIMER
     * =========================================
     */

    timerStart =
        normalizeDate(
            user.timerStart
        );


    /*
     * Nếu chưa có timerStart
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
                    "Không thể tạo timerStart:",
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
        !employeeId
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
                 * =================================
                 * KIỂM TRA THIẾT BỊ
                 * =================================
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
                 * =================================
                 * ĐỔI MÀU
                 * =================================
                 */

                const newGreen =
                    user.color !== "green";


                /*
                 * =================================
                 * RESET TIMER
                 * =================================
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
        !employeeId
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
         * Kiểm tra session trước khi tạo QR
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
         * QR GIỮ NGUYÊN CẤU TRÚC
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
     * Không kích hoạt khi chạm
     * vào card / QR.
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
   LOGOUT
===================================================== */

logoutButton.addEventListener(
    "click",
    async () => {

        try {

            if (
                employeeId
            ) {

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
                    snapshot.exists()
                ) {

                    const user =
                        snapshot.data();


                    /*
                     * CHỈ giải phóng session
                     * nếu đúng thiết bị.
                     */

                    if (
                        user.activeSession ===
                        deviceId
                    ) {

                        await updateDoc(
                            userRef,
                            {

                                activeSession:
                                    null,

                                updatedAt:
                                    serverTimestamp()

                            }
                        );
                    }
                }
            }


        } catch (error) {

            console.error(
                "LOGOUT ERROR:",
                error
            );

        } finally {

            showLogin();
        }
    }
);


/* =====================================================
   FORCE LOGOUT
===================================================== */

function forceLogout(
    message
) {

    console.warn(
        "FORCE LOGOUT:",
        message
    );


    /*
     * Không alert liên tục khi
     * realtime listener phát hiện thay đổi.
     */

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
     * Reset state
     */

    employeeId =
        null;


    timerStart =
        null;


    /*
     * XÓA NHÂN VIÊN
     *
     * KHÔNG xóa DEVICE_KEY.
     *
     * Đây là điểm rất quan trọng.
     *
     * Cùng thiết bị đăng nhập lại
     * vẫn nhận diện được là cùng thiết bị.
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
}


/* =====================================================
   LOGIN MESSAGE
===================================================== */

function showLoginMessage(
    message
) {

    loginMessage.textContent =
        message;
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
   AUTO LOGIN
===================================================== */

async function start() {

    /*
     * Không có employee
     * => hiện màn login.
     */

    if (
        !employeeId
    ) {

        showLogin();

        return;
    }


    /*
     * Có employee cũ
     * => thử đăng nhập lại.
     */

    try {

        await ensureFirebaseLogin();


        /*
         * Mở app
         */

        loginScreen.classList.add(
            "hidden"
        );


        appScreen.classList.remove(
            "hidden"
        );


        startClock();


        await loadUser();


        /*
         * Tạo QR
         */

        generateQRCode();


    } catch (error) {

        console.error(
            "AUTO LOGIN ERROR:",
            error
        );


        showLogin();


        showLoginMessage(
            "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại."
        );
    }
}


/* =====================================================
   START APPLICATION
===================================================== */

start();
