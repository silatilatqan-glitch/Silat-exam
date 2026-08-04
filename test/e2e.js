/* E2E — رحلة كاملة: طالب → سيناريوهان → إرسال → تصحيح → إعادة دخول بموافقة → محاولة جديدة
   قاعدة البيانات الحقيقية محجوبة بالكامل — Supabase وFirebase يُحاكيان في الذاكرة */
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 8123;
const results = [];
const check = (name, cond, extra) => {
  results.push({ name, ok: !!cond, extra: extra || '' });
  console.log((cond ? '✅' : '❌') + ' ' + name + (extra ? ' — ' + extra : ''));
};

/* ─── Mock Supabase state ─── */
const db = { exam_subs: {}, exam_meta: {}, exam_courses: {} };
const allSubs = () => Object.values(db.exam_subs).map(r => r.data);

function handleSupabase(route) {
  const req = route.request();
  const url = new URL(req.url());
  const parts = url.pathname.split('/'); // /rest/v1/<table>
  const table = parts[3];
  const method = req.method();
  const q = url.searchParams;
  const wantsSingle = (req.headers()['accept'] || '').includes('pgrst.object');
  const json = (status, body) => route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });

  if (method === 'OPTIONS') return route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });

  if (table === 'exam_subs') {
    if (method === 'GET') {
      let rows = Object.values(db.exam_subs);
      const idEq = q.get('id');
      if (idEq && idEq.startsWith('eq.')) rows = rows.filter(r => r.id === idEq.slice(3));
      const contains = q.get('data');
      if (contains && contains.startsWith('cs.')) {
        try { const c = JSON.parse(decodeURIComponent(contains.slice(3))); rows = rows.filter(r => Object.entries(c).every(([k, v]) => r.data[k] === v)); } catch (e) {}
      }
      rows = rows.map(r => ({ data: r.data }));
      if (wantsSingle) return rows.length === 1 ? json(200, rows[0]) : json(406, { message: 'not single' });
      return json(200, rows);
    }
    if (method === 'POST') { const b = JSON.parse(req.postData() || '{}'); const arr = Array.isArray(b) ? b : [b]; arr.forEach(r => { db.exam_subs[r.id] = r; }); return json(201, arr); }
    if (method === 'DELETE') {
      const idIn = q.get('id');
      if (idIn && idIn.startsWith('in.(')) { idIn.slice(4, -1).split(',').forEach(id => delete db.exam_subs[id.replace(/"/g, '')]); }
      else if (idIn && idIn.startsWith('neq.')) { const keep = idIn.slice(4); Object.keys(db.exam_subs).forEach(id => { if (id !== keep) delete db.exam_subs[id]; }); }
      return json(204, []);
    }
  }
  if (table === 'exam_meta') {
    if (method === 'GET') {
      const keyEq = (q.get('key') || '').replace('eq.', '');
      const row = db.exam_meta[keyEq];
      const rows = row !== undefined ? [{ value: row }] : [];
      if (wantsSingle) return rows.length === 1 ? json(200, rows[0]) : json(406, { message: 'no row' });
      return json(200, rows);
    }
    if (method === 'POST') { const b = JSON.parse(req.postData() || '{}'); const arr = Array.isArray(b) ? b : [b]; arr.forEach(r => { db.exam_meta[r.key] = r.value; }); return json(201, arr); }
    if (method === 'PATCH') { const keyEq = (q.get('key') || '').replace('eq.', ''); const b = JSON.parse(req.postData() || '{}'); if (db.exam_meta[keyEq] !== undefined) { db.exam_meta[keyEq] = b.value; return json(200, [{ key: keyEq, value: b.value }]); } return json(200, []); }
  }
  if (table === 'exam_courses') {
    if (method === 'GET') return json(200, Object.values(db.exam_courses).map(r => ({ data: r.data })));
    if (method === 'POST') { const b = JSON.parse(req.postData() || '{}'); const arr = Array.isArray(b) ? b : [b]; arr.forEach(r => { db.exam_courses[r.id] = r; }); return json(201, arr); }
    if (method === 'DELETE') { const idEq = (q.get('id') || '').replace('eq.', ''); delete db.exam_courses[idEq]; return json(204, []); }
  }
  return json(200, []);
}

(async () => {
  /* static server */
  const server = http.createServer((req, res) => {
    const f = path.join(__dirname, '..', req.url === '/' ? 'index.html' : req.url);
    try { res.setHeader('content-type', 'text/html; charset=utf-8'); res.end(fs.readFileSync(f)); } catch (e) { res.statusCode = 404; res.end('nf'); }
  }).listen(PORT);

  const browser = await chromium.launch({ executablePath: require('fs').existsSync('/opt/pw-browsers/chromium-1194/chrome-linux/chrome')?'/opt/pw-browsers/chromium-1194/chrome-linux/chrome':undefined });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

  const pageErrors = [];
  page.on('pageerror', e => { pageErrors.push(String(e)); console.log('🔴 PAGE ERROR:', String(e).slice(0, 300)); });
  const dialogs = [];
  page.on('dialog', async d => { dialogs.push(d.message().slice(0, 60)); await d.accept(); });

  /* CDN محجوب في بيئة الاختبار — نفس المكتبات بنفس الإصدارات تُقدَّم محلياً من npm */
  const LIBS = {
    'react.production.min.js': 'node_modules/react/umd/react.production.min.js',
    'react-dom.production.min.js': 'node_modules/react-dom/umd/react-dom.production.min.js',
    'babel.min.js': 'node_modules/@babel/standalone/babel.min.js',
    'supabase.js': 'node_modules/@supabase/supabase-js/dist/umd/supabase.js',
    'firebase-app-compat.js': 'node_modules/firebase/firebase-app-compat.js',
    'firebase-firestore-compat.js': 'node_modules/firebase/firebase-firestore-compat.js',
    'qrcode.min.js': 'node_modules/qrcodejs2/qrcode.min.js',
  };
  await page.route(/cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|www\.gstatic\.com/, route => {
    const u = route.request().url();
    const key = Object.keys(LIBS).find(k => u.endsWith(k));
    if (key) return route.fulfill({ status: 200, contentType: 'application/javascript', body: fs.readFileSync(path.join(__dirname, '..', LIBS[key])) });
    return route.fulfill({ status: 200, contentType: 'application/javascript', body: '' });
  });
  await page.route(/supabase\.co/, handleSupabase);
  await page.route(/firestore\.googleapis\.com|firebaseio\.com|googleapis\.com\/identitytoolkit/, r => r.abort());

  const goHome = async () => { await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' }); };
  const studentLogin = async () => {
    await page.click('text=دخول المتدرب');
    await page.fill('input[placeholder="1xxxxxxxxx"]', '1234567890');
    await page.fill('input[placeholder="Mohammed Ahmed Ali"]', 'Mohammed Ahmed Ali');
    await page.fill('input[type="date"]', '1995-05-10');
    await page.fill('input[placeholder="05xxxxxxxx"]', '0501234567');
    await page.fill('input[placeholder="ORD-XXXXXXXX"]', 'ORD-1234');
    await page.click('button:has-text("دخول ←")');
    await page.waitForTimeout(600);
  };
  const enterCourse = async () => {
    await page.click('button:has-text("الأوشا الأمريكية 30 ساعة")');
    await page.waitForSelector('input[placeholder="أدخل الرمز هنا..."]');
    await page.fill('input[placeholder="أدخل الرمز هنا..."]', 'OSHA001');
    await page.click('button:has-text("تحقق من الرمز ←")');
    await page.waitForTimeout(300);
  };
  const answerAllTasks = async (marker) => {
    for (let i = 1; i <= 4; i++) {
      await page.click(`button:has-text("مهمة ${i}")`);
      await page.waitForTimeout(150);
      await page.fill('textarea', `إجابة تحليلية ${marker} للمهمة رقم ${i} — نص طويل يتجاوز خمسين حرفاً بوضوح لاجتياز شرط الحد الأدنى للإجابة المطلوبة في النظام.`);
    }
  };

  /* ═══ 1) تحميل الرئيسية ═══ */
  await goHome();
  await page.waitForSelector('text=نظام الاختبارات التحليلية', { timeout: 20000 });
  check('1. الرئيسية تُحمَّل بدون أخطاء JS', pageErrors.length === 0);

  /* ═══ 2) دخول الطالب برمز خاطئ ثم صحيح ═══ */
  await studentLogin();
  check('2. الوصول لصفحة الدورات بعد الدخول', await page.isVisible('text=اختر الدورة'));
  await page.click('button:has-text("الأوشا الأمريكية 30 ساعة")');
  await page.fill('input[placeholder="أدخل الرمز هنا..."]', 'WRONG1');
  await page.click('button:has-text("تحقق من الرمز ←")');
  check('3. الرمز الخاطئ يُرفض', await page.isVisible('text=رمز الدخول غير صحيح'));
  await page.fill('input[placeholder="أدخل الرمز هنا..."]', 'OSHA001');
  await page.click('button:has-text("تحقق من الرمز ←")');
  check('4. الرمز الصحيح يفتح السيناريوهات', await page.isVisible('text=اختر السيناريو'));

  /* ═══ 3) بدء السيناريو الأول والإجابة ═══ */
  await page.click('button:has-text("بدء هذا السيناريو ←")');
  await page.waitForSelector('textarea');
  check('5. شاشة الاختبار فُتحت مع المؤقت', await page.isVisible('text=مهمة 1/4'));
  await answerAllTasks('س١');
  await page.waitForTimeout(300);

  /* ═══ 4) الانتقال للسيناريو الثاني ═══ */
  await page.click('button:has-text("إنهاء هذا السيناريو →")');
  await page.waitForSelector('text=الانتقال للسيناريو التالي');
  await page.click('button:has-text("الانتقال للسيناريو التالي ←")');
  await page.waitForTimeout(700);
  check('6. السيناريو الثاني فُتح', await page.isVisible('text=موقع بناء تجاري'));
  const s1rec = allSubs().find(s => s.scenarioId === 's_osha30_a');
  const s2rec = allSubs().find(s => s.scenarioId === 's_osha30_b');
  check('7. سجل السيناريو الثاني يرث نافذة الوقت وساعاتها', s2rec && s2rec.startTime === s1rec.startTime && s2rec.examHours === s1rec.examHours, `examHours=${s2rec && s2rec.examHours}`);

  /* ═══ 5) الرجوع للسيناريو السابق واستعادة الإجابات ═══ */
  await page.click('button:has-text("↩ السيناريو السابق")');
  await page.waitForTimeout(700);
  const t1val = await page.inputValue('textarea');
  check('8. الرجوع للسيناريو الأول يستعيد الإجابات', t1val.includes('س١'));

  /* العودة مجدداً للسيناريو الثاني — يجب إعادة استخدام السجل نفسه لا إنشاء سجل مكرر */
  await page.click('button:has-text("مهمة 4")');
  await page.waitForTimeout(200);
  await page.click('button:has-text("إنهاء هذا السيناريو →")');
  await page.waitForSelector('text=الانتقال للسيناريو التالي');
  await page.click('button:has-text("الانتقال للسيناريو التالي ←")');
  await page.waitForTimeout(700);
  const s2count = allSubs().filter(s => s.scenarioId === 's_osha30_b').length;
  check('9. لا سجلات مكررة عند التنقل ذهاباً وإياباً', s2count === 1, `عدد سجلات س٢=${s2count}`);

  /* ═══ 6) إجابة السيناريو الثاني والإرسال النهائي ═══ */
  await answerAllTasks('س٢');
  await page.waitForTimeout(200);
  await page.click('button:has-text("إرسال الاختبار نهائياً ✓")');
  await page.waitForSelector('text=تم إرسال الاختبار بنجاح', { timeout: 8000 });
  check('10. الإرسال النهائي وصل لشاشة التأكيد', true);
  const submitted = allSubs().find(s => s.status === 'submitted');
  check('11. الدرجة العظمى الصحيحة 200 (لا مضاعفة)', submitted && submitted.maxScore === 200, `maxScore=${submitted && submitted.maxScore}`);
  check('12. دمج إجابات السيناريوهين (8 مهام)', submitted && Object.keys(submitted.answers).length === 8, `answers=${submitted && Object.keys(submitted.answers).length}`);
  check('13. عنوان مركّب للسيناريوهين', submitted && /\+/.test(submitted.scenarioTitle), submitted && submitted.scenarioTitle);
  check('14. isMultiScenario مفعّلة', submitted && submitted.isMultiScenario === true && submitted.completedScenarioIds.length === 2);

  /* ═══ 7) تصحيح المدرب واعتماد النجاح ═══ */
  await page.click('button:has-text("العودة للرئيسية")');
  await page.click('text=دخول المدرب');
  await page.fill('input[placeholder="كلمة مرور المدرب"]', 'HSE@2024');
  await page.click('button:has-text("دخول")');
  await page.waitForSelector('text=لوحة تحكم المدرب');
  await page.waitForTimeout(700);
  check('15. لوحة المدرب تعرض الاختبار المُرسَل', await page.isVisible('text=Mohammed Ahmed Ali'));
  await page.locator('button:text-is("تصحيح")').last().click();
  await page.waitForSelector('text=معايير التصحيح');
  const scoreInputs = await page.$$('input[type="number"]');
  check('16. شاشة التصحيح تعرض 8 مهام لسيناريوهين', scoreInputs.length === 8, `عدد حقول الدرجات=${scoreInputs.length}`);
  for (const inp of scoreInputs) { await inp.fill('20'); }
  await page.waitForTimeout(200);
  check('17. النسبة تُحسب 80%', await page.isVisible('text=80%'));
  await page.click('button:has-text("اعتماد كـ ناجح")');
  /* Firebase محجوب هنا — مهلة إصدار الشهادة 12 ثانية ثم يكمل الاعتماد مع تحذير */
  await page.waitForSelector('button:has-text("خروج")', { timeout: 25000 });
  await page.waitForTimeout(500);
  const passed = allSubs().find(s => s.status === 'pass');
  check('18. الاعتماد سُجّل: 160/200 ناجح', passed && passed.totalScore === 160 && passed.maxScore === 200, `total=${passed && passed.totalScore}/${passed && passed.maxScore}`);

  /* ═══ 8) إعادة الدخول: طلب → موافقة → محاولة جديدة (الخطأ المُصلح) ═══ */
  await page.click('button:has-text("خروج")');
  await studentLogin();
  await page.waitForTimeout(500);
  check('19. توجيه تلقائي لصفحة النتائج بعد التصحيح', await page.isVisible('text=نتائجي السابقة'));
  check('20. النتيجة تُعلَّم كمقروءة (لن يتكرر التوجيه)', allSubs().some(s => s.status === 'pass' && s.resultSeen === true));
  await page.click('button:has-text("← رجوع")');
  await enterCourse();
  await page.click('button:has-text("بدء هذا السيناريو ←")');
  await page.waitForSelector('text=يوجد لديك اختبار سابق');
  check('21. محاولة البدء بعد النجاح تطلب موافقة المدرب', true);
  await page.click('button:has-text("إرسال طلب إعادة الدخول للمدرب")');
  await page.waitForSelector('text=طلبك قيد المراجعة');
  await page.click('button:has-text("العودة للرئيسية")');

  /* موافقة المدرب */
  await page.click('text=دخول المدرب');
  await page.fill('input[placeholder="كلمة مرور المدرب"]', 'HSE@2024');
  await page.click('button:has-text("دخول")');
  await page.waitForSelector('text=طلبات إعادة الدخول');
  await page.click('button:has-text("✓ موافقة")');
  await page.waitForTimeout(800);
  check('22. المدرب وافق على إعادة الدخول', allSubs().some(s => s.status === 'reentry_approved'));
  await page.click('button:has-text("خروج")');

  /* الطالب يدخل من جديد — يجب أن يفتح الاختبار مباشرة (كان يعلق في حلقة قبل الإصلاح) */
  await studentLogin();
  await page.waitForTimeout(400);
  check('23. لا إعادة توجيه للنتائج (مقروءة سابقاً)', await page.isVisible('text=اختر الدورة'));
  await enterCourse();
  await page.click('button:has-text("بدء هذا السيناريو ←")');
  await page.waitForTimeout(900);
  const examOpened = await page.isVisible('text=مهمة 1/4');
  check('24. 🎯 المحاولة الجديدة فُتحت بعد الموافقة (الخطأ الحرج مُصلح)', examOpened);
  check('25. تصريح إعادة الدخول استُهلك (مرة واحدة فقط)', allSubs().some(s => s.status === 'reentry_consumed'));
  const newAttempt = allSubs().find(s => s.status === 'in_progress');
  check('26. المحاولة الجديدة بنافذة وقت جديدة', newAttempt && newAttempt.startTime !== passed.startTime);

  /* ═══ 9) إرسال المحاولة الجديدة بسيناريو واحد — يجب ألا تُدمج بقايا المحاولة القديمة ═══ */
  await answerAllTasks('م٢');
  await page.click('button:has-text("إنهاء هذا السيناريو →")');
  await page.waitForSelector('text=الانتقال للسيناريو التالي');
  await page.click('button:has-text("إنهاء الاختبار الآن")');
  await page.waitForSelector('text=تم إرسال الاختبار بنجاح', { timeout: 8000 });
  const resub = allSubs().find(s => s.status === 'submitted');
  check('27. 🎯 محاولة جديدة بسيناريو واحد = 100 درجة عظمى (لا تلوث من المحاولة القديمة)', resub && resub.maxScore === 100 && resub.completedScenarioIds.length === 1, `maxScore=${resub && resub.maxScore}`);
  check('28. إجابات المحاولة الجديدة فقط (4 مهام)', resub && Object.keys(resub.answers).length === 4, `answers=${resub && Object.keys(resub.answers).length}`);

  /* ═══ 10) زر حذف سجل من اللوحة (تأكيد مزدوج) ═══ */
  await page.click('button:has-text("العودة للرئيسية")');
  await page.click('text=دخول المدرب');
  await page.fill('input[placeholder="كلمة مرور المدرب"]', 'HSE@2024');
  await page.click('button:has-text("دخول")');
  await page.waitForSelector('text=لوحة تحكم المدرب');
  await page.waitForTimeout(700);
  const delBtn = page.locator('div.row-grid').filter({ hasText: 'انتظار التصحيح' }).locator('button[title="حذف السجل نهائياً"]');
  await delBtn.first().click();
  await page.waitForTimeout(800);
  check('29. 🗑 حذف السجل يحذفه من قاعدة البيانات', !allSubs().some(s => s.status === 'submitted'));
  check('30. السجلات الأخرى لم تُمس بالحذف', allSubs().some(s => s.status === 'pass'));

  /* ═══ خلاصة ═══ */
  check('31. لا أخطاء JavaScript طوال الرحلة كاملة', pageErrors.length === 0, pageErrors.slice(0, 2).join(' | '));

  const failed = results.filter(r => !r.ok);
  console.log('\n══════════════════');
  console.log(`النتيجة: ${results.length - failed.length}/${results.length} فحصاً ناجحاً`);
  if (failed.length) { console.log('فشل:'); failed.forEach(f => console.log('  ✗', f.name, f.extra)); }
  console.log('حوارات التأكيد التي ظهرت:', dialogs.length);

  await browser.close();
  server.close();
  process.exit(failed.length ? 1 : 0);
})().catch(e => { console.error('TEST CRASH:', e); process.exit(2); });
