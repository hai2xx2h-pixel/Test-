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

let networkLogout =
    false;


/* =====================================================
   DEVICE ID
   QUAN TRỌNG
===================================================== */

/*
 * Device ID chỉ tạo MỘT LẦN.
 *
 * Không được tạo lại mỗi lần reload.
 *
 * Vì vậy:
 *
 * Cùng trình duyệt
 *      ↓
 * cùng deviceId
 *
 * Reload / vuốt lại trang
 *      ↓
 * vẫn cùng deviceId
 *
 * Thiết bị khác
 *      ↓
 * deviceId khác
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
 * Mất mạng:
 *
 * KHÔNG chờ Firebase timeout.
 *
 * Trình duyệt báo offline
 *      ↓
 * chuyển màn login NGAY.
 */

function handleOffline() {

    console.warn(
        "NETWORK OFFLINE"
    );


    networkLogout =
        true;


    /*
     * Không cần update Firebase
     * vì hiện tại đang mất mạng.
     */

    showLogin();


    showLoginMessage(
        "Mạng đã bị ngắt. Vui lòng kết nối lại và đăng nhập."
    );
}


/*
 * Khi có mạng lại:
 *
 * KHÔNG tự đăng nhập.
 *
 * Người dùng nhập mã nhân viên
 * và bấm đăng nhập.
 */

function handleOnline() {

    console.log(
        "NETWORK ONLINE"
    );
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
   FIREBASE LOGIN
===================================================== */

async function ensureFirebaseLogin() {

    if (
        !navigator.onLine
    ) {

        throw new Error(
            "Không có kết nối mạng."
        );
    }


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

        ref:
            userRef,

        data:
            snapshot.data()

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
   EMPLOYEE LOGIN
===================================================== */

async function login() {

    if (
        loginInProgress
    ) {

        return;
    }


    /*
     * Nếu đang mất mạng
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

        /*
         * Firebase Auth
         */

        await ensureFirebaseLogin();


        /*
         * Lấy employee
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
         * =========================================
         * KIỂM TRA DEVICE
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
                 * ACTIVE
                 */

                if (
                    freshUser.active !== true
                ) {

                    throw new Error(
                        "Tài khoản đã bị khóa."
                    );
                }


                /*
                 * TIME
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
                 * =================================
                 * CÙNG THIẾT BỊ
                 * =================================
                 *
                 * Nếu activeSession bằng
                 * deviceId hiện tại:
                 *
                 * => cho đăng nhập lại.
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
                 * =================================
                 * GHI DEVICE ID
                 * =================================
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


        networkLogout =
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

    /*
     * Nếu mất mạng giữa lúc login
     */

    if (
        !navigator.onLine
    ) {

        showLogin();

        showLoginMessage(
            "Mạng đã bị ngắt."
        );

        return;
    }


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
        !employeeId ||
        !deviceId
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
                 * =================================
                 * USER KHÔNG TỒN TẠI
                 * =================================
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
                 * DEVICE CHECK
                 * =================================
                 */

                if (
                    user.activeSession !==
                    deviceId
                ) {

                    forceLogout(
                        "Mã nhân viên này đang được sử dụng trên thiết bị khác."
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
                 * TIME
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


                /*
                 * Nếu mất mạng thì
                 * browser offline event
                 * sẽ xử lý ngay.
                 */

                if (
                    !navigator.onLine
                ) {

                    handleOffline();

                    return;
                }


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
        !employeeId ||
        !deviceId
    ) {

        return;
    }


    if (
        !navigator.onLine
    ) {

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
                 * Đổi màu
                 */

                const newGreen =
                    user.color !== "green";


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
   GIỮ NGUYÊN
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


    if (
        !navigator.onLine
    ) {

        handleOffline();

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

            forceLogout(
                "Tài khoản không còn tồn tại."
            );

            return;
        }


        const user =
            snapshot.data();


        /*
         * DEVICE CHECK
         */

        if (
            user.activeSession !==
            deviceId
        ) {

            forceLogout(
                "Mã nhân viên này đang được sử dụng trên thiết bị khác."
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
     * Không kích hoạt khi chạm card.
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
     * Hủy hold
     */

    cancelPress();


    /*
     * Reset state
     */

    employeeId =
        null;


    timerStart =
        null;


    /*
     * =========================================
     * QUAN TRỌNG
     * =========================================
     *
     * XÓA employeeId
     *
     * NHƯNG KHÔNG XÓA deviceId.
     *
     * Vì vậy:
     *
     * Cùng máy
     *   ↓
     * deviceId vẫn giữ nguyên
     *   ↓
     * đăng nhập lại được.
     *
     * Máy khác
     *   ↓
     * deviceId khác
     *   ↓
     * bị Firebase chặn.
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
   AUTO LOGIN
===================================================== */

/*
 * Đây là phần quan trọng nhất
 * để sửa lỗi:
 *
 * "Vuốt/reload trang lại bắt đăng nhập"
 */

async function start() {

    /*
     * Nếu hiện tại offline
     * => màn login.
     */

    if (
        !navigator.onLine
    ) {

        showLogin();

        showLoginMessage(
            "Không có kết nối mạng."
        );

        return;
    }


    /*
     * Không có employee
     * => login.
     */

    if (
        !employeeId
    ) {

        showLogin();

        return;
    }


    try {

        /*
         * Firebase Auth
         */

        await ensureFirebaseLogin();


        /*
         * =========================================
         * KIỂM TRA USER TRỰC TIẾP
         * =========================================
         *
         * Không mở app trước.
         *
         * Phải kiểm tra:
         *
         * activeSession === deviceId
         *
         * rồi mới mở app.
         */

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
         * User không tồn tại
         */

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
         * =========================================
         * DEVICE CHECK
         * =========================================
         */

        if (
            user.activeSession !==
            deviceId
        ) {

            showLogin();

            showLoginMessage(
                "Mã nhân viên này đang được sử dụng trên thiết bị khác."
            );

            return;
        }


        /*
         * =========================================
         * ACCOUNT CHECK
         * =========================================
         */

        checkEmployeeAccount(
            user
        );


        /*
         * =========================================
         * ĐÚNG THIẾT BỊ
         * =========================================
         *
         * Vào thẳng app.
         */

        networkLogout =
            false;


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
         * Nếu lỗi do mất mạng
         */

        if (
            !navigator.onLine
        ) {

            showLogin();

            showLoginMessage(
                "Mạng đã bị ngắt. Vui lòng kết nối lại và đăng nhập."
            );

            return;
        }


        /*
         * Nếu tài khoản bị lỗi
         */

        showLogin();


        showLoginMessage(
            error?.message ||
            "Không thể khôi phục phiên đăng nhập."
        );
    }
}


/* =====================================================
   START APPLICATION
===================================================== */

start();
