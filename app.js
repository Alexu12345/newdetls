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

// 2. المتغيرات العامة وخزان البيانات
let accountsData = {};
let userRates = {};
let lastFetchedRecords = []; // الخزان المحلي (Cache)

// 3. الدوال المساعدة (تنسيق، تقريب، ألوان)
const formatTime = (totalMinutes) => {
    if (!totalMinutes || totalMinutes <= 0) return "0س 0د 0ث";
    const totalSeconds = Math.floor(totalMinutes * 60);
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    return `${h}س ${m}د ${s}ث`;
};

const roundToTen = (amount) => Math.round(amount / 10) * 10;

// تحديد كلاس اللون بناءً على عدد الساعات
function getStatusClass(totalMinutes) {
    const hours = totalMinutes / 60;
    if (hours >= 150) return 'row-gold';
    if (hours >= 100) return 'row-green';
    if (hours >= 80) return 'row-yellow';
    return 'row-red';
}

// توليد اسم الملف الذكي للتصدير
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
    else if (dateM === 'range') parts.push(`${document.getElementById('date-start')?.value}_إلى_${document.getElementById('date-end')?.value}`);

    return parts.length ? parts.join(' - ') : "تقرير_عام";
}

// 4. المحرك الرئيسي عند تحميل الصفحة
window.onload = async () => {
    // --- تفعيل الدارك مود ---
    const themeToggle = document.getElementById('theme-toggle');
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

    // --- جلب البيانات الأساسية (Accounts & Rates) ---
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

    // --- تبديل حقول التاريخ ---
    const dateType = document.getElementById('date-type');
    const dynamicDateContainer = document.getElementById('dynamic-date-container');
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

    // --- تنفيذ التصفية والبحث ---
    document.getElementById('apply-filters-btn').onclick = async () => {
        document.getElementById('loader').classList.remove('hidden');
        
        let query = db.collection('workRecords');
        const accF = document.getElementById('account-filter').value;
        const userF = document.getElementById('user-filter').value;

        if(accF !== 'all') query = query.where('accountId', '==', accF);
        if(userF !== 'all') query = query.where('userName', '==', userF);

        // منطق التاريخ الشامل
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
            lastFetchedRecords = [];
            snap.forEach(doc => lastFetchedRecords.push(doc.data()));
            processAndRender(lastFetchedRecords, accF, userF);
        } catch (err) { console.error(err); }
        document.getElementById('loader').classList.add('hidden');
    };

    // --- البحث السريع مع التظليل ---
    document.getElementById('table-search').addEventListener('input', function() {
        const term = this.value.toLowerCase();
        const rows = document.querySelectorAll('#table-body tr');

        rows.forEach(row => {
            const cells = Array.from(row.cells);
            const match = cells.some(cell => cell.getAttribute('data-orig')?.toLowerCase().includes(term) || cell.innerText.toLowerCase().includes(term));
            
            row.style.display = match ? "" : "none";
            
            if (match && term) {
                cells.forEach(cell => {
                    const originalText = cell.getAttribute('data-orig') || cell.innerText;
                    if (!cell.getAttribute('data-orig')) cell.setAttribute('data-orig', originalText);
                    
                    const regex = new RegExp(`(${term})`, 'gi');
                    cell.innerHTML = originalText.replace(regex, '<span class="highlight">$1</span>');
                });
            } else {
                cells.forEach(cell => {
                    if (cell.getAttribute('data-orig')) cell.innerHTML = cell.getAttribute('data-orig');
                });
            }
        });
    });

    // --- أزرار التصدير ---
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

// 5. معالجة ورسم البيانات
function processAndRender(records, accF, userF) {
    let summary = {}, totalT = 0, totalM = 0;
    let groupKey = (userF !== 'all' && accF === 'all') ? 'accountId' : 
                   (accF !== 'all' && userF === 'all' ? 'userName' : 'date');

    records.forEach(rec => {
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
        const statusClass = getStatusClass(summary[k].time);
        html += `<tr class="${statusClass}">
            <td data-orig="${k}">${k}</td>
            <td data-orig="${formatTime(summary[k].time)}">${formatTime(summary[k].time)}</td>
            <td data-orig="${roundToTen(summary[k].money).toLocaleString()} ج.م">${roundToTen(summary[k].money).toLocaleString()} ج.م</td>
        </tr>`;
    });
    
    document.getElementById('table-body').innerHTML = html;
    document.getElementById('footer-total-time').innerText = formatTime(totalT);
    document.getElementById('footer-total-money').innerText = `${roundToTen(totalM).toLocaleString()} ج.م`;
    document.getElementById('stat-total-time').innerText = formatTime(totalT);
    document.getElementById('stat-total-money').innerText = `${roundToTen(totalM).toLocaleString()} ج.م`;

    // إظهار النتائج والأنيميشن
    document.getElementById('results-section').classList.remove('hidden');
    document.getElementById('stats-container').classList.remove('hidden');

    const tl = gsap.timeline();
    tl.fromTo(".stat-card", { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.5, stagger: 0.1, ease: "back.out(1.7)" })
      .fromTo("#reports-table tr", { opacity: 0, x: -20 }, { opacity: 1, x: 0, duration: 0.3, stagger: 0.05 }, "-=0.3");
}
