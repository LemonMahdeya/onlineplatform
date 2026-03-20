/* ================================
   SETTINGS & GLOBAL STATE
=============================== */
const ORDERS_PAGE = "https://lemon.rsof-dev.com/my-orders";
const CHECK_INTERVAL = 4000;
const SIX_HOURS_MS = 6 * 60 * 60 * 1000;
const BUTTON_DELAY = 4000;

let lastActivity = Date.now();
let lastOrderState = null; // 
let buttonsInitialized = false;

// ة
if (!localStorage.getItem("auto_user") || !localStorage.getItem("auto_pass")) {
    const u = prompt("Enter Pharmacy Email:");
    const p = prompt("Enter Pharmacy Password:");
    if (u && p) {
        localStorage.setItem("auto_user", u);
        localStorage.setItem("auto_pass", p);
    }
}

/* ================================
   UTILITIES & SERVER COMMANDS
================================ */
function formatTimeDiff(diffMs) {
    const diffMins = Math.floor(Math.abs(diffMs) / (1000 * 60));
    const hours = Math.floor(diffMins / 60);
    const mins = diffMins % 60;
    return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
}

function parseLemonDate(updatedText) {
    try {
        const lines = updatedText.split('\n').map(s => s.trim()).filter(s => s);
        if (lines.length < 2) return null;
        const dateObj = new Date(`${lines[0].replace(',', '')} ${lines[1]}`);
        return isNaN(dateObj.getTime()) ? null : dateObj.getTime();
    } catch (e) { return null; }
}

function sendCommand(cmd) {
    if (lastOrderState === cmd) return; 
    console.log(`📡 Sending Command: ${cmd}`);
    fetch(`http://localhost:17321/${cmd}`, { mode: 'no-cors' })
        .then(() => {
            lastOrderState = cmd;
            console.log(`✅ Server accepted: ${cmd}`);
        })
        .catch(() => console.warn("❌ Local server offline"));
}

/* ================================
   TIMER RENDERING
================================ */
function renderTimer(cell, value, isLive) {
    let oldT = cell.querySelector(".order-timer");
    if (oldT) oldT.remove();

    const timerSpan = document.createElement("div");
    timerSpan.className = "order-timer fw-bold mt-1";
    timerSpan.style.cssText = "font-size: 11px; display: block; padding: 2px 5px; border-radius: 4px; background: rgba(255,255,255,0.5); width: fit-content;";

    if (isLive) {
        const timeLeft = SIX_HOURS_MS - (Date.now() - value);
        if (timeLeft > 0) {
            timerSpan.innerText = `⏳ ${formatTimeDiff(timeLeft)} rem`;
            timerSpan.style.color = "#0d6efd";
        } else {
            timerSpan.innerText = `⚠️ ${formatTimeDiff(timeLeft)} late`;
            timerSpan.style.color = "#dc3545";
        }
    } else {
        if (value <= SIX_HOURS_MS) {
            timerSpan.innerText = "✅ In time";
            timerSpan.style.color = "#198754";
        } else {
            timerSpan.innerText = `❌ ${formatTimeDiff(value - SIX_HOURS_MS)} late`;
            timerSpan.style.color = "#dc3545";
        }
    }
    cell.appendChild(timerSpan);
}

/* ================================
   MAIN ENGINE (Orders & Buttons)
================================ */
function processOrders() {
    const rows = document.querySelectorAll("table tbody tr");
    let assignedFound = false;

    rows.forEach(row => {
        const cells = row.querySelectorAll("td, th");
        if (cells.length < 9) return;

        const id = cells[0]?.innerText.trim();
        const approvalId = cells[1]?.innerText.trim();
        const memberName = cells[2]?.innerText.trim();
        const mobileCell = cells[3];
        const pharmacyCell = cells[4];
        const statusCell = cells[6];   
        const updatedCell = cells[8];  
        const statusText = statusCell.innerText.toLowerCase();

        // --- الج ---
        const deliveryTerms = ["delivered", "pickup by customer", "delivered without otp"];
        const isDelivered = deliveryTerms.some(s => statusText.includes(s));
        let startTime = localStorage.getItem(`start_time_${approvalId}`);

        if (statusText.includes("canceled")) {
            localStorage.removeItem(`start_time_${approvalId}`);
            const oldT = statusCell.querySelector(".order-timer");
            if (oldT) oldT.remove();
        } 
        else if (statusText.includes("assigned to pharmacy")) {
            assignedFound = true;
            row.style.backgroundColor = "#fff3cd";
            row.style.fontWeight = "bold";

            if (!startTime) {
                startTime = parseLemonDate(updatedCell.innerText);
                if (startTime) localStorage.setItem(`start_time_${approvalId}`, startTime);
            }
            if (startTime) renderTimer(statusCell, parseInt(startTime), true);
        } 
        else if (isDelivered) {
            if (startTime) {
                const endTime = parseLemonDate(updatedCell.innerText);
                if (endTime) {
                    const duration = endTime - parseInt(startTime);
                    renderTimer(statusCell, duration, false);
                }
            }
        } 
        else if (startTime) {
            renderTimer(statusCell, parseInt(startTime), true);
        }

        // --- الجزء ا ---
        if (buttonsInitialized && mobileCell && !mobileCell.querySelector(".wa-btn")) {
            const mobile = mobileCell.innerText.trim().replace("+", "");
            if (mobile) {
                const message = `السلام عليكم و رحمة الله
                \nحياكم الله أ/ ${memberName}\n 
                نرحب بكم في *صيدليات ليمون*
                \nنفيدكم بأن طلبكم رقم ${approvalId} جارِ العمل عليه حالياً و تحضيره بعناية، و سنتواصل معكم في حال وجود أي استفسارات أو تحديثات على حالة الطلب.\n
                شكراً لثقتكم بصيدلية ليمون و نسعد بخدمتكم دائماً`;
                
                const helloBtn = createBtn(" 👋", () => window.open(`https://wa.me/${mobile}?text=${encodeURIComponent(message)}`, "_blank"));
                const chatBtn = createBtn(" 💬", () => window.open(`https://wa.me/${mobile}`, "_blank"));
                const printBtn = createBtn(" 🖨️", () => printOrder(id, approvalId, memberName, mobile));

                mobileCell.appendChild(helloBtn);
                mobileCell.appendChild(chatBtn);
                mobileCell.appendChild(printBtn);
            }
        }

        // نظام الملاحظات (Memo)
        if (pharmacyCell && !pharmacyCell.classList.contains("memo-ready")) {
            setupMemo(pharmacyCell, approvalId);
        }
    });

    // الفر
    sendCommand(assignedFound ? "order" : "terminate");
}

/* ================================
   UI HELPERS
================================ */
function createBtn(text, onClick) {
    const span = document.createElement("span");
    span.innerText = text;
    span.className = "wa-btn";
    span.style.cursor = "pointer";
    span.onclick = onClick;
    return span;
}

function printOrder(id, approval, name, mobile) {
    const w = window.open("", "", "width=300,height=400");
    w.document.write(`<html><head><style>body{font-family:Arial;width:80mm;padding:10px;}.row{margin:8px 0;font-size:20px;font-weight:bold;}@page{size:80mm auto;margin:0;}</style></head><body><div class="row">ID: ${id}</div><div class="row">APPROVAL: ${approval}</div><div class="row">NAME: ${name}</div><div class="row">MOBILE: ${mobile}</div></body></html>`);
    w.document.close();
    w.focus();
    setTimeout(() => { w.print(); w.close(); }, 500);
}

function setupMemo(cell, approvalId) {
    cell.classList.add("memo-ready");
    cell.style.fontWeight = "bold";
    cell.style.cursor = "pointer";
    const key = "memo_" + approvalId;
    const memo = localStorage.getItem(key);

    if (memo) {
        const pin = document.createElement("span");
        pin.innerText = " 📌";
        cell.appendChild(pin);
        cell.title = memo;
    }

    cell.onclick = () => {
        const val = prompt("Enter Memo:", localStorage.getItem(key) || "");
        if (val !== null) {
            if (val.trim()) localStorage.setItem(key, val);
            else localStorage.removeItem(key);
            location.reload();
        }
    };
}

/* ================================
   AUTO LOGIN & REFRESH LOGIC (FIXED)
================================ */
function setReactInputValue(input, value) {
    const nativeSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value"
    ).set;

    nativeSetter.call(input, value);

    input.dispatchEvent(new Event("input", { bubbles: true }));
}

function handleLoginAndIdle() {
    // 1. Auto Login
    const loginBtn = document.querySelector("button.btn.btn-primary");
    if (loginBtn && loginBtn.innerText.includes("Sign in")) {
        const u = localStorage.getItem("auto_user"),
              p = localStorage.getItem("auto_pass");

        const uIn = document.querySelector("input[name='email']"),
              pIn = document.querySelector("input[name='password']");
        
        if (u && p && uIn && pIn) {
            // Focus علشان نحاكي user حقيقي
            uIn.focus();
            setReactInputValue(uIn, u);

            pIn.focus();
            setReactInputValue(pIn, p);

            // Trigger validation
            uIn.dispatchEvent(new Event('change', { bubbles: true }));
            pIn.dispatchEvent(new Event('change', { bubbles: true }));

            // Bفي
            uIn.blur();
            pIn.blur();

            sessionStorage.setItem("autoLogin", "1");

            // Cشري
            setTimeout(() => {
                loginBtn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
                loginBtn.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
                loginBtn.click();
            }, 1200);
        }
    } 
    else if (sessionStorage.getItem("autoLogin") === "1") {
        sessionStorage.removeItem("autoLogin");
        window.location.href = ORDERS_PAGE;
    }

    // 2. Idle Refresh (3 minutes)
    if ((Date.now() - lastActivity) / 1000 > 180) {
        location.reload();
    }
}

/* ================================
   INIT
================================ */
document.addEventListener("click", () => lastActivity = Date.now());
document.addEventListener("keypress", () => lastActivity = Date.now());

setTimeout(() => { buttonsInitialized = true; }, BUTTON_DELAY);

setInterval(() => {
    processOrders();
    handleLoginAndIdle();
}, CHECK_INTERVAL);
