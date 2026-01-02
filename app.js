// 1. إعدادات Firebase 
const firebaseConfig = {
    apiKey: "AIzaSyBu_MfB_JXvzBFaKY-Yxze1JotejU--4as",
    authDomain: "worktrackerapp-a32af.firebaseapp.com",
    projectId: "worktrackerapp-a32af",
    storageBucket: "worktrackerapp-a32af.firebasestorage.app",
    messagingSenderId: "246595598451",
    appId: "1:246595598451:web:c6842f1618dffe765a5206"
};

// --- محرك الدارك مود ---
const themeToggle = document.getElementById('theme-toggle');

themeToggle.addEventListener('click', () => {
    // تبديل الكلاس في الـ body
    document.body.classList.toggle('dark-mode');
    
    // تغيير الأيقونة
    const isDark = document.body.classList.contains('dark-mode');
    themeToggle.innerHTML = isDark ? '<i class="fas fa-sun"></i>' : '<i class="fas fa-moon"></i>';
    
    // حفظ الاختيار عشان لما تعمل ريفريش ميرجعش فاتح تاني
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
});

// التأكد من الوضع المختار عند تحميل الصفحة
if (localStorage.getItem('theme') === 'dark') {
    document.body.classList.add('dark-mode');
    themeToggle.innerHTML = '<i class="fas fa-sun"></i>';
}
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// متغيرات الحالة
let accountsData = {};
let userRates = {};
const dateType = document.getElementById('date-type');
const dynamicDateContainer = document.getElementById('dynamic-date-container');
const tableBody = document.getElementById('table-body');
const tableHeadRow = document.getElementById('table-head-row');

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

// --- إدارة التواريخ الديناميكية ---
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
    }
    else if (val === 'range') {
        html = '<label>من</label><input type="date" id="date-start"><label>إلى</label><input type="date" id="date-end">';
    } else { dynamicDateContainer.classList.add('hidden'); }
    dynamicDateContainer.innerHTML = html;
});

// --- جلب البيانات الأساسية عند التشغيل ---
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

// --- المحرك الرئيسي لجلب البيانات وتصفيتها ---
document.getElementById('apply-filters-btn').addEventListener('click', async () => {
    showLoader(true);
    let query = db.collection('workRecords');
    
    const accFilter = document.getElementById('account-filter').value;
    const userFilter = document.getElementById('user-filter').value;
    if(accFilter !== 'all') query = query.where('accountId', '==', accFilter);
    if(userFilter !== 'all') query = query.where('userName', '==', userFilter);

    // حصر التاريخ بدقة
    const mode = dateType.value;
    if (mode === 'month') {
        const monthVal = document.getElementById('month-val').value;
        if (monthVal) {
            const start = new Date(monthVal + '-01T00:00:00');
            const end = new Date(start.getFullYear(), start.getMonth() + 1, 0, 23, 59, 59);
            query = query.where('timestamp', '>=', firebase.firestore.Timestamp.fromDate(start))
                         .where('timestamp', '<=', firebase.firestore.Timestamp.fromDate(end));
        }
    } else if (mode === 'day') {
        const dayVal = document.getElementById('date-val').value;
        if (dayVal) {
            const start = new Date(dayVal + 'T00:00:00');
            const end = new Date(dayVal + 'T23:59:59');
            query = query.where('timestamp', '>=', firebase.firestore.Timestamp.fromDate(start))
                         .where('timestamp', '<=', firebase.firestore.Timestamp.fromDate(end));
        }
    }

    try {
        const snapshot = await query.orderBy('timestamp', 'desc').get();
        let records = [];
        snapshot.forEach(doc => records.push(doc.data()));
        processAndRender(records, accFilter, userFilter);
    } catch (error) {
        console.error("Index required or Query Error: ", error);
        alert("تأكد من إنشاء المؤشرات (Indexes) في Firebase إذا طلب منك ذلك في الـ Console.");
        showLoader(false);
    }
});

function processAndRender(records, accFilter, userFilter) {
    let summary = {};
    let totalTimeAll = 0;
    let totalMoneyAll = 0;

    let groupMode = 'date';
    let headName = 'التاريخ';
    if (userFilter !== 'all' && accFilter === 'all') { groupMode = 'accountId'; headName = 'الحسابات'; }
    else if (accFilter !== 'all' && userFilter === 'all') { groupMode = 'userName'; headName = 'الموظفين'; }

    records.forEach(rec => {
        let key = (groupMode === 'accountId') ? (accountsData[rec.accountId]?.name || 'غير معروف') : 
                  (groupMode === 'userName' ? rec.userName : new Date(rec.timestamp.seconds * 1000).toLocaleDateString('ar-EG'));
        
        if(!summary[key]) summary[key] = { time: 0, money: 0 };

        const customRate = userRates[`${rec.userId}_${rec.accountId}`];
        const finalRate = customRate || accountsData[rec.accountId]?.defaultPricePerHour || 0;
        const recordMoney = (rec.totalTime / 60) * finalRate;

        summary[key].time += rec.totalTime;
        summary[key].money += recordMoney;
        totalTimeAll += rec.totalTime;
        totalMoneyAll += recordMoney;
    });

    renderTable(summary, headName, totalTimeAll, totalMoneyAll);
}

function renderTable(summary, headName, totalT, totalM) {
    tableHeadRow.innerHTML = `<th>${headName}</th><th>إجمالي الوقت</th><th>الرواتب (مقربة)</th>`;
    tableBody.innerHTML = '';

    Object.keys(summary).forEach(key => {
        const rowMoney = roundToTen(summary[key].money);
        tableBody.innerHTML += `<tr>
            <td>${key}</td>
            <td>${formatTime(summary[key].time)}</td>
            <td>${rowMoney.toLocaleString()} ج.م</td>
        </tr>`;
    });

    const finalTotalMoney = roundToTen(totalM);
    document.getElementById('footer-total-time').innerText = formatTime(totalT);
    document.getElementById('footer-total-money').innerText = `${finalTotalMoney.toLocaleString()} ج.م`;
    
    document.getElementById('stat-total-time').innerText = formatTime(totalT);
    document.getElementById('stat-total-money').innerText = `${finalTotalMoney.toLocaleString()} ج.م`;

    document.getElementById('results-section').classList.remove('hidden');
    document.getElementById('stats-container').classList.remove('hidden');
    showLoader(false);
    gsap.from("#reports-table tr", {opacity: 0, y: 10, stagger: 0.05});
}

function showLoader(show) { document.getElementById('loader').classList.toggle('hidden', !show); }
init();

