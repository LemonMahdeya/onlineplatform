/* ================================
   SETTINGS
================================ */

const ORDERS_PAGE = "https://lemon.rsof-dev.com/my-orders";
const CHECK_INTERVAL = 4000;
const BUTTON_DELAY = 4000; // تأخير ظهور أزرار الواتساب أول مرة

/* ================================
   GLOBAL STATE
================================ */

let lastActivity = Date.now();
let buttonsInitialized = false;
let lastOrderState = null;

/* ================================
   ACTIVITY TRACK & IDLE REFRESH
================================ */

function resetIdle() {
    lastActivity = Date.now();
}

document.addEventListener("click", resetIdle);
document.addEventListener("keypress", resetIdle);

function checkIdle() {
    const idleTime = (Date.now() - lastActivity) / 1000;
    if (idleTime > 180) {
        console.log("Auto refresh بسبب الخمول");
        location.reload(true);
    }
}

/* ================================
   LOGOUT DETECTOR & AUTO LOGIN
================================ */

function detectLogout() {
    const loginBtn = document.querySelector("button.btn.btn-primary");
    const usernameInput = document.querySelector("input[name='email']");
    const passwordInput = document.querySelector("input[name='password']");

    if (loginBtn && loginBtn.innerText.includes("Sign in")) {
        console.log("Login page detected");
        const savedUser = localStorage.getItem("auto_user");
        const savedPass = localStorage.getItem("auto_pass");

        if (savedUser && savedPass && usernameInput && passwordInput) {
            usernameInput.value = "";
            passwordInput.value = "";
            usernameInput.dispatchEvent(new Event('input', { bubbles: true }));
            passwordInput.dispatchEvent(new Event('input', { bubbles: true }));

            usernameInput.value = savedUser;
            passwordInput.value = savedPass;
            usernameInput.dispatchEvent(new Event('input', { bubbles: true }));
            passwordInput.dispatchEvent(new Event('input', { bubbles: true }));

            console.log("Auto filling login data...");
            sessionStorage.setItem("autoLogin", "1");

            setTimeout(() => {
                loginBtn.click();
            }, 1500);
        }
    } else if (sessionStorage.getItem("autoLogin") === "1") {
        console.log("Redirecting to orders page...");
        sessionStorage.removeItem("autoLogin");
        window.location.href = ORDERS_PAGE;
    }
}

/* =========================
   ORDER STATUS CONTROLLER
========================= */

function sendCommand(cmd) {
    fetch(`http://localhost:17321/${cmd}`)
        .then(() => console.log("Command sent:", cmd))
        .catch(() => console.log("Local server not reachable"));
}

function checkAssigned() {
    const rows = document.querySelectorAll("table tbody tr");
    let foundAssigned = false;

    rows.forEach(row => {
        const rowText = row.innerText.toLowerCase();

        if (rowText.includes("assigned to pharmacy")) {
            foundAssigned = true;

            if (!row.classList.contains("assigned-alert")) {
                row.classList.add("assigned-alert");
                row.style.background = "#fff3cd";
                row.style.fontWeight = "bold";
                console.log("Assigned Order Detected");
            }
        }
    });

    if (foundAssigned) {
        if (lastOrderState !== "order") {
            sendCommand("order");
            lastOrderState = "order";
        }
    } else {
        if (lastOrderState !== "terminate") {
            sendCommand("terminate");
            lastOrderState = "terminate";
        }
    }
}

/* ================================
   ADD WHATSAPP & MEMO BUTTONS
================================ */

function addButtons() {
    const rows = document.querySelectorAll("table tbody tr");

    rows.forEach(row => {
        const cells = row.querySelectorAll("td, th");
        if (cells.length < 5) return;

        const id = cells[0]?.innerText.trim();
        const approval = cells[1]?.innerText.trim();
        const memberName = cells[2]?.innerText.trim();
        const mobileCell = cells[3];
        const pharmacyCell = cells[4];

        if (!mobileCell || mobileCell.querySelector(".wa-btn")) return;

        const mobile = mobileCell.innerText.trim().replace("+", "");
        if (!mobile) return;

        const message = `السلام عليكم و رحمة الله
حياكم الله أ/ ${memberName}
  نرحب بكم في *صيدليات ليمون*
 نفيدكم بأن طلبكم رقم ${approval} جارِ العمل عليه حالياً و تحضيره بعناية، و سنتواصل معكم في حال وجود أي استفسارات أو تحديثات على حالة الطلب. 
شكراً لثقتكم بصيدلية ليمون و نسعد بخدمتكم دائماً`;
        const encoded = encodeURIComponent(message);

        // Hello Button
        const helloBtn = document.createElement("span");
        helloBtn.innerText = " 👋";
        helloBtn.className = "wa-btn";
        helloBtn.style.cursor = "pointer";
        helloBtn.onclick = () => window.open(`https://wa.me/${mobile}?text=${encoded}`, "_blank");

        // Chat Button
        const chatBtn = document.createElement("span");
        chatBtn.innerText = " 💬";
        chatBtn.className = "wa-btn";
        chatBtn.style.cursor = "pointer";
        chatBtn.onclick = () => window.open(`https://wa.me/${mobile}`, "_blank");

        // Print Button
        const printBtn = document.createElement("span");
        printBtn.innerText = " 🖨️";
        printBtn.className = "wa-btn";
        printBtn.style.cursor = "pointer";
        printBtn.onclick = () => {
            const w = window.open("", "", "width=300,height=400");
            w.document.write(`
                <html>
                <head><style>body{font-family:Arial;width:80mm;padding:10px;}.row{margin:8px 0;font-size:20px;font-weight:bold;}@page{size:80mm auto;margin:0;}</style></head>
                <body>
                    <div class="row">ID: ${id}</div>
                    <div class="row">APPROVAL: ${approval}</div>
                    <div class="row">NAME: ${memberName}</div>
                    <div class="row">MOBILE: ${mobile}</div>
                </body>
                </html>
            `);
            w.document.close();
            w.focus();
            setTimeout(() => { w.print(); w.close(); }, 500);
        };

        mobileCell.appendChild(helloBtn);
        mobileCell.appendChild(chatBtn);
        mobileCell.appendChild(printBtn);

        // Memo System
        if (pharmacyCell && !pharmacyCell.classList.contains("memo-ready")) {
            pharmacyCell.classList.add("memo-ready");
            pharmacyCell.style.fontWeight = "bold";
            pharmacyCell.style.cursor = "pointer";

            const key = "memo_" + approval;
            const memo = localStorage.getItem(key);

            if (memo) {
                const pin = document.createElement("span");
                pin.innerText = " 📌";
                pharmacyCell.appendChild(pin);
                pharmacyCell.title = memo;
            }

            pharmacyCell.onclick = () => {
                const oldMemo = localStorage.getItem(key) || "";
                const overlay = document.createElement("div");
                Object.assign(overlay.style, {
                    position: "fixed", top: "0", left: "0", width: "100%", height: "100%",
                    background: "rgba(0,0,0,0.3)", display: "flex", alignItems: "center",
                    justifyContent: "center", zIndex: "9999"
                });

                const box = document.createElement("div");
                Object.assign(box.style, {
                    background: "white", padding: "15px", borderRadius: "8px",
                    width: "320px", boxShadow: "0 0 10px rgba(0,0,0,0.3)"
                });

                const textarea = document.createElement("textarea");
                textarea.value = oldMemo;
                textarea.style.width = "100%";
                textarea.style.height = "140px";

                const save = document.createElement("button");
                save.innerText = "Save";
                save.onclick = () => {
                    const val = textarea.value.trim();
                    if (val) localStorage.setItem(key, val);
                    else localStorage.removeItem(key);
                    location.reload();
                };

                const cancel = document.createElement("button");
                cancel.innerText = "Cancel";
                cancel.style.marginLeft = "10px";
                cancel.onclick = () => document.body.removeChild(overlay);

                box.appendChild(textarea);
                box.appendChild(document.createElement("br"));
                box.appendChild(save);
                box.appendChild(cancel);
                overlay.appendChild(box);
                document.body.appendChild(overlay);
            };
        }
    });
}

/* ================================
   INITIALIZATION & MAIN LOOP
================================ */

// تأخير تشغيل الأزرار لأول مرة لضمان تحميل الصفحة
setTimeout(() => {
    addButtons();
    buttonsInitialized = true;
}, BUTTON_DELAY);

// التكرار الدوري للفحوصات
setInterval(() => {
    detectLogout();
    checkIdle();
    checkAssigned();
    if (buttonsInitialized) {
        addButtons();
    }
}, CHECK_INTERVAL);
