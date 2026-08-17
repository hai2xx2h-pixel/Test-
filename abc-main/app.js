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

let offlineTimer =
    null;


/*
 * Thời gian cho phép mất mạng
 * trước khi đưa về login.
 *
 * 15 giây.
 */

const OFFLINE_GRACE_TIME =
    15000;


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
   FIREBASE LOGIN
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
   EMPLOYEE LOGIN
===================================================== */

async function login() {

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
         * Firebase Anonymous
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
         * Kiểm tra tài khoản
         */

        checkEmployeeAccount(
            result.data
        );


        /*
         * =================================================
         * KIỂM TRA THIẾT BỊ
         *
         * activeSession = deviceId
         *
         * Cùng máy:
         *
         * activeSession === deviceId
         *
         * => cho đăng nhập
         *
         * Máy khác:
         *
         * activeSession !== deviceId
         *
         * => từ chối
         * =================================================
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
                 * Active
                 */

                if (
                    freshUser.active !== true
                ) {

                    throw new Error(
                        "Tài khoản đã bị khóa."
                    );
                }


                /*
                 * Thời gian
                 */

                checkEmployeeAccount(
                    freshUser
                );


                /*
                 * Device hiện tại
                 */

                const currentDevice =
                    freshUser.activeSession ||
                    null;


                /*
                 * Nếu đang có thiết bị khác
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
                 * Ghi deviceId
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


        /*
         * Xóa trạng thái offline
         */

        clearOfflineTimer();


        showLoginMessage(
            ""
        );


        /*
         * Mở app
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


        if (
            error?.code ===
            "permission-denied"
        ) {

            message =
                "Firebase từ chối quyền truy cập Firestore. Hãy kiểm tra Firestore Rules.";
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

    loginScreen.classList.add(
        "hidden"
    );


    appScreen.classList.remove(
        "hidden"
    );


    startClock();


    await loadUser();


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
     * Firestore realtime
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
                 * =================================================
                 * KIỂM TRA DEVICE
                 *
                 * Đây là điều kiện quan trọng nhất.
                 * =================================================
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
                 * Active
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
                 * Thời gian
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
                    "Firestore realtime error:",
                    error
                );


                /*
                 * Không logout ngay khi
                 * Firestore mất kết nối.
                 *
                 * Để Firebase tự reconnect.
                 */

                if (
                    error?.code ===
                    "permission-denied"
                ) {

                    showLoginMessage(
                        "Firestore từ chối quyền truy cập."
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
                 * Đổi màu
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
         * Kiểm tra device
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
         * QR GIỮ NGUYÊN
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
     * Không kích hoạt khi
     * chạm vào card / QR.
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


/* =====================================================
   TOUCH
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
   MOUSE
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


/*
 * KHÔNG CÒN:
 *
 * document.addEventListener("touchmove"...)
 *
 * vì đoạn này chặn thao tác vuốt
 * trên điện thoại.
 */


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
     * Hủy realtime
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
     * Reset employee
     *
     * KHÔNG xóa DEVICE_KEY.
     */

    employeeId =
        null;


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
   OFFLINE CONTROL
===================================================== */

function clearOfflineTimer() {

    if (
        offlineTimer
    ) {

        clearTimeout(
            offlineTimer
        );

        offlineTimer =
            null;
    }
}


function handleOffline() {

    /*
     * Nếu chưa đăng nhập thì
     * không cần xử lý.
     */

    if (
        !employeeId
    ) {

        return;
    }


    /*
     * Đã có timer thì không tạo lại.
     */

    if (
        offlineTimer
    ) {

        return;
    }


    console.warn(
        "THOR: Mất kết nối mạng."
    );


    /*
     * Cho phép mạng khôi phục
     * trong 15 giây.
     */

    offlineTimer =
        setTimeout(
            () => {

                offlineTimer =
                    null;


                /*
                 * Nếu vẫn offline
                 */

                if (
                    !navigator.onLine
                ) {

                    forceLogout(
                        "Mất kết nối mạng quá lâu. Vui lòng đăng nhập lại khi có mạng."
                    );
                }

            },
            OFFLINE_GRACE_TIME
        );
}


function handleOnline() {

    console.log(
        "THOR: Đã kết nối mạng."
    );


    clearOfflineTimer();


    /*
     * Nếu đang có nhân viên,
     * kiểm tra lại Firebase.
     */

    if (
        employeeId
    ) {

        reconnectAfterOnline();
    }
}


/* =====================================================
   RECONNECT AFTER ONLINE
===================================================== */

async function reconnectAfterOnline() {

    try {

        await ensureFirebaseLogin();


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


        const snapshot =
            await getDoc(
                userRef
            );


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
         * Kiểm tra thiết bị.
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
         * Kiểm tra active.
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
         * Kiểm tra thời gian.
         */

        checkEmployeeAccount(
            user
        );


        /*
         * Nếu đang ở login
         * thì mở lại app.
         */

        if (
            appScreen.classList.contains(
                "hidden"
            )
        ) {

            loginScreen.classList.add(
                "hidden"
            );


            appScreen.classList.remove(
                "hidden"
            );


            startClock();


            await loadUser();


            generateQRCode();
        }

    } catch (error) {

        console.error(
            "RECONNECT ERROR:",
            error
        );
    }
}


/* =====================================================
   NETWORK EVENTS
===================================================== */

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
 * QUAN TRỌNG:
 *
 * Không logout khi:
 *
 * - Vuốt app
 * - Chuyển app
 * - Khóa màn hình
 * - Mở lại trình duyệt
 * - Chuyển tab
 *
 * Chỉ kiểm tra lại Firebase
 * khi quay lại app.
 */

document.addEventListener(
    "visibilitychange",
    async () => {

        if (
            document.visibilityState !==
            "visible"
        ) {

            return;
        }


        if (
            !employeeId
        ) {

            return;
        }


        /*
         * Nếu offline thì chờ online.
         */

        if (
            !navigator.onLine
        ) {

            return;
        }


        /*
         * Kiểm tra lại session
         * khi quay lại app.
         */

        try {

            await reconnectAfterOnline();

        } catch (error) {

            console.error(
                "VISIBILITY CHECK ERROR:",
                error
            );
        }

    }
);


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
     */

    if (
        !employeeId
    ) {

        showLogin();

        return;
    }


    /*
     * Nếu offline khi mở app,
     * không xóa session.
     */

    if (
        !navigator.onLine
    ) {

        loginScreen.classList.add(
            "hidden"
        );


        appScreen.classList.remove(
            "hidden"
        );


        startClock();


        handleOffline();


        return;
    }


    /*
     * Có employee cũ
     * => kiểm tra Firebase.
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

            showLogin();

            showLoginMessage(
                "Tài khoản không còn tồn tại."
            );

            return;
        }


        const user =
            snapshot.data();


        /*
         * Kiểm tra device.
         */

        if (
            user.activeSession !==
            deviceId
        ) {

            showLogin();

            showLoginMessage(
                "Thiết bị này không còn giữ quyền đăng nhập."
            );

            return;
        }


        /*
         * Kiểm tra tài khoản.
         */

        checkEmployeeAccount(
            user
        );


        /*
         * Mở app.
         */

        loginScreen.classList.add(
            "hidden"
        );


        appScreen.classList.remove(
            "hidden"
        );


        startClock();


        await loadUser();


        generateQRCode();


    } catch (error) {

        console.error(
            "AUTO LOGIN ERROR:",
            error
        );


        /*
         * Chỉ đưa về login
         * nếu Firebase xác nhận
         * session không còn hợp lệ.
         */

        if (
            error?.code ===
            "permission-denied"
        ) {

            showLoginMessage(
                "Không có quyền truy cập Firebase."
            );


            return;
        }


        showLogin();


        showLoginMessage(
            error?.message ||
            "Phiên đăng nhập không còn hợp lệ."
        );
    }
}


/* =====================================================
   START
===================================================== */

start();
