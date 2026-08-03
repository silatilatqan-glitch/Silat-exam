/* لقطات شاشة للتصميم الجديد v26 — قاعدة بيانات وهمية + خطوط محلية */
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');
const PORT = 8155;
const ROOT = path.join(__dirname, '..');

const LIBS = {
  'react.production.min.js': 'node_modules/react/umd/react.production.min.js',
  'react-dom.production.min.js': 'node_modules/react-dom/umd/react-dom.production.min.js',
  'babel.min.js': 'node_modules/@babel/standalone/babel.min.js',
  'supabase.js': 'node_modules/@supabase/supabase-js/dist/umd/supabase.js',
  'firebase-app-compat.js': 'node_modules/firebase/firebase-app-compat.js',
  'firebase-firestore-compat.js': 'node_modules/firebase/firebase-firestore-compat.js',
  'qrcode.min.js': 'node_modules/qrcodejs2/qrcode.min.js',
};
const F = 'node_modules/@fontsource/ibm-plex-sans-arabic/files/';
const A = 'node_modules/@fontsource/amiri/files/';
const fontCSS = `
@font-face{font-family:'IBM Plex Sans Arabic';font-weight:400;src:url('http://localhost:${PORT}/__f/plex400') format('woff2')}
@font-face{font-family:'IBM Plex Sans Arabic';font-weight:500;src:url('http://localhost:${PORT}/__f/plex400') format('woff2')}
@font-face{font-family:'IBM Plex Sans Arabic';font-weight:600;src:url('http://localhost:${PORT}/__f/plex700') format('woff2')}
@font-face{font-family:'IBM Plex Sans Arabic';font-weight:700;src:url('http://localhost:${PORT}/__f/plex700') format('woff2')}
@font-face{font-family:'Amiri';font-weight:400;src:url('http://localhost:${PORT}/__f/amiri400') format('woff2')}
@font-face{font-family:'Amiri';font-weight:700;src:url('http://localhost:${PORT}/__f/amiri700') format('woff2')}`;
const FONTFILES = {
  '/__f/plex400': F + 'ibm-plex-sans-arabic-arabic-400-normal.woff2',
  '/__f/plex700': F + 'ibm-plex-sans-arabic-arabic-700-normal.woff2',
  '/__f/amiri400': A + 'amiri-arabic-400-normal.woff2',
  '/__f/amiri700': A + 'amiri-arabic-700-normal.woff2',
};

/* قاعدة وهمية مع سجل ناجح جاهز للشهادة */
const db = { exam_subs: {}, exam_meta: {}, exam_courses: {} };
db.exam_subs['certdemo1'] = { id: 'certdemo1', data: {
  id: 'certdemo1', studentId: '1234567890', studentName: 'Mohammed Ahmed Ali',
  studentBirthdate: '1995-05-10', studentPhone: '0501234567', studentOrderNum: 'ORD-1234',
  courseId: 'osha30', courseTitle: 'الأوشا الأمريكية 30 ساعة',
  scenarioId: 's_osha30_a', scenarioTitle: 'السيناريو الأول + السيناريو الثاني',
  completedScenarioIds: ['s_osha30_a', 's_osha30_b'], isMultiScenario: true,
  status: 'pass', totalScore: 172, maxScore: 200, scores: {}, answers: {},
  startTime: '2026-08-01T08:00:00Z', submittedAt: '2026-08-01T14:30:00Z',
  reviewedAt: '2026-08-02T10:00:00Z', certId: 'CERT-CERTDEMO', resultSeen: true,
}, updated_at: '2026-08-02T10:00:00Z' };

function handleSupabase(route) {
  const req = route.request();
  const url = new URL(req.url());
  const table = url.pathname.split('/')[3];
  const method = req.method();
  const q = url.searchParams;
  const single = (req.headers()['accept'] || '').includes('pgrst.object');
  const json = (s, b) => route.fulfill({ status: s, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(b) });
  if (method === 'OPTIONS') return route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
  if (table === 'exam_subs') {
    if (method === 'GET') {
      let rows = Object.values(db.exam_subs);
      const idEq = q.get('id');
      if (idEq && idEq.startsWith('eq.')) rows = rows.filter(r => r.id === idEq.slice(3));
      const cs = q.get('data');
      if (cs && cs.startsWith('cs.')) { try { const c = JSON.parse(decodeURIComponent(cs.slice(3))); rows = rows.filter(r => Object.entries(c).every(([k, v]) => r.data[k] === v)); } catch (e) {} }
      rows = rows.map(r => ({ data: r.data }));
      if (single) return rows.length === 1 ? json(200, rows[0]) : json(406, {});
      return json(200, rows);
    }
    if (method === 'POST') { const b = JSON.parse(req.postData() || '{}'); (Array.isArray(b) ? b : [b]).forEach(r => { db.exam_subs[r.id] = r; }); return json(201, []); }
    if (method === 'DELETE') return json(204, []);
  }
  if (table === 'exam_meta') {
    if (method === 'GET') {
      const k = (q.get('key') || '').replace('eq.', '');
      const rows = db.exam_meta[k] !== undefined ? [{ value: db.exam_meta[k] }] : [];
      if (single) return rows.length === 1 ? json(200, rows[0]) : json(406, {});
      return json(200, rows);
    }
    if (method === 'POST') { const b = JSON.parse(req.postData() || '{}'); (Array.isArray(b) ? b : [b]).forEach(r => { db.exam_meta[r.key] = r.value; }); return json(201, []); }
    if (method === 'PATCH') return json(200, []);
  }
  if (table === 'exam_courses') { if (method === 'GET') return json(200, []); return json(201, []); }
  return json(200, []);
}

(async () => {
  const server = http.createServer((req, res) => {
    if (FONTFILES[req.url]) { res.setHeader('content-type', 'font/woff2'); return res.end(fs.readFileSync(path.join(ROOT, FONTFILES[req.url]))); }
    res.setHeader('content-type', 'text/html; charset=utf-8');
    res.end(fs.readFileSync(path.join(ROOT, 'index.html')));
  }).listen(PORT);

  const exe = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
  const browser = await chromium.launch({ executablePath: fs.existsSync(exe) ? exe : undefined });

  const mkpage = async (viewport) => {
    const page = await browser.newPage({ viewport });
    page.on('dialog', d => d.accept());
    await page.route(/fonts\.googleapis\.com/, r => r.fulfill({ status: 200, contentType: 'text/css', body: fontCSS }));
    await page.route(/fonts\.gstatic\.com/, r => r.abort());
    await page.route(/cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|www\.gstatic\.com/, route => {
      const u = route.request().url();
      const key = Object.keys(LIBS).find(k => u.endsWith(k));
      if (key) return route.fulfill({ status: 200, contentType: 'application/javascript', body: fs.readFileSync(path.join(ROOT, LIBS[key])) });
      return route.fulfill({ status: 200, contentType: 'application/javascript', body: '' });
    });
    await page.route(/supabase\.co/, handleSupabase);
    await page.route(/firestore\.googleapis\.com|firebaseio\.com/, r => r.abort());
    return page;
  };

  const page = await mkpage({ width: 1280, height: 920 });
  const shot = (n) => page.screenshot({ path: path.join(__dirname, `s_${n}.png`) });

  await page.goto(`http://localhost:${PORT}/`);
  await page.waitForSelector('text=نظام الاختبارات التحليلية', { timeout: 20000 });
  await page.waitForTimeout(900);
  await shot('1_home');

  /* تسجيل الدخول + أخطاء الحقول */
  await page.click('text=دخول المتدرب');
  await page.waitForTimeout(400);
  await page.click('button:has-text("دخول ←")');
  await page.waitForTimeout(400);
  await shot('2_login_errors');

  await page.fill('input[placeholder="1xxxxxxxxx"]', '1234567890');
  await page.fill('input[placeholder="Mohammed Ahmed Ali"]', 'Mohammed Ahmed Ali');
  await page.fill('input[type="date"]', '1995-05-10');
  await page.fill('input[placeholder="05xxxxxxxx"]', '0501234567');
  await page.fill('input[placeholder="ORD-XXXXXXXX"]', 'ORD-1234');
  await page.click('button:has-text("دخول ←")');
  await page.waitForSelector('text=اختر الدورة', { timeout: 10000 });
  await page.waitForTimeout(500);
  await shot('3_courses');

  /* شاشة الاختبار */
  await page.click('button:has-text("الأوشا هازووبر 40 ساعة")');
  await page.waitForSelector('input[placeholder="أدخل الرمز هنا..."]');
  await page.fill('input[placeholder="أدخل الرمز هنا..."]', 'HAWZOPER002');
  await page.click('button:has-text("تحقق من الرمز ←")');
  await page.waitForSelector('text=اختر السيناريو');
  await page.click('button:has-text("بدء هذا السيناريو ←")');
  await page.waitForSelector('textarea');
  await page.fill('textarea', 'إجابة تحليلية تجريبية للمعاينة البصرية — نص يتجاوز خمسين حرفاً بوضوح ليكتمل مؤشر التقدم ويظهر شكل الشاشة الحقيقي أثناء الكتابة الفعلية للمتدرب.');
  await page.waitForTimeout(400);
  await shot('4_exam');

  /* لوحة المدرب + الشهادة */
  const p2 = await mkpage({ width: 1280, height: 920 });
  await p2.goto(`http://localhost:${PORT}/`);
  await p2.waitForSelector('text=دخول المدرب', { timeout: 20000 });
  await p2.click('text=دخول المدرب');
  await p2.fill('input[placeholder="كلمة مرور المدرب"]', 'HSE@2024');
  await p2.click('button:has-text("دخول")');
  await p2.waitForSelector('text=لوحة تحكم المدرب');
  await p2.waitForTimeout(900);
  await p2.screenshot({ path: path.join(__dirname, 's_5_dashboard.png') });

  await p2.click('button:has-text("🏅 شهادة")');
  await p2.waitForSelector('text=CERTIFICATE OF ACHIEVEMENT', { timeout: 10000 });
  await p2.waitForTimeout(1200);
  const sheet = await p2.$('.cert-sheet');
  await sheet.screenshot({ path: path.join(__dirname, 's_6_certificate.png') });

  /* جوال */
  const m = await mkpage({ width: 390, height: 844 });
  await m.goto(`http://localhost:${PORT}/`);
  await m.waitForSelector('text=نظام الاختبارات التحليلية', { timeout: 20000 });
  await m.waitForTimeout(700);
  await m.screenshot({ path: path.join(__dirname, 's_7_mobile_home.png') });

  await browser.close(); server.close();
  console.log('screenshots done');
})().catch(e => { console.error('CRASH:', e.message); process.exit(1); });
