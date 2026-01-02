// 1. إعدادات Firebase 
const firebaseConfig = {
    apiKey: "AIzaSyBu_MfB_JXvzBFaKY-Yxze1JotejU--4as",
    authDomain: "worktrackerapp-a32af.firebaseapp.com",
    projectId: "worktrackerapp-a32af",
    storageBucket: "worktrackerapp-a32af.firebasestorage.app",
    messagingSenderId: "246595598451",
    appId: "1:246595598451:web:c6842f1618dffe765a5206"
};

if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// المتغيرات العامة
let accountsData = {};
let userRates = {};

// 2. الدوال المساعدة المحسنة
const formatTime = (totalMinutes) => {
    if (!totalMinutes || totalMinutes <= 0) return "0س 0د 0ث";
    const totalSeconds = Math.floor(totalMinutes * 60);
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    return `${h}س ${m}د ${s}ث`;
};

const roundToTen = (amount) => Math.round(amount / 10) * 10;

// دالة توليد اسم الملف الذكي
function getDynamicFileName() {
    const userF = document.getElementById('user-filter');
    const accF = document.getElementById('account-filter');
    const dateM = document.getElementById('date-type').value;
    let parts = [];

    if (userF.value !== 'all') parts.push(userF.value);
    if (accF.value !== 'all') parts.push(accF.options[accF.selectedIndex].text);

    if (dateM === 'day') parts.push(document.getElementById('date-val')?.value || "");
    else if (dateM === 'month') {
        const mVal = document.getElementById('month-val')?.value;
        if(mVal) parts.push(new Date(mVal).toLocaleDateString('ar-EG', {month:'long', year:'numeric'}));
    }
    else if (dateM === 'year') parts.push(document.getElementById('year-val')?.value || "");
    else if (dateM === 'range') parts.push(`${document.getElementById('date-start')?.value} to ${document.getElementById('date-end')?.value}`);

    return parts.length ? parts.join(' - ') : "تقرير_عام";
}

// 3. الإعدادات عند تشغيل الصفحة
window.onload = async () => {
    const themeToggle = document.getElementById('theme-toggle');
    const dateType = document.getElementById('date-type');
    const dynamicDateContainer = document.getElementById('dynamic-date-container');

    // تفعيل الدارك مود
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

    // جلب البيانات الأساسية
    const [accs, rates] = await Promise.all([
        db.collection('accounts').get(),
        db.collection('userAccountRates').get()
    ]);
    
    accs.forEach(doc => {
        accountsData[doc.id] = doc.data();
        document.getElementById('account-filter').innerHTML += `<option value="${doc.id}">${doc.data().name}</option>`;
    });
    rates.forEach(doc => {
        const d = doc.data();
        userRates[`${d.userId}_${d.accountId}`] = d.customPricePerHour;
    });

    const userSnap = await db.collection('users').where('role', '==', 'user').get();
    userSnap.forEach(doc => {
        document.getElementById('user-filter').innerHTML += `<option value="${doc.data().name}">${doc.data().name}</option>`;
    });

    // تبديل حقول التاريخ
    dateType.onchange = () => {
        const val = dateType.value;
        dynamicDateContainer.classList.remove('hidden');
        if (val === 'day') dynamicDateContainer.innerHTML = '<label>اليوم</label><input type="date" id="date-val">';
        else if (val === 'month') dynamicDateContainer.innerHTML = '<label>الشهر</label><input type="month" id="month-val">';
        else if (val === 'year') {
            let opts = ''; for(let i=2024; i<=2026; i++) opts += `<option value="${i}">${i}</option>`;
            dynamicDateContainer.innerHTML = `<label>السنة</label><select id="year-val">${opts}</select>`;
        }
        else if (val === 'range') dynamicDateContainer.innerHTML = '<label>من</label><input type="date" id="date-start"><label>إلى</label><input type="date" id="date-end">';
        else dynamicDateContainer.classList.add('hidden');
    };

    // 4. تنفيذ التصفية
    document.getElementById('apply-filters-btn').onclick = async () => {
        const loader = document.getElementById('loader');
        loader.classList.remove('hidden');
        
        let query = db.collection('workRecords');
        const accF = document.getElementById('account-filter').value;
        const userF = document.getElementById('user-filter').value;

        if(accF !== 'all') query = query.where('accountId', '==', accF);
        if(userF !== 'all') query = query.where('userName', '==', userF);

        // محرك التاريخ المطور
        const mode = dateType.value;
        let start, end;
        if (mode === 'day') {
            const v = document.getElementById('date-val').value;
            if(v) { start = new Date(v+'T00:00:00'); end = new Date(v+'T23:59:59'); }
        } else if (mode === 'month') {
            const v = document.getElementById('month-val').value;
            if(v) { 
                const p = v.split('-'); 
                start = new Date(p[0], p[1]-1, 1); 
                end = new Date(p[0], p[1], 0, 23, 59, 59); 
            }
        } else if (mode === 'year') {
            const v = document.getElementById('year-val').value;
            start = new Date(v, 0, 1); end = new Date(v, 11, 31, 23, 59, 59);
        } else if (mode === 'range') {
            const s = document.getElementById('date-start').value;
            const e = document.getElementById('date-end').value;
            if(s && e) { start = new Date(s+'T00:00:00'); end = new Date(e+'T23:59:59'); }
        }

        if (start && end) {
            query = query.where('timestamp', '>=', firebase.firestore.Timestamp.fromDate(start))
                         .where('timestamp', '<=', firebase.firestore.Timestamp.fromDate(end));
        }

        try {
            const snap = await query.get();
            processAndRender(snap, accF, userF);
        } catch (err) { console.error(err); }
        loader.classList.add('hidden');
    };

    // زراير التصدير
    document.getElementById('export-excel').onclick = () => {
        const wb = XLSX.utils.table_to_book(document.getElementById('reports-table'));
        XLSX.writeFile(wb, `${getDynamicFileName()}.xlsx`);
    };
    document.getElementById('export-pdf').onclick = () => {
        const oldTitle = document.title;
        document.title = getDynamicFileName();
        window.print();
        setTimeout(() => document.title = oldTitle, 1000);
    };
};

function processAndRender(snapshot, accF, userF) {
    let summary = {}, totalT = 0, totalM = 0;
    let groupKey = (userF !== 'all' && accF === 'all') ? 'accountId' : 
                   (accF !== 'all' && userF === 'all' ? 'userName' : 'date');

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

    renderUI(summary, groupKey, totalT, totalM);
}

function renderUI(summary, groupKey, totalT, totalM) {
    const headText = groupKey === 'accountId' ? 'الحساب' : (groupKey === 'userName' ? 'الموظف' : 'التاريخ');
    document.getElementById('table-head-row').innerHTML = `<th>${headText}</th><th>إجمالي الوقت</th><th>التكلفة (مقربة)</th>`;
    
    let html = '';
    Object.keys(summary).forEach(k => {
        html += `<tr><td>${k}</td><td>${formatTime(summary[k].time)}</td><td>${roundToTen(summary[k].money).toLocaleString()} ج.م</td></tr>`;
    });
    
    document.getElementById('table-body').innerHTML = html;
    document.getElementById('footer-total-time').innerText = formatTime(totalT);
    document.getElementById('footer-total-money').innerText = `${roundToTen(totalM).toLocaleString()} ج.م`;
    document.getElementById('stat-total-time').innerText = formatTime(totalT);
    document.getElementById('stat-total-money').innerText = `${roundToTen(totalM).toLocaleString()} ج.م`;

    // الأنيميشن المطور باستخدام GSAP Timeline
    const results = document.getElementById('results-section');
    const stats = document.getElementById('stats-container');
    
    results.classList.remove('hidden');
    stats.classList.remove('hidden');

    const tl = gsap.timeline();
    tl.fromTo(".stat-card", { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.5, stagger: 0.1, ease: "back.out(1.7)" })
      .fromTo("#reports-table tr", { opacity: 0, x: -20 }, { opacity: 1, x: 0, duration: 0.3, stagger: 0.05 }, "-=0.3");
}
