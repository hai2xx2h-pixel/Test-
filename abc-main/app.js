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

/*
 * Lưu thông tin cần thiết để có thể
 * hiển thị app/QR ngay lập tức khi mở lại.
 *
 * QR chỉ có tác dụng hiển thị theo yêu cầu
 * hiện tại của bạn.
 */

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

/*
 * Đây là phần giúp loại bỏ delay 2-3 giây.
 *
 * Không chờ:
 *
 * Firebase Auth
 * Firebase Firestore
 *
 * Mà lấy dữ liệu đã lưu trên máy
 * và vẽ QR ngay.
 */

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


    /*
     * Nếu cache thuộc mã khác
     * thì không sử dụng.
     */

    if (
        cached.employeeId &&
        cached.employeeId !== employeeId
    ) {

        return false;
    }


    try {

        /*
         * Nhân viên
         */

        employeeHeader.textContent =
            `${cached.employeeId || employeeId} (${cached.name || ""})`;


        /*
         * Màu
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
         * Hiện app NGAY
         */

        loginScreen.classList.add(
            "hidden"
        );


        appScreen.classList.remove(
            "hidden"
        );


        /*
         * Đánh dấu đang hiển thị app
         */

        isLoggedIn =
            true;


        /*
         * Chạy đồng hồ ngay
         */

        startClock();


        /*
         * QR ngay
         *
         * Không chờ Firebase.
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


    /*
     * QR vẫn tạo ngay cả khi Firebase
     * đang xác minh ở phía sau.
     */

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

        /*
         * Firebase Authentication
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
         * Kiểm tra account
         */

        checkEmployeeAccount(
            result.data
        );


        /*
         * =============================================
         * KIỂM TRA 1 THIẾT BỊ
         * =============================================
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


                /*
                 * Kiểm tra account lại
                 */

                checkEmployeeAccount(
                    user
                );


                /*
                 * Thiết bị đang giữ mã
                 */

                const currentDevice =
                    user.activeSession ||
                    null;


                /*
                 * =======================================
                 * CHƯA CÓ THIẾT BỊ
                 * =======================================
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
                 * =======================================
                 * CÙNG THIẾT BỊ
                 * =======================================
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
                 * =======================================
                 * THIẾT BỊ KHÁC
                 * =======================================
                 */

                throw new Error(
                    "Mã nhân viên này đang được sử dụng trên thiết bị khác."
                );
            }
        );


        /*
         * =========================================
         * LƯU USER
         * =========================================
         */

        employeeId =
            code;


        localStorage.setItem(
            EMPLOYEE_KEY,
            employeeId
        );


        /*
         * Lưu cache ngay.
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


        /*
         * Vào app
         */

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
     * Nếu có cache:
     * hiện ngay.
     */

    showCachedAppImmediately();


    /*
     * Nếu offline:
     * về login theo yêu cầu.
     */

    if (
        !navigator.onLine
    ) {

        forceLocalLogout(
            "Mất kết nối mạng. Vui lòng đăng nhập lại."
        );

        return;
    }


    /*
     * Firebase chạy phía sau.
     */

    await verifyCurrentSession();

}


/* =====================================================
   VERIFY CURRENT SESSION
===================================================== */

/*
 * Firebase xác minh ở phía sau.
 *
 * Không chặn việc hiển thị QR.
 */

async function verifyCurrentSession() {

    if (
        !employeeId
    ) {

        return false;
    }


    try {

        await ensureFirebaseLogin();


        /*
         * User document
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
         * User bị xóa
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
         * DEVICE / ADMIN RESET
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
         * Cập nhật cache
         */

        saveUserCache(
            user
        );


        /*
         * Render dữ liệu mới
         */

        renderUser(
            user
        );


        /*
         * QR cập nhật theo dữ liệu mới
         */

        if (
            isLoggedIn
        ) {

            generateQRCode();
        }


        /*
         * Theo dõi realtime
         */

        loadUser();


        return true;


    } catch (error) {

        console.error(
            "VERIFY SESSION ERROR:",
            error
        );


        /*
         * Mất mạng:
         * login ngay.
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
         * Nếu Firebase lỗi tạm thời,
         * KHÔNG đá người dùng ra ngay.
         *
         * QR cache vẫn đang hiển thị.
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


        console.warn(
            "Firebase kiểm tra tạm thời thất bại."
        );


        /*
         * Giữ app đang hiển thị.
         */

        return true;
    }
}


/* =====================================================
   RESTORE APP
===================================================== */

/*
 * Được gọi khi reload / mở lại app.
 *
 * QR từ cache hiện trước.
 * Firebase kiểm tra sau.
 */

async function restoreApp() {

    employeeId =
        localStorage.getItem(
            EMPLOYEE_KEY
        );


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
     * Không có mạng
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
     * ==========================================
     * HIỆN QR NGAY
     * ==========================================
     */

    const cacheShown =
        showCachedAppImmediately();


    /*
     * Nếu có cache, người dùng sẽ
     * thấy QR ngay lập tức.
     */

    if (!cacheShown) {

        /*
         * Chưa có cache:
         * phải xác minh Firebase.
         */

        loginScreen.classList.remove(
            "hidden"
        );

        appScreen.classList.add(
            "hidden"
        );
    }


    /*
     * Firebase xác minh phía sau.
     */

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
     * Realtime listener
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

                    clearUserSession(
                        "Tài khoản không còn tồn tại."
                    );

                    return;
                }


                /*
                 * User hiện tại khác
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
                 * ========================================
                 * ACTIVE SESSION
                 *
                 * Admin Reset cũng vào đây.
                 * ========================================
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
                 * ACTIVE
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
                 * DATE
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
                 * Cập nhật cache
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


                /*
                 * Mất mạng:
                 * logout ngay.
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
                 * Permission denied
                 */

                if (
                    error?.code ===
                    "permission-denied"
                ) {

                    clearUserSession(
                        "Phiên đăng nhập không còn quyền truy cập."
                    );

                    return;
                }


                /*
                 * Lỗi tạm thời:
                 * giữ QR.
                 */

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

    /*
     * Lưu cache trước
     */

    saveUserCache(
        user
    );


    /*
     * Employee name
     */

    employeeHeader.textContent =
        `${user.employeeId || employeeId} (${user.name || ""})`;


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


    /*
     * Nếu chưa có timerStart
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


        /*
         * Kiểm tra quyền
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


        /*
         * Cập nhật cache sau khi Firebase xác nhận.
         */

        saveUserCache(
            user
        );


    } catch (error) {

        console.error(
            "QR ERROR:",
            error
        );


        /*
         * QR cache vẫn có thể tiếp tục hiển thị
         * nếu Firebase tạm thời chậm.
         */
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
     * Dừng đồng hồ
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
     * Xóa phiên local
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
     * Xóa cache.
     *
     * Rất quan trọng khi Admin Reset,
     * để lần mở tiếp theo không hiện
     * QR cũ.
     */

    clearUserCache();


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
     * QR cũ

     */

    if (
        qrcodeElement
    ) {

        qrcodeElement.innerHTML =
            "";
    }


    /*
     * Ẩn logout
     */

    if (
        logoutButton
    ) {

        logoutButton.style.display =
            "none";
    }


    /*
     * Input

     */

    employeeCodeInput.value =
        "";


    /*
     * Message

     */

    loginMessage.textContent =
        message;
}


/* =====================================================
   SHOW LOGIN
===================================================== */

function showLogin(
    message = ""
) {

    /*
     * Đây là màn hình login bình thường.
     */

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


    /*
     * Không xóa deviceId.
     */

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

        /*
         * Mất mạng:
         * login ngay.
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
===================================================== */

/*
 * KHÔNG logout khi app xuống background.
 *
 * Khi mở lại:
 *
 * - QR cache vẫn còn.
 * - Firebase listener tiếp tục kiểm tra.
 */

document.addEventListener(
    "visibilitychange",
    () => {

        if (
            document.visibilityState ===
            "visible"
        ) {

            /*
             * Nếu mất mạng
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
             * Nếu employeeId vẫn còn
             * nhưng app chưa hiển thị
             */

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

/*
 * Safari/iPhone có thể khôi phục trang
 * từ bfcache.
 *
 * Không logout.
 *
 * Hiện cache ngay.
 */

window.addEventListener(
    "pageshow",
    () => {

        /*
         * Lấy lại employeeId
         */

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
         * Hiện QR từ cache NGAY.
         */

        showCachedAppImmediately();


        /*
         * Firebase kiểm tra phía sau.
         */

        verifyCurrentSession();
    }
);


/* =====================================================
   BOOT
===================================================== */

async function start() {

    /*
     * Lấy employeeId mới nhất.
     */

    employeeId =
        localStorage.getItem(
            EMPLOYEE_KEY
        );


    /*
     * OFFLINE
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
     * CHƯA ĐĂNG NHẬP
     */

    if (
        !employeeId
    ) {

        showLogin();

        return;
    }


    /*
     * =================================================
     * QUAN TRỌNG:
     *
     * Hiện QR từ cache NGAY.
     * =================================================
     */

    const cacheShown =
        showCachedAppImmediately();


    /*
     * Nếu chưa có cache:
     * xác minh Firebase trước.
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


    /*
     * =================================================
     * ĐÃ CÓ CACHE
     *
     * QR đã hiện.
     *
     * Firebase kiểm tra phía sau.
     * =================================================
     */

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
