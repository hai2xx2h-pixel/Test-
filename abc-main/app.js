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
} from
    "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";


/* =====================================================
   DOM
===================================================== */

const loginScreen =
    document.getElementById(
        "loginScreen"
    );


const appScreen =
    document.getElementById(
        "appScreen"
    );


const employeeCodeInput =
    document.getElementById(
        "employeeCodeInput"
    );


const loginButton =
    document.getElementById(
        "loginButton"
    );


const loginMessage =
    document.getElementById(
        "loginMessage"
    );


const employeeHeader =
    document.getElementById(
        "employeeHeader"
    );


const cardHeader =
    document.getElementById(
        "cardHeader"
    );


const headerText =
    document.getElementById(
        "headerText"
    );


const currentTime =
    document.getElementById(
        "currentTime"
    );


const statusTimer =
    document.getElementById(
        "statusTimer"
    );


const logoutButton =
    document.getElementById(
        "logoutButton"
    );


/* =====================================================
   SESSION STORAGE
===================================================== */

const EMPLOYEE_KEY =
    "thor_employee_id";


const SESSION_KEY =
    "thor_session_id";


let employeeId =
    localStorage.getItem(
        EMPLOYEE_KEY
    );


let sessionId =
    localStorage.getItem(
        SESSION_KEY
    );


let unsubscribeUser =
    null;


let clockInterval =
    null;


let timerStart =
    null;


/* =====================================================
   UTILITY
===================================================== */

function pad(number) {

    return String(number)
        .padStart(2, "0");
}


function createSessionId() {

    if (
        crypto &&
        crypto.randomUUID
    ) {

        return crypto.randomUUID();

    }


    return (
        Date.now().toString(36) +
        Math.random()
            .toString(36)
            .substring(2)
    );
}


function normalizeDate(value) {

    if (!value) {
        return null;
    }


    if (
        typeof value.toDate ===
        "function"
    ) {

        return value.toDate();
    }


    const result =
        new Date(value);


    if (
        Number.isNaN(
            result.getTime()
        )
    ) {

        return null;
    }


    return result;
}


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
   LOGIN
===================================================== */

async function login() {

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


    loginButton.disabled =
        true;


    showLoginMessage(
        "正在验证..."
    );


    try {

        await ensureFirebaseLogin();


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


        const user =
            snapshot.data();


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


        /*
         * MỖI MÃ CHỈ 1 THIẾT BỊ
         *
         * Nếu activeSession đã tồn tại
         * và không phải session hiện tại
         * thì từ chối thiết bị mới.
         */

        const newSession =
            createSessionId();


        await runTransaction(
            db,
            async transaction => {

                const fresh =
                    await transaction.get(
                        userRef
                    );


                if (
                    !fresh.exists()
                ) {

                    throw new Error(
                        "Nhân viên không tồn tại."
                    );
                }


                const freshUser =
                    fresh.data();


                if (
                    freshUser.active !== true
                ) {

                    throw new Error(
                        "Tài khoản đã bị khóa."
                    );
                }


                const currentSession =
                    freshUser.activeSession ||
                    null;


                if (
                    currentSession &&
                    currentSession !== sessionId
                ) {

                    throw new Error(
                        "Mã nhân viên này đang được sử dụng trên thiết bị khác."
                    );
                }


                transaction.update(
                    userRef,
                    {

                        activeSession:
                            newSession,

                        lastLogin:
                            serverTimestamp()

                    }
                );

            }
        );


        employeeId =
            code;


        sessionId =
            newSession;


        localStorage.setItem(
            EMPLOYEE_KEY,
            employeeId
        );


        localStorage.setItem(
            SESSION_KEY,
            sessionId
        );


        loginMessage.textContent =
            "";


        openApp();


    } catch (error) {

        console.error(error);

        showLoginMessage(
            error.message ||
            "Đăng nhập thất bại."
        );

    } finally {

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
}


/* =====================================================
   LOAD USER REALTIME
===================================================== */

async function loadUser() {

    if (
        !employeeId ||
        !sessionId
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


    if (
        unsubscribeUser
    ) {

        unsubscribeUser();
    }


    unsubscribeUser =
        onSnapshot(
            userRef,
            snapshot => {

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
                 * KIỂM TRA SESSION
                 */

                if (
                    user.activeSession !==
                    sessionId
                ) {

                    forceLogout(
                        "Phiên đăng nhập đã bị thu hồi hoặc mã đã được sử dụng trên thiết bị khác."
                    );

                    return;
                }


                /*
                 * KIỂM TRA ACTIVE
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
                 * KIỂM TRA HẠN
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

                    forceLogout(
                        "Tài khoản chưa đến thời gian sử dụng."
                    );

                    return;
                }


                if (
                    end &&
                    now > end
                ) {

                    forceLogout(
                        "Tài khoản đã hết hạn."
                    );

                    return;
                }


                renderUser(
                    user
                );

            },

            error => {

                console.error(
                    "Firestore:",
                    error
                );

            }
        );
}


/* =====================================================
   RENDER USER
===================================================== */

function renderUser(user) {

    employeeHeader.textContent =
        `${user.employeeId || employeeId}` +
        `(${user.name || ""})`;


    /*
     * MÀU
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


    if (
        !timerStart
    ) {

        timerStart =
            new Date();


        /*
         * Trường hợp user cũ chưa có
         * timerStart.
         */

        updateDoc(
            doc(
                db,
                "users",
                employeeId
            ),
            {

                timerStart:
                    timerStart

            }
        ).catch(
            console.error
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
        !sessionId
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
                 * Không cho phiên cũ
                 * đổi trạng thái.
                 */

                if (
                    user.activeSession !==
                    sessionId
                ) {

                    throw new Error(
                        "Phiên đã hết hiệu lực."
                    );
                }


                const newGreen =
                    user.color !==
                    "green";


                /*
                 * QUAN TRỌNG:
                 *
                 * Mỗi lần vàng ↔ xanh
                 * timerStart được reset.
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

        console.error(error);

        alert(
            error.message
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
            `${now.getMonth() + 1}-` +
            `${now.getDate()} ` +
            `${pad(now.getHours())}:` +
            `${pad(now.getMinutes())}:` +
            `${pad(now.getSeconds())}`;


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
   QR
   GIỮ NGUYÊN CƠ CHẾ CỦA FILE GỐC
===================================================== */

window.generateQRCode =
    generateQRCode;


function generateQRCode(event) {

    if (
        event &&
        event.currentTarget
    ) {

        event.currentTarget.blur();
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


    /*
     * QR GIỮ NGUYÊN CẤU TRÚC.
     *
     * employeeId/name lấy từ user
     * thay vì cố định V25111639.
     */

    let employeeName =
        "";


    const userRef =
        employeeId
            ? doc(
                db,
                "users",
                employeeId
            )
            : null;


    if (!userRef) {

        return;
    }


    getDoc(userRef)
        .then(snapshot => {

            if (
                !snapshot.exists()
            ) {

                return;
            }


            const user =
                snapshot.data();


            employeeName =
                user.name || "";


            const uniqueToken =
                Math.random()
                    .toString(36)
                    .substring(2) +
                Date.now()
                    .toString(36);


            const accessData =
                `https://YOUR-AUTHORIZED-DOMAIN/access` +
                `?id=${encodeURIComponent(employeeId)}` +
                `&name=${encodeURIComponent(employeeName)}` +
                `&time=${encodeURIComponent(formattedTime)}` +
                `&token=${encodeURIComponent(uniqueToken)}`;


            const qrcodeElement =
                document.getElementById(
                    "qrcode"
                );


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

        })
        .catch(
            console.error
        );
}


/* =====================================================
   HOLD 5 SECONDS
===================================================== */

let pressTimer =
    null;


const HOLD_DURATION =
    5000;


function startPress(event) {

    /*
     * Không kích hoạt khi chạm
     * vào card/QR.
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

        /*
         * Chỉ xóa session nếu session hiện tại
         * vẫn là session của thiết bị này.
         */

        try {

            if (
                employeeId &&
                sessionId
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


                    if (
                        user.activeSession ===
                        sessionId
                    ) {

                        await updateDoc(
                            userRef,
                            {

                                activeSession:
                                    null

                            }
                        );

                    }
                }
            }

        } catch (error) {

            console.error(
                error
            );
        }


        showLogin();
    }
);


/* =====================================================
   FORCE LOGOUT
===================================================== */

function forceLogout(
    message
) {

    alert(
        message
    );


    showLogin();
}


/* =====================================================
   SHOW LOGIN
===================================================== */

function showLogin() {

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


    employeeId =
        null;


    sessionId =
        null;


    timerStart =
        null;


    localStorage.removeItem(
        EMPLOYEE_KEY
    );


    localStorage.removeItem(
        SESSION_KEY
    );


    appScreen.classList.add(
        "hidden"
    );


    loginScreen.classList.remove(
        "hidden"
    );


    employeeCodeInput.value =
        "";


    loginMessage.textContent =
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
     * Nếu đã có session cũ,
     * kiểm tra lại Firebase.
     */

    if (
        employeeId &&
        sessionId
    ) {

        try {

            await ensureFirebaseLogin();

            await loadUser();

            loginScreen.classList.add(
                "hidden"
            );

            appScreen.classList.remove(
                "hidden"
            );

            startClock();

            return;

        } catch (error) {

            console.error(
                error
            );

            showLogin();

        }
    }
}


start();
