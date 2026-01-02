// 1. إعدادات Firebase 
const firebaseConfig = {
    apiKey: "AIzaSyBu_MfB_JXvzBFaKY-Yxze1JotejU--4as",
    authDomain: "worktrackerapp-a32af.firebaseapp.com",
    projectId: "worktrackerapp-a32af",
    storageBucket: "worktrackerapp-a32af.firebasestorage.app",
    messagingSenderId: "246595598451",
    appId: "1:246595598451:web:c6842f1618dffe765a5206"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// 2. متغيرات الحالة والمتعلقات
let accountsData = {};
let usersData = [];
let userRates = {}; // لتخزين الأسعار الخاصة من مجموعة userAccountRates

// 3. عناصر الواجهة
const dateType = document.getElementById('date-type');
const dynamicDateContainer = document.getElementById('dynamic-date-container');
const themeToggle = document.getElementById('theme-toggle');
const tableBody = document.getElementById('table-body');
const tableHeadRow = document.getElementById('table-head-row');

// --- أولاً: إدارة المظهر (Dark Mode) ---
themeToggle.addEventListener('click', () => {
    document.body.classList.toggle('dark-mode');
    const isDark = document.body.classList.contains('dark-mode');
    themeToggle.innerHTML = isDark ? '<i class="fas fa-sun"></i>' : '<i class="fas fa-moon"></i>';
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
});

// استعادة المظهر المفضل
if(localStorage.getItem('theme') === 'dark') document.body.classList.add('dark-mode');

// --- ثانياً: إدارة حقول التاريخ الديناميكية ---
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
    } else {
        dynamicDateContainer.classList.add('hidden');
    }
    dynamicDateContainer.innerHTML = html;
});

// --- ثالثاً: جلب البيانات الأساسية (Accounts, Users, Rates) ---
async function init() {
    // جلب الحسابات
    const accSnap = await db.collection('accounts').get();
    accSnap.forEach(doc => {
        accountsData[doc.id] = doc.data();
        document.getElementById('account-filter').innerHTML += `<option value="${doc.id}">${doc.data().name}</option>`;
    });

    // جلب الموظفين
    const userSnap = await db.collection('users').where('role', '==', 'user').get();
    userSnap.forEach(doc => {
        usersData.push({id: doc.id, ...doc.data()});
        document.getElementById('user-filter').innerHTML += `<option value="${doc.data().name}">${doc.data().name}</option>`;
    });

    // جلب الأسعار الخاصة (User Account Rates)
    const rateSnap = await db.collection('userAccountRates').get();
    rateSnap.forEach(doc => {
        const data = doc.data();
        userRates[`${data.userId}_${data.accountId}`] = data.customPricePerHour;
    });
}

// --- رابعاً: منطق الفلترة والحساب (The Core Engine) ---
document.getElementById('apply-filters-btn').addEventListener('click', async () => {
    showLoader(true);
    
    let query = db.collection('workRecords');
    const accFilter = document.getElementById('account-filter').value;
    const userFilter = document.getElementById('user-filter').value;

    // تطبيق فلاتر الحساب والموظف
    if(accFilter !== 'all') query = query.where('accountId', '==', accFilter);
    if(userFilter !== 'all') query = query.where('userName', '==', userFilter);

    // تطبيق فلتر التاريخ (Timestamp logic)
    // ملاحظة: هنا يجب تحويل التاريخ لـ Timestamp حسب المدخلات
    // سأقوم بتبسيطها هنا لتوضيح المنطق
    
    const snapshot = await query.get();
    let records = [];
    snapshot.forEach(doc => records.push(doc.data()));

    processAndRender(records, accFilter, userFilter);
});

function processAndRender(records, accFilter, userFilter) {
    let summary = {};
    let totalTimeAll = 0;
    let totalMoneyAll = 0;

    // تحديد نوع التجميع (Aggregation Mode)
    let mode = 'date'; // الافتراضي تجميع حسب التاريخ
    let headName = 'التاريخ';

    if (userFilter !== 'all' && accFilter === 'all') {
        mode = 'accountId'; headName = 'الحسابات';
    } else if (accFilter !== 'all' && userFilter === 'all') {
        mode = 'userName'; headName = 'الموظفين';
    }

    records.forEach(rec => {
        let key = (mode === 'accountId') ? accountsData[rec.accountId]?.name : (mode === 'userName' ? rec.userName : new Date(rec.timestamp.seconds * 1000).toLocaleDateString('ar-EG'));
        
        if(!summary[key]) summary[key] = { time: 0, money: 0 };

        // حساب السعر: خاص أم افتراضي؟
        const customRate = userRates[`${rec.userId}_${rec.accountId}`];
        const defaultRate = accountsData[rec.accountId]?.defaultPricePerHour || 0;
        const finalRate = customRate || defaultRate;

        const recordMoney = (rec.totalTime / 60) * finalRate;

        summary[key].time += rec.totalTime;
        summary[key].money += recordMoney;
        totalTimeAll += rec.totalTime;
        totalMoneyAll += recordMoney;
    });

    renderTable(summary, headName, totalTimeAll, totalMoneyAll);
}

function renderTable(summary, headName, totalT, totalM) {
    tableHeadRow.innerHTML = `<th>${headName}</th><th>إجمالي الوقت</th><th>الرواتب / التكلفة</th>`;
    tableBody.innerHTML = '';

    Object.keys(summary).forEach(key => {
        const row = `<tr>
            <td>${key}</td>
            <td>${Math.floor(summary[key].time / 60)}h ${summary[key].time % 60}m</td>
            <td>${summary[key].money.toFixed(2)} ج.م</td>
        </tr>`;
        tableBody.innerHTML += row;
    });

    // تحديث الإجماليات وكروت الإحصائيات
    document.getElementById('footer-total-time').innerText = `${Math.floor(totalT / 60)}h ${totalT % 60}m`;
    document.getElementById('footer-total-money').innerText = `${totalM.toFixed(2)} ج.م`;
    document.getElementById('stat-total-time').innerText = `${Math.floor(totalT / 60)}h ${totalT % 60}m`;
    document.getElementById('stat-total-money').innerText = `${totalM.toFixed(2)} ج.م`;
    
    document.getElementById('results-section').classList.remove('hidden');
    document.getElementById('stats-container').classList.remove('hidden');
    showLoader(false);

    // إضافة أنيميشن بسيط باستخدام GSAP
    gsap.from("#reports-table tr", {opacity: 0, y: 10, stagger: 0.05});
}

function showLoader(show) {
    document.getElementById('loader').classList.toggle('hidden', !show);
}

init();

document.getElementById('export-excel').addEventListener('click', () => {
    const table = document.getElementById('reports-table');
    const wb = XLSX.utils.table_to_book(table, {sheet: "تقرير الإنتاجية"});
    XLSX.writeFile(wb, `تقرير_${new Date().toLocaleDateString()}.xlsx`);
});