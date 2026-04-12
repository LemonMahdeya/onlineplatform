/* ================================
   SETTINGS & GLOBAL STATE
=============================== */
const ORDERS_PAGE = "https://lemon.rsof-dev.com/my-orders";
const DETAILS_PAGE_PART = "/medicine-request/details/"; // جزء من رابط صفحة التفاصيل
const CHECK_INTERVAL = 4000;
const SIX_HOURS_MS = 6 * 60 * 60 * 1000;
const BUTTON_DELAY = 4000;

let lastActivity = Date.now();
let lastOrderState = null; 
let buttonsInitialized = false;

// طلب بيانات الدخول
if (!localStorage.getItem("auto_user") || !localStorage.getItem("auto_pass")) {
    const u = prompt("Enter Pharmacy Email:");
    const p = prompt("Enter Pharmacy Password:");
    if (u && p) {
        localStorage.setItem("auto_user", u);
        localStorage.setItem("auto_pass", p);
    }
}

/* ================================
   MAP CAPTURE ENGINE (الجديد)
================================ */
async function captureMapUrl(originalButton) {
    return new Promise((resolve) => {
        const originalOpen = window.open;
        let caughtUrl = null;

        window.open = function(url) {
            if (url && (url.includes('google') || url.includes('maps') || url.includes('googleusercontent'))) {
                caughtUrl = url;
                return null; 
            }
            return originalOpen.apply(this, arguments);
        };

        const clickEvent = new MouseEvent('click', { view: window, bubbles: true, cancelable: true });
        originalButton.dispatchEvent(clickEvent);

        setTimeout(() => {
            window.open = originalOpen;
            resolve(caughtUrl);
        }, 600); 
    });
}

/* ================================
   NEW: DETAILS PAGE LOGIC (حقن زر النسخ في صفحة التفاصيل)
================================ */
function processDetailsPage() {
    if (!window.location.href.includes(DETAILS_PAGE_PART)) return;

    const mapIcon = document.querySelector('.fe-map');
    if (!mapIcon) return;

    const originalButton = mapIcon.closest('button') || mapIcon.closest('a');
    if (!originalButton || document.querySelector(".copy-loc-details-btn")) return;

    const copyBtn = document.createElement('button');
    // غيرنا الاسم ليكون أنسب للوظيفة الجديدة
    copyBtn.className = 'btn btn-info btn-lg mx-2 copy-loc-details-btn'; 
    copyBtn.innerHTML = '📍 Open in Lemon map';
    copyBtn.style.cssText = "font-weight: bold; padding: 10px 20px; margin-bottom: 10px; color: white;";

    copyBtn.onclick = async (e) => {
        e.preventDefault();
        const oldText = copyBtn.innerHTML;
        copyBtn.innerHTML = '⏳ جاري تحويل الإحداثيات...';

        const url = await captureMapUrl(originalButton);
        
        if (url) {
            // استخراج الإحداثيات باستخدام Regex
            // يبحث عن الأرقام التي تحتوي على علامة عشرية (Latitude & Longitude)
            const coordsMatch = url.match(/([0-9]+\.[0-9]+),([0-9]+\.[0-9]+)/);

            if (coordsMatch) {
                const lat = coordsMatch[1];
                const lng = coordsMatch[2];
                
                // بناء الرابط الجديد بالصيغة المطلوبة (باستخدام #)
                const newUrl = `https://lemonmahdeya.github.io/lemonmap/#${lat},${lng}`;
                
                // فتح الرابط في تاب جديد
                window.open(newUrl, "_blank");
                
                copyBtn.innerHTML = '✅ تم الفتح';
            } else {
                copyBtn.innerHTML = '❌ إحداثيات غير صالحة';
            }
        } else {
            copyBtn.innerHTML = '❌ فشل جلب الرابط';
        }
        
        setTimeout(() => copyBtn.innerHTML = oldText, 2500);
    };

    originalButton.parentNode.insertBefore(copyBtn, originalButton.nextSibling);
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
    // التأكد إننا في صفحة الجدول قبل تنفيذ الكود
    if (!window.location.href.includes("/my-orders")) return;

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

        // --- التوقيت ---
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
        else if (isDelivered && startTime) {
            const endTime = parseLemonDate(updatedCell.innerText);
            if (endTime) {
                const duration = endTime - parseInt(startTime);
                renderTimer(statusCell, duration, false);
            }
        } 
        else if (startTime) {
            renderTimer(statusCell, parseInt(startTime), true);
        }

        // --- الأزرار ---
        if (buttonsInitialized && mobileCell && !mobileCell.querySelector(".wa-btn")) {
            const mobile = mobileCell.innerText.trim().replace("+", "");
            if (mobile) {
                const message = `السلام عليكم و رحمة الله و بركاته
\nحياكم الله أ/ ${memberName}\n

نرحب بكم في *صيدليات ليمون*\n
نفيدكم بأن طلبكم رقم ${approvalId} جاري العمل عليه و تحضيره بعناية، و سنتواصل معكم في حال وجود أي استفسارات أو تحديثات على حالة الطلب.

                شكراً لثقتكم بصيدلية ليمون و نسعد بخدمتكم دائماً
`;
                
                const helloBtn = createBtn(" 👋", () => window.open(`https://wa.me/${mobile}?text=${encodeURIComponent(message)}`, "_blank"));
                const chatBtn = createBtn(" 💬", () => window.open(`https://wa.me/${mobile}`, "_blank"));

                mobileCell.appendChild(helloBtn);
                mobileCell.appendChild(chatBtn);
            }
        }

        if (pharmacyCell && !pharmacyCell.classList.contains("memo-ready")) {
            setupMemo(pharmacyCell, approvalId);
        }
    });

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
    if (localStorage.getItem(key)) {
        const pin = document.createElement("span");
        pin.innerText = " 📌";
        cell.appendChild(pin);
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
   AUTO LOGIN & REFRESH LOGIC
================================ */
function setReactInputValue(input, value) {
    const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    nativeSetter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
}

function handleLoginAndIdle() {
    const loginBtn = document.querySelector("button.btn.btn-primary");
    if (loginBtn && loginBtn.innerText.includes("Sign in")) {
        const u = localStorage.getItem("auto_user"), p = localStorage.getItem("auto_pass");
        const uIn = document.querySelector("input[name='email']"), pIn = document.querySelector("input[name='password']");
        if (u && p && uIn && pIn) {
            uIn.focus();
            setReactInputValue(uIn, u);
            pIn.focus();
            setReactInputValue(pIn, p);
            uIn.dispatchEvent(new Event('change', { bubbles: true }));
            pIn.dispatchEvent(new Event('change', { bubbles: true }));
            uIn.blur(); pIn.blur();
            sessionStorage.setItem("autoLogin", "1");
            setTimeout(() => { loginBtn.click(); }, 1200);
        }
    } 
    else if (sessionStorage.getItem("autoLogin") === "1") {
        sessionStorage.removeItem("autoLogin");
        window.location.href = ORDERS_PAGE;
    }
    if ((Date.now() - lastActivity) / 1000 > 180) {
        location.reload();
    }
}

/* ================================
   NEW: AUTO FILTER ROUTINE (كل 15 دقيقة)
================================ */
const FILTER_INTERVAL = 5 * 60 * 1000; // 15 دقيقة
let lastFilterTime = Date.now();
let isFilteringRightNow = false;

async function runAutoFilterRoutine() {
    if (!window.location.href.includes("/my-orders") || isFilteringRightNow) return;
    
    console.log("🔍 Running Scheduled Filter Check...");
    isFilteringRightNow = true;

    const findBtn = (txt) => Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes(txt));
    
    // 1. فتح الفلاتر
    const advBtn = findBtn('Advanced Filters');
    if (advBtn) advBtn.click();

    // 2. انتطار ظهور القائمة المنسدلة
    setTimeout(() => {
        const select = Array.from(document.querySelectorAll('select.form-select')).find(sel => sel.innerHTML.includes('Assigned To Pharmacy'));
        const applyBtn = findBtn('Apply Filters');

        if (select && applyBtn) {
            select.focus();
            select.value = "1"; // قيمة Assigned To Pharmacy
            select.dispatchEvent(new Event('input', { bubbles: true }));
            select.dispatchEvent(new Event('change', { bubbles: true }));

            setTimeout(() => {
                applyBtn.click();

                // 3. فحص النتائج بعد تطبيق الفلتر بـ 3 ثواني
                setTimeout(() => {
                    const rows = document.querySelectorAll("table tbody tr");
                    // هل يوجد صفوف تحتوي على كلمة assigned ؟
                    const foundAssigned = Array.from(rows).some(r => r.innerText.toLowerCase().includes("assigned to pharmacy"));

                    if (foundAssigned) {
                        console.log("✅ Assigned orders found! Keeping filters active.");
                        // لا نفعل شيء، نترك الفلتر شغال للتنبيه
                        isFilteringRightNow = false; 
                    } else {
                        console.log("❌ No assigned orders. Clearing filters...");
                        const clearBtn = findBtn('Clear All Filters');
                        if (clearBtn) clearBtn.click();
                        isFilteringRightNow = false;
                    }
                }, 3000);
            }, 1000);
        } else {
            isFilteringRightNow = false;
        }
    }, 2000);
}

/* ================================
   MODIFIED INIT & INTERVAL
=============================== */
document.addEventListener("click", () => lastActivity = Date.now());
document.addEventListener("keypress", () => lastActivity = Date.now());

setTimeout(() => { buttonsInitialized = true; }, BUTTON_DELAY);

setInterval(() => {
    // الوظائف الأساسية
    processOrders();
    processDetailsPage();
    handleLoginAndIdle();

    // فحص هل حان موعد الفلترة الدورية (كل 15 دقيقة)
    if (Date.now() - lastFilterTime > FILTER_INTERVAL) {
        lastFilterTime = Date.now();
        runAutoFilterRoutine();
    }
}, CHECK_INTERVAL);
