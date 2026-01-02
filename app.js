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

// 2. المتغيرات العامة
let accountsData = {};
let userRates = {};
let lastFetchedRecords = []; 
let currentViewMode = 'date'; 

// 3. الدوال المساعدة المحسنة
const formatTime = (totalMinutes) => {
    if (!totalMinutes || totalMinutes <= 0) return "0س 0د 0ث";
    const totalSeconds = Math.floor(totalMinutes * 60);
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    return `${h}س ${m}د ${s}ث`;
};

const roundToTen = (amount) => Math.round(amount / 10) * 10;

// محرك الألوان الذكي بناءً على "البطل" (أعلى ساعات في النتائج الحالية)
function getFlexibleStatusClass(currentMinutes, maxMinutes) {
    if (!maxMinutes || maxMinutes <= 0) return '';
    const percentage = (currentMinutes / maxMinutes) * 100;
    
    if (percentage >= 90) return 'row-gold';   // 90% فأكثر (البطل والمقربون منه)
    if (percentage >= 75) return 'row-silver'; // 75% إلى 89% (ممتاز)
    if (percentage >= 50) return 'row-green';  // 50% إلى 74% (جيد)
    if (percentage >= 25) return 'row-yellow'; // 25% إلى 49% (متوسط)
    return 'row-red';                          // أقل من 25% (ضعيف)
}

function getDynamicFileName() {
    const userF = document.getElementById('user-filter');
    const accF = document.getElementById('account-filter');
    const dateM = document.getElementById('date-type').value;
    let parts = [getDynamicFileNameTitle()]; // استخدام العنوان الديناميكي
    if (userF.value !== 'all') parts.push(userF.value);
    if (accF.value !== 'all') parts.push(accF.options[accF.selectedIndex].text);
    return parts.join(' - ');
}

// 4. المحرك الرئيسي عند التشغيل
window.onload = async () => {
    const themeToggle = document.getElementById('theme-toggle');
    const dateType = document.getElementById('date-type');
    const dynamicDateContainer = document.getElementById('dynamic-date-container');
    const viewSwitch = document.getElementById('view-switch-container');
    const btnMonths = document.getElementById('view-months');

    // --- منطق السويتش الثلاثي ---
    const switchButtons = {
        'view-days': 'date',
        'view-months': 'month',
        'view-users': 'userName'
    };

    Object.keys(switchButtons).forEach(id => {
        document.getElementById(id).onclick = function() {
            document.querySelectorAll('.switch-button button').forEach(b => b.classList.remove('active-switch'));
            this.classList.add('active-switch');
            currentViewMode = switchButtons[id];
            processAndRender(lastFetchedRecords); 
        };
    });

    // --- الدارك مود ---
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

    // --- جلب بيانات الحسابات والموظفين ---
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

    // --- إدارة حقول التاريخ ---
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

    // --- تنفيذ البحث الرئيسي ---
    document.getElementById('apply-filters-btn').onclick = async () => {
        document.getElementById('loader').classList.remove('hidden');
        let query = db.collection('workRecords');
        const accF = document.getElementById('account-filter').value;
        const userF = document.getElementById('user-filter').value;

        if(accF !== 'all') query = query.where('accountId', '==', accF);
        if(userF !== 'all') query = query.where('userName', '==', userF);

        // إظهار سويتش الشهور فقط للنطاقات الطويلة
        if (dateType.value === 'year' || dateType.value === 'range') btnMonths.classList.remove('hidden');
        else {
            btnMonths.classList.add('hidden');
            if(currentViewMode === 'month') currentViewMode = 'date'; // إعادة ضبط للأيام
        }

        // إظهار السويتش العام
        if (accF === 'all' && userF === 'all') viewSwitch.classList.remove('hidden');
        else viewSwitch.classList.add('hidden');

        // فلترة التاريخ
        const mode = dateType.value;
        let start, end;
        if (mode === 'day' && document.getElementById('date-val').value) {
            const v = document.getElementById('date-val').value;
            start = new Date(v+'T00:00:00'); end = new Date(v+'T23:59:59');
        } else if (mode === 'month' && document.getElementById('month-val').value) {
            const v = document.getElementById('month-val').value;
            const p = v.split('-'); 
            start = new Date(p[0], p[1]-1, 1); end = new Date(p[0], p[1], 0, 23, 59, 59);
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
            lastFetchedRecords = [];
            snap.forEach(doc => lastFetchedRecords.push(doc.data()));
            processAndRender(lastFetchedRecords);
        } catch (err) { console.error(err); }
        document.getElementById('loader').classList.add('hidden');
    };

    // --- البحث السريع مع التظليل ---
    document.getElementById('table-search').addEventListener('input', function() {
        const term = this.value.toLowerCase();
        const rows = document.querySelectorAll('#table-body tr');
        rows.forEach(row => {
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

    // --- التصدير ---
    document.getElementById('export-excel').onclick = () => {
        XLSX.writeFile(XLSX.utils.table_to_book(document.getElementById('reports-table')), `${getDynamicFileName()}.xlsx`);
    };
    document.getElementById('export-pdf').onclick = () => {
        const old = document.title; document.title = getDynamicFileName();
        window.print();
        setTimeout(() => document.title = old, 1000);
    };
};

function processAndRender(records) {
    const accF = document.getElementById('account-filter').value;
    const userF = document.getElementById('user-filter').value;
    
    let summary = {}, totalT = 0, totalM = 0;
    
    let groupKey = (accF === 'all' && userF === 'all') ? currentViewMode : 
                   (userF !== 'all' && accF === 'all' ? 'accountId' : (accF !== 'all' && userF === 'all' ? 'userName' : 'date'));

    records.forEach(rec => {
        let key;
        const dateObj = new Date(rec.timestamp.seconds * 1000);
        
        if (groupKey === 'accountId') key = accountsData[rec.accountId]?.name || 'حساب غير معروف';
        else if (groupKey === 'userName') key = rec.userName;
        else if (groupKey === 'month') key = dateObj.toLocaleDateString('ar-EG', {month:'long', year:'numeric'});
        else key = dateObj.toLocaleDateString('ar-EG');

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
    const headText = groupKey === 'accountId' ? 'الحساب' : (groupKey === 'userName' ? 'الموظف' : (groupKey === 'month' ? 'الشهر' : 'التاريخ'));
    document.getElementById('table-head-row').innerHTML = `<th>${headText}</th><th>إجمالي الوقت</th><th>التكلفة (مقربة)</th>`;
    
    // حساب "البطل" للنسب المرنة
    const maxTime = Math.max(...Object.values(summary).map(s => s.time), 0);
    
    let html = '';
    let topName = "-";
    let topVal = -1;

    Object.keys(summary).forEach(k => {
        const time = summary[k].time;
        if(time > topVal) { topVal = time; topName = k; }

        const sClass = getFlexibleStatusClass(time, maxTime);
        html += `<tr class="${sClass}">
            <td data-orig="${k}">${k}</td>
            <td data-orig="${formatTime(time)}">${formatTime(time)}</td>
            <td data-orig="${roundToTen(summary[k].money).toLocaleString()} ج.م">${roundToTen(summary[k].money).toLocaleString()} ج.م</td>
        </tr>`;
    });
    
    document.getElementById('table-body').innerHTML = html;
    document.getElementById('stat-top-performer').innerText = topName;
    document.getElementById('footer-total-time').innerText = formatTime(totalT);
    document.getElementById('footer-total-money').innerText = `${roundToTen(totalM).toLocaleString()} ج.م`;
    document.getElementById('stat-total-time').innerText = formatTime(totalT);
    document.getElementById('stat-total-money').innerText = `${roundToTen(totalM).toLocaleString()} ج.م`;

    document.getElementById('results-section').classList.remove('hidden');
    document.getElementById('stats-container').classList.remove('hidden');

    gsap.fromTo(".stat-card", { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.4, stagger: 0.1 });
    gsap.fromTo("#reports-table tr", { opacity: 0, x: -10 }, { opacity: 1, x: 0, duration: 0.3, stagger: 0.02 });
}
