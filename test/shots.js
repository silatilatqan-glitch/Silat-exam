const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');
const PORT = 8124;
const LIBS = {
  'react.production.min.js': 'node_modules/react/umd/react.production.min.js',
  'react-dom.production.min.js': 'node_modules/react-dom/umd/react-dom.production.min.js',
  'babel.min.js': 'node_modules/@babel/standalone/babel.min.js',
  'supabase.js': 'node_modules/@supabase/supabase-js/dist/umd/supabase.js',
  'firebase-app-compat.js': 'node_modules/firebase/firebase-app-compat.js',
  'firebase-firestore-compat.js': 'node_modules/firebase/firebase-firestore-compat.js',
};
(async () => {
  const server = http.createServer((req, res) => {
    res.setHeader('content-type', 'text/html; charset=utf-8');
    res.end(fs.readFileSync('/home/claude/exam-site/index.html'));
  }).listen(PORT);
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.route(/cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|www\.gstatic\.com/, route => {
    const u = route.request().url();
    const key = Object.keys(LIBS).find(k => u.endsWith(k));
    if (key) return route.fulfill({ status: 200, contentType: 'application/javascript', body: fs.readFileSync(path.join('/home/claude/exam-site', LIBS[key])) });
    return route.fulfill({ status: 200, contentType: 'application/javascript', body: '' });
  });
  await page.route(/supabase\.co/, r => {
    const single = (r.request().headers()['accept'] || '').includes('pgrst.object');
    r.fulfill({ status: single ? 406 : 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: single ? '{}' : '[]' });
  });
  await page.route(/firestore|googleapis/, r => r.abort());
  await page.goto(`http://localhost:${PORT}/`);
  await page.waitForSelector('text=نظام الاختبارات التحليلية', { timeout: 20000 });
  await page.screenshot({ path: 'test/home.png' });
  await page.click('text=دخول المتدرب');
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'test/login.png' });
  await browser.close(); server.close();
  console.log('done');
})();
