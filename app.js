// 1. إعدادات Firebase الخاصة بك
const firebaseConfig = {
    apiKey: "AIzaSyBu_MfB_JXvzBFaKY-Yxze1JotejU--4as",
    authDomain: "worktrackerapp-a32af.firebaseapp.com",
    projectId: "worktrackerapp-a32af",
    storageBucket: "worktrackerapp-a32af.firebasestorage.app",
    messagingSenderId: "246595598451",
    appId: "1:246595598451:web:c6842f1618dffe765a5206"
};

// تهيئة Firebase
if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// 2. المتغيرات العامة
let accountsData = {};
let userRates = {};
let lastFetchedRecords = []; 
let currentViewMode = 'date'; 
let violations = []; // خزان حالات التخطي الجديد

// --- 3. الدوال المساعدة ---

function showNotice(message) {
    alert(message);
}

const formatTime = (totalMinutes) => {
    if (!totalMinutes || totalMinutes <= 0) return "0س 0د";
    const h = Math.floor(totalMinutes / 60);
    const m = Math.round(totalMinutes % 60);
    return `${h} س ${m} د`;
};

const roundToTen = (amount) => amount.toFixed(2);

function getFlexibleStatusClass(currentMinutes, maxMinutes) {
    if (!maxMinutes || maxMinutes <= 0) return '';
    const percentage = (currentMinutes / maxMinutes) * 100;
    if (percentage >= 90) return 'row-gold';
    if (percentage >= 75) return 'row-silver';
    if (percentage >= 50) return 'row-green';
    if (percentage >= 25) return 'row-orange';
    return 'row-red';
}

function getDynamicFileName() {
    const userF = document.getElementById('user-filter');
    const accF = document.getElementById('account-filter');
    const dateM = document.getElementById('date-type').value;
    let parts = ["تقرير_العمل"];
    if (dateM !== 'all') parts.push(dateM);
    if (userF.value !== 'all') parts.push(userF.value);
    if (accF.value !== 'all') parts.push(accF.options[accF.selectedIndex].text);
    return parts.join('_');
}

// --- 4. منطق رادار التخطي (الجديد والمدمج بعناية) ---

function checkViolations(records) {
    violations = [];
    let dailyAccLog = {}; 

    records.forEach(rec => {
        const dateStr = new Date(rec.timestamp.seconds * 1000).toLocaleDateString('ar-EG');
        const accName = accountsData[rec.accountId]?.name || 'غير معروف';
        const key = `${dateStr}_${accName}`;

        if (!dailyAccLog[key]) {
            dailyAccLog[key] = { date: dateStr, account: accName, totalMins: 0, users: new Set() };
        }
        dailyAccLog[key].totalMins += rec.totalTime;
        dailyAccLog[key].users.add(rec.userName);
    });

    for (let key in dailyAccLog) {
        if (dailyAccLog[key].totalMins > 480) { // تخطي 8 ساعات
            violations.push(dailyAccLog[key]);
        }
    }
    updateViolationUI();
}

function updateViolationUI() {
    const btn = document.getElementById('violations-btn');
    const badge = document.getElementById('violation-badge');
    if (!btn || !badge) return;

    if (violations.length > 0) {
        btn.classList.add('btn-danger');
        btn.classList.remove('btn-safe');
        badge.innerText = violations.length;
        badge.classList.remove('hidden');
    } else {
        btn.classList.add('btn-safe');
        btn.classList.remove('btn-danger');
        badge.classList.add('hidden');
    }
}

function showViolationDetails() {
    let html = `
        <table class="violation-table" style="width:100%; border-collapse: collapse; margin-top:15px;">
            <thead>
                <tr style="border-bottom: 2px solid #e74c3c; text-align: right;">
                    <th style="padding:10px;">التاريخ</th>
                    <th style="padding:10px;">الحساب</th>
                    <th style="padding:10px;">الوقت الكلي</th>
                    <th style="padding:10px;">الموظفين</th>
                </tr>
            </thead>
            <tbody>`;
    
    violations.forEach(v => {
        html += `
            <tr style="border-bottom: 1px solid #444;">
                <td style="padding:10px;">${v.date}</td>
                <td style="padding:10px;">${v.account}</td>
                <td style="padding:10px; color:#e74c3c; font-weight:bold;">${(v.totalMins / 60).toFixed(1)} ساعة</td>
                <td style="padding:10px;">${Array.from(v.users).join(' - ')}</td>
            </tr>`;
    });

    html += `</tbody></table>`;
    if(violations.length === 0) html = "<p style='text-align:center; padding:20px;'>لا توجد تجاوزات للحد المسموح (8 ساعات) في هذه الفترة ✅</p>";
    
    document.getElementById('violation-list').innerHTML = html;
    document.getElementById('violation-modal').classList.remove('hidden');
}

// --- 5. المحرك الرئيسي (Window Onload) ---

window.onload = async () => {
    const themeToggle = document.getElementById('theme-toggle');
    const dateType = document.getElementById('date-type');
    const dynamicDateContainer = document.getElementById('dynamic-date-container');
    const viewSwitch = document.getElementById('view-switch-container');
    const btnMonths = document.getElementById('view-months');

    // تفعيل أزرار النافذة المنبثقة
    const vBtn = document.getElementById('violations-btn');
    if(vBtn) vBtn.onclick = showViolationDetails;
    
    const closeBtn = document.querySelector('.close-modal');
    if(closeBtn) closeBtn.onclick = () => document.getElementById('violation-modal').classList.add('hidden');

    document.querySelectorAll('.switch-button button').forEach(btn => {
        btn.onclick = function() {
            document.querySelectorAll('.switch-button button').forEach(b => b.classList.remove('active-switch'));
            this.classList.add('active-switch');
            if(this.id === 'view-days') currentViewMode = 'date';
            else if(this.id === 'view-months') currentViewMode = 'month';
            else currentViewMode = 'userName';
            processAndRender(lastFetchedRecords);
        };
    });

    const toggleTheme = (isDark) => {
        document.body.classList.toggle('dark-mode', isDark);
        themeToggle.innerHTML = isDark ? '<i class="fas fa-sun"></i>' : '<i class="fas fa-moon"></i>';
    };
    themeToggle.onclick = () => {
        const isDark = !document.body.classList.contains('dark-mode');
        toggleTheme(isDark);
        localStorage.setItem('theme', isDark ? 'dark' : 'light');
    };
    if (localStorage.getItem('theme') === 'dark') toggleTheme(true);

    try {
        const [accSnap, rateSnap] = await Promise.all([
            db.collection('accounts').get(),
            db.collection('userAccountRates').get()
        ]);
        accSnap.forEach(doc => {
            accountsData[doc.id] = doc.data();
            document.getElementById('account-filter').innerHTML += `<option value="${doc.id}">${doc.data().name}</option>`;
        });
        rateSnap.forEach(doc => {
            const d = doc.data();
            userRates[`${d.userId}_${d.accountId}`] = d.customPricePerHour;
        });
        const userSnap = await db.collection('users').where('role', '==', 'user').get();
        userSnap.forEach(doc => {
            document.getElementById('user-filter').innerHTML += `<option value="${doc.data().name}">${doc.data().name}</option>`;
        });
    } catch (err) {
        showNotice("حدث خطأ في الاتصال بقاعدة البيانات. تأكد من جودة الإنترنت.");
    }

    dateType.onchange = () => {
        const val = dateType.value;
        dynamicDateContainer.classList.remove('hidden');
        if (val === 'day') dynamicDateContainer.innerHTML = '<label>اليوم</label><input type="date" id="date-val">';
        else if (val === 'month') dynamicDateContainer.innerHTML = '<label>الشهر</label><input type="month" id="month-val">';
        else if (val === 'year') {
            let opts = ''; for(let i=2024; i<=2026; i++) opts += `<option value="${i}">${i}</option>`;
            dynamicDateContainer.innerHTML = `<label>السنة</label><select id="year-val">${opts}</select>`;
        } else if (val === 'range') dynamicDateContainer.innerHTML = '<label>من</label><input type="date" id="date-start"><label>إلى</label><input type="date" id="date-end">';
        else dynamicDateContainer.classList.add('hidden');
    };

    document.getElementById('apply-filters-btn').onclick = async () => {
        const mode = dateType.value;
        let start, end;

        if (mode === 'range') {
            const s = document.getElementById('date-start')?.value;
            const e = document.getElementById('date-end')?.value;
            if (!s || !e) return showNotice("يرجى تحديد تاريخ البداية والنهاية أولاً.");
            start = new Date(s + 'T00:00:00'); end = new Date(e + 'T23:59:59');
            if (start > end) return showNotice("خطأ: تاريخ البداية لا يمكن أن يكون بعد تاريخ النهاية!");
        }

        document.getElementById('loader').classList.remove('hidden');
        let query = db.collection('workRecords');
        const accF = document.getElementById('account-filter').value;
        const userF = document.getElementById('user-filter').value;

        if(accF !== 'all') query = query.where('accountId', '==', accF);
        if(userF !== 'all') query = query.where('userName', '==', userF);

        if (mode === 'year' || mode === 'range') btnMonths.classList.remove('hidden');
        else { btnMonths.classList.add('hidden'); if(currentViewMode === 'month') currentViewMode = 'date'; }

        if (accF === 'all' && userF === 'all') viewSwitch.classList.remove('hidden');
        else viewSwitch.classList.add('hidden');

        if (mode === 'day') {
            const v = document.getElementById('date-val')?.value;
            if(v){ start = new Date(v+'T00:00:00'); end = new Date(v+'T23:59:59'); }
        } else if (mode === 'month') {
            const v = document.getElementById('month-val')?.value;
            if(v){ const p = v.split('-'); start = new Date(p[0], p[1]-1, 1); end = new Date(p[0], p[1], 0, 23, 59, 59); }
        } else if (mode === 'year') {
            const v = document.getElementById('year-val')?.value;
            if(v){ start = new Date(v, 0, 1); end = new Date(v, 11, 31, 23, 59, 59); }
        }

        if (start && end) {
            query = query.where('timestamp', '>=', firebase.firestore.Timestamp.fromDate(start))
                         .where('timestamp', '<=', firebase.firestore.Timestamp.fromDate(end));
        }

        try {
            const snap = await query.get();
            if (snap.empty) showNotice("لا توجد سجلات تطابق البحث المختار.");
            lastFetchedRecords = [];
            snap.forEach(doc => lastFetchedRecords.push(doc.data()));
            
            // تشغيل الرادار فوراً عند جلب البيانات
            checkViolations(lastFetchedRecords);
            
            processAndRender(lastFetchedRecords);
        } catch (err) { showNotice("حدث خطأ أثناء جلب البيانات."); }
        document.getElementById('loader').classList.add('hidden');
    };

    document.getElementById('table-search').addEventListener('input', function() {
        const term = this.value.toLowerCase();
        document.querySelectorAll('#table-body tr').forEach(row => {
            const cells = Array.from(row.cells);
            const match = cells.some(cell => (cell.getAttribute('data-orig') || cell.innerText).toLowerCase().includes(term));
            row.style.display = match ? "" : "none";
            if (match && term) {
                cells.forEach(cell => {
                    const txt = cell.getAttribute('data-orig') || cell.innerText;
                    if(!cell.getAttribute('data-orig')) cell.setAttribute('data-orig', txt);
                    cell.innerHTML = txt.replace(new RegExp(`(${term})`, 'gi'), '<span class="highlight">$1</span>');
                });
            } else {
                cells.forEach(cell => { if(cell.getAttribute('data-orig')) cell.innerHTML = cell.getAttribute('data-orig'); });
            }
        });
    });

    document.getElementById('export-excel').onclick = () => {
        if (!lastFetchedRecords.length) return showNotice("لا توجد بيانات لتصديرها.");
        const wb = XLSX.utils.table_to_book(document.getElementById('reports-table'));
        XLSX.writeFile(wb, `${getDynamicFileName()}.xlsx`);
    };

    document.getElementById('export-pdf').onclick = () => {
        if (!lastFetchedRecords.length) return showNotice("لا توجد بيانات للطباعة.");
        const oldTitle = document.title;
        document.title = getDynamicFileName();
        window.print();
        setTimeout(() => document.title = oldTitle, 1000);
    };
};

// --- 6. معالجة ورسم الجدول ---

function processAndRender(records) {
    const accF = document.getElementById('account-filter').value;
    const userF = document.getElementById('user-filter').value;
    let summary = {}, totalT = 0, totalM = 0;
    
    let groupKey = (accF === 'all' && userF === 'all') ? currentViewMode : 
                   (userF !== 'all' && accF === 'all' ? 'accountId' : (accF !== 'all' && userF === 'all' ? 'userName' : 'date'));

    records.forEach(rec => {
        const dateObj = new Date(rec.timestamp.seconds * 1000);
        let key;
        if (groupKey === 'accountId') key = accountsData[rec.accountId]?.name || 'غير معروف';
        else if (groupKey === 'userName') key = rec.userName;
        else if (groupKey === 'month') key = dateObj.toLocaleDateString('ar-EG', {month:'long'});
        else key = dateObj.toLocaleDateString('ar-EG');

        if (!summary[key]) summary[key] = { time: 0, money: 0 };
        const rate = userRates[`${rec.userId}_${rec.accountId}`] || accountsData[rec.accountId]?.defaultPricePerHour || 0;
        summary[key].time += rec.totalTime;
        summary[key].money += (rec.totalTime / 60) * rate;
        totalT += rec.totalTime;
        totalM += (rec.totalTime / 60) * rate;
    });

    renderUI(summary, groupKey, totalT, totalM);
}

function renderUI(summary, groupKey, totalT, totalM) {
    const tableBody = document.getElementById('table-body');
    const maxTime = Math.max(...Object.values(summary).map(s => s.time), 0);
    let html = '', topName = "-", topVal = -1;

    Object.keys(summary).sort().forEach(k => {
        const time = summary[k].time;
        if(time > topVal) { topVal = time; topName = k; }
        const sClass = getFlexibleStatusClass(time, maxTime);
        html += `<tr class="${sClass}">
            <td data-orig="${k}">${k}</td>
            <td data-orig="${formatTime(time)}">${formatTime(time)}</td>
            <td>${roundToTen(summary[k].money).toLocaleString()} $</td>
        </tr>`;
    });
    
    tableBody.innerHTML = html;
    document.getElementById('stat-top-performer').innerText = topName;
    document.getElementById('stat-total-time').innerText = formatTime(totalT);
    document.getElementById('stat-total-money').innerText = `${roundToTen(totalM).toLocaleString()} $`;
    document.getElementById('footer-total-time').innerText = formatTime(totalT);
    document.getElementById('footer-total-money').innerText = `${roundToTen(totalM).toLocaleString()} $`;

    document.getElementById('results-section').classList.remove('hidden');
    document.getElementById('stats-container').classList.remove('hidden');

    gsap.fromTo(".stat-card", { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.4, stagger: 0.1 });
}


