// 1. إعدادات Firebase 
const firebaseConfig = {
    apiKey: "AIzaSyBu_MfB_JXvzBFaKY-Yxze1JotejU--4as",
    authDomain: "worktrackerapp-a32af.firebaseapp.com",
    projectId: "worktrackerapp-a32af",
    storageBucket: "worktrackerapp-a32af.firebasestorage.app",
    messagingSenderId: "246595598451",
    appId: "1:246595598451:web:c6842f1618dffe765a5206"
};

// تهيئة Firebase
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const db = firebase.firestore();

// 2. المتغيرات العامة
let accountsData = {};
let userRates = {};

// 3. الدوال المساعدة (الوقت والمال)
function formatTime(totalMinutes) {
    if (!totalMinutes || totalMinutes <= 0) return "0س 0د 0ث";
    const totalSeconds = Math.floor(totalMinutes * 60);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return `${hours}س ${minutes}د ${seconds}ث`;
}

function roundToTen(amount) {
    return Math.round(amount / 10) * 10;
}

// 4. دالة التشغيل الرئيسية عند تحميل الصفحة
window.onload = async () => {
    // --- أ. تفعيل الدارك مود ---
    const themeToggle = document.getElementById('theme-toggle');
    const applyTheme = (isDark) => {
        document.body.classList.toggle('dark-mode', isDark);
        themeToggle.innerHTML = isDark ? '<i class="fas fa-sun"></i>' : '<i class="fas fa-moon"></i>';
    };

    themeToggle.addEventListener('click', () => {
        const isDark = !document.body.classList.contains('dark-mode');
        applyTheme(isDark);
        localStorage.setItem('theme', isDark ? 'dark' : 'light');
    });
    if (localStorage.getItem('theme') === 'dark') applyTheme(true);

    // --- ب. جلب بيانات الحسابات والمستخدمين ---
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

    // --- ج. التحكم في حقول التاريخ ---
    const dateType = document.getElementById('date-type');
    const dynamicContainer = document.getElementById('dynamic-date-container');

    dateType.addEventListener('change', () => {
        const val = dateType.value;
        dynamicContainer.classList.remove('hidden');
        if (val === 'day') dynamicContainer.innerHTML = '<label>اختر اليوم</label><input type="date" id="date-val">';
        else if (val === 'month') dynamicContainer.innerHTML = '<label>اختر الشهر</label><input type="month" id="month-val">';
        else if (val === 'year') {
            let options = '';
            for(let i=2024; i<=2026; i++) options += `<option value="${i}">${i}</option>`;
            dynamicContainer.innerHTML = `<label>السنة</label><select id="year-val">${options}</select>`;
        } else if (val === 'range') {
            dynamicContainer.innerHTML = '<label>من</label><input type="date" id="date-start"><label>إلى</label><input type="date" id="date-end">';
        } else dynamicContainer.classList.add('hidden');
    });

    // --- د. تنفيذ التصفية (المنطق البرمجي السليم) ---
    document.getElementById('apply-filters-btn').addEventListener('click', async () => {
        document.getElementById('loader').classList.remove('hidden');
        let query = db.collection('workRecords');

        const accFilter = document.getElementById('account-filter').value;
        const userFilter = document.getElementById('user-filter').value;
        if(accFilter !== 'all') query = query.where('accountId', '==', accFilter);
        if(userFilter !== 'all') query = query.where('userName', '==', userFilter);

        // فلترة التاريخ بدقة
        const mode = dateType.value;
        if (mode === 'month' && document.getElementById('month-val').value) {
            const dateParts = document.getElementById('month-val').value.split('-');
            const start = new Date(dateParts[0], dateParts[1] - 1, 1);
            const end = new Date(dateParts[0], dateParts[1], 0, 23, 59, 59);
            query = query.where('timestamp', '>=', firebase.firestore.Timestamp.fromDate(start))
                         .where('timestamp', '<=', firebase.firestore.Timestamp.fromDate(end));
        }

        try {
            const snapshot = await query.get();
            let summary = {};
            let totalT = 0, totalM = 0;

            let groupKey = (userFilter !== 'all' && accFilter === 'all') ? 'accountId' : 
                           (accFilter !== 'all' && userFilter === 'all' ? 'userName' : 'date');

            snapshot.forEach(doc => {
                const rec = doc.data();
                let key = groupKey === 'accountId' ? (accountsData[rec.accountId]?.name || 'حساب غير معروف') :
                          (groupKey === 'userName' ? rec.userName : new Date(rec.timestamp.seconds * 1000).toLocaleDateString('ar-EG'));

                if (!summary[key]) summary[key] = { time: 0, money: 0 };
                
                const rate = userRates[`${rec.userId}_${rec.accountId}`] || accountsData[rec.accountId]?.defaultPricePerHour || 0;
                const money = (rec.totalTime / 60) * rate;

                summary[key].time += rec.totalTime;
                summary[key].money += money;
                totalT += rec.totalTime;
                totalM += money;
            });

            renderTable(summary, groupKey, totalT, totalM);
        } catch (e) { console.error("Query Error:", e); }
        document.getElementById('loader').classList.add('hidden');
    });

    // --- هـ. زراير التصدير (المعدلة) ---
    document.getElementById('export-excel').onclick = () => {
        if (typeof XLSX === 'undefined') return alert("جاري تحميل المكتبة، حاول ثانية");
        const wb = XLSX.utils.table_to_book(document.getElementById('reports-table'));
        XLSX.writeFile(wb, `Report_${new Date().getTime()}.xlsx`);
    };

    document.getElementById('export-pdf').onclick = () => window.print();
};

function renderTable(summary, groupKey, totalT, totalM) {
    const headText = groupKey === 'accountId' ? 'الحساب' : (groupKey === 'userName' ? 'الموظف' : 'التاريخ');
    document.getElementById('table-head-row').innerHTML = `<th>${headText}</th><th>إجمالي الوقت</th><th>التكلفة (مقربة)</th>`;
    
    let html = '';
    Object.keys(summary).forEach(key => {
        html += `<tr>
            <td>${key}</td>
            <td>${formatTime(summary[key].time)}</td>
            <td>${roundToTen(summary[key].money).toLocaleString()} ج.م</td>
        </tr>`;
    });
    document.getElementById('table-body').innerHTML = html;

    document.getElementById('footer-total-time').innerText = formatTime(totalT);
    document.getElementById('footer-total-money').innerText = `${roundToTen(totalM).toLocaleString()} ج.م`;
    document.getElementById('stat-total-time').innerText = formatTime(totalT);
    document.getElementById('stat-total-money').innerText = `${roundToTen(totalM).toLocaleString()} ج.م`;

    document.getElementById('results-section').classList.remove('hidden');
    document.getElementById('stats-container').classList.remove('hidden');
    gsap.from("#reports-table tr", {opacity: 0, y: 15, stagger: 0.05});
}
