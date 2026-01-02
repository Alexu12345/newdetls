// 1. إعدادات Firebase 
const firebaseConfig = {
    apiKey: "AIzaSyBu_MfB_JXvzBFaKY-Yxze1JotejU--4as",
    authDomain: "worktrackerapp-a32af.firebaseapp.com",
    projectId: "worktrackerapp-a32af",
    storageBucket: "worktrackerapp-a32af.firebasestorage.app",
    messagingSenderId: "246595598451",
    appId: "1:246595598451:web:c6842f1618dffe765a5206"
};

if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const db = firebase.firestore();

// 2. تعريف العناصر من الـ HTML
const themeToggle = document.getElementById('theme-toggle');
const dateType = document.getElementById('date-type');
const dynamicDateContainer = document.getElementById('dynamic-date-container');
const tableBody = document.getElementById('table-body');
const tableHeadRow = document.getElementById('table-head-row');
const applyBtn = document.getElementById('apply-filters-btn');
const exportExcelBtn = document.getElementById('export-excel');
const exportPdfBtn = document.getElementById('export-pdf');

// 3. متغيرات البيانات
let accountsData = {};
let userRates = {};

// --- وظيفة الدارك مود (تم التأكد من الربط) ---
themeToggle.addEventListener('click', () => {
    document.body.classList.toggle('dark-mode');
    const isDark = document.body.classList.contains('dark-mode');
    themeToggle.innerHTML = isDark ? '<i class="fas fa-sun"></i>' : '<i class="fas fa-moon"></i>';
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
});

if (localStorage.getItem('theme') === 'dark') {
    document.body.classList.add('dark-mode');
    themeToggle.innerHTML = '<i class="fas fa-sun"></i>';
}

// --- تنسيق الوقت (ساعة:دقيقة:ثانية) ---
function formatTime(totalMinutes) {
    if (!totalMinutes || totalMinutes <= 0) return "0س 0د 0ث";
    const totalSeconds = Math.floor(totalMinutes * 60);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return `${hours}س ${minutes}د ${seconds}ث`;
}

// --- التقريب لأقرب 10 جنيهات ---
function roundToTen(amount) {
    return Math.round(amount / 10) * 10;
}

// --- إدارة حقول التاريخ ---
dateType.addEventListener('change', () => {
    const val = dateType.value;
    dynamicDateContainer.classList.remove('hidden');
    let html = '';
    if (val === 'day') html = '<label>اختر اليوم</label><input type="date" id="date-val">';
    else if (val === 'month') html = '<label>اختر الشهر</label><input type="month" id="month-val">';
    else if (val === 'year') {
        html = '<label>اختر السنة</label><select id="year-val">';
        for(let i=2024; i<=2026; i++) html += `<option value="${i}">${i}</option>`;
        html += '</select>';
    } else if (val === 'range') {
        html = '<label>من</label><input type="date" id="date-start"><label>إلى</label><input type="date" id="date-end">';
    } else { dynamicDateContainer.classList.add('hidden'); }
    dynamicDateContainer.innerHTML = html;
});

// --- تصدير Excel و PDF ---
exportExcelBtn.addEventListener('click', () => {
    const table = document.getElementById('reports-table');
    const wb = XLSX.utils.table_to_book(table, {sheet: "تقرير"});
    XLSX.writeFile(wb, `Report_${new Date().getTime()}.xlsx`);
});

exportPdfBtn.addEventListener('click', () => {
    window.print(); // أسهل وأدق طريقة للـ PDF حالياً للحفاظ على ستايل الجدول
});

// --- جلب البيانات الأساسية ---
async function init() {
    const accSnap = await db.collection('accounts').get();
    accSnap.forEach(doc => {
        accountsData[doc.id] = doc.data();
        document.getElementById('account-filter').innerHTML += `<option value="${doc.id}">${doc.data().name}</option>`;
    });

    const userSnap = await db.collection('users').where('role', '==', 'user').get();
    userSnap.forEach(doc => {
        document.getElementById('user-filter').innerHTML += `<option value="${doc.data().name}">${doc.data().name}</option>`;
    });

    const rateSnap = await db.collection('userAccountRates').get();
    rateSnap.forEach(doc => {
        const data = doc.data();
        userRates[`${data.userId}_${data.accountId}`] = data.customPricePerHour;
    });
}

// --- جلب البيانات عند الضغط على زر التصفية ---
applyBtn.addEventListener('click', async () => {
    document.getElementById('loader').classList.remove('hidden');
    let query = db.collection('workRecords');
    
    const accFilter = document.getElementById('account-filter').value;
    const userFilter = document.getElementById('user-filter').value;
    if(accFilter !== 'all') query = query.where('accountId', '==', accFilter);
    if(userFilter !== 'all') query = query.where('userName', '==', userFilter);

    // فلتر التاريخ
    const mode = dateType.value;
    if (mode === 'month') {
        const monthVal = document.getElementById('month-val').value;
        if (monthVal) {
            const start = new Date(monthVal + '-01T00:00:00');
            const end = new Date(start.getFullYear(), start.getMonth() + 1, 0, 23, 59, 59);
            query = query.where('timestamp', '>=', firebase.firestore.Timestamp.fromDate(start))
                         .where('timestamp', '<=', firebase.firestore.Timestamp.fromDate(end));
        }
    }

    try {
        const snapshot = await query.get();
        let records = [];
        snapshot.forEach(doc => records.push(doc.data()));
        
        let summary = {};
        let totalT = 0, totalM = 0;
        
        // تحديد وضع التجميع
        let headName = 'التاريخ';
        let groupMode = 'date';
        if (userFilter !== 'all' && accFilter === 'all') { groupMode = 'accountId'; headName = 'الحساب'; }
        else if (accFilter !== 'all' && userFilter === 'all') { groupMode = 'userName'; headName = 'الموظف'; }

        records.forEach(rec => {
            let key = (groupMode === 'accountId') ? (accountsData[rec.accountId]?.name || 'حساب محذوف') : 
                      (groupMode === 'userName' ? rec.userName : new Date(rec.timestamp.seconds * 1000).toLocaleDateString('ar-EG'));
            
            if(!summary[key]) summary[key] = { time: 0, money: 0 };
            
            const rate = userRates[`${rec.userId}_${rec.accountId}`] || accountsData[rec.accountId]?.defaultPricePerHour || 0;
            const money = (rec.totalTime / 60) * rate;

            summary[key].time += rec.totalTime;
            summary[key].money += money;
            totalT += rec.totalTime;
            totalM += money;
        });

        renderTable(summary, headName, totalT, totalM);
    } catch (e) { console.error(e); }
});

function renderTable(summary, headName, totalT, totalM) {
    tableHeadRow.innerHTML = `<th>${headName}</th><th>إجمالي الوقت</th><th>التكلفة (مقربة)</th>`;
    tableBody.innerHTML = '';
    
    Object.keys(summary).forEach(key => {
        tableBody.innerHTML += `<tr>
            <td>${key}</td>
            <td>${formatTime(summary[key].time)}</td>
            <td>${roundToTen(summary[key].money).toLocaleString()} ج.م</td>
        </tr>`;
    });

    document.getElementById('footer-total-time').innerText = formatTime(totalT);
    document.getElementById('footer-total-money').innerText = `${roundToTen(totalM).toLocaleString()} ج.م`;
    document.getElementById('stat-total-time').innerText = formatTime(totalT);
    document.getElementById('stat-total-money').innerText = `${roundToTen(totalM).toLocaleString()} ج.م`;

    document.getElementById('results-section').classList.remove('hidden');
    document.getElementById('stats-container').classList.remove('hidden');
    document.getElementById('loader').classList.add('hidden');
    gsap.from("#reports-table tr", {opacity: 0, x: -20, stagger: 0.05});
}

init();
