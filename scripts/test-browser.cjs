const path = require('node:path');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const net = require('node:net');
const { spawn, execFileSync } = require('node:child_process');

module.exports = async function runBrowser({ root, backendOrigin, fixture, User, Order, Ticket, admin, coupon }) {
  const { chromium, expect } = require(path.join(root, 'frontend/node_modules/@playwright/test'));
  const server = net.createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  const child = spawn(process.execPath, [path.join(root, 'frontend/node_modules/next/dist/bin/next'), 'dev', '-p', String(port)], {
    cwd: path.join(root, 'frontend'), windowsHide: true,
    env: { ...process.env, NODE_ENV: 'development', NEXT_PUBLIC_API_URL: '/api/v1', API_PROXY_TARGET: backendOrigin, NEXT_TELEMETRY_DISABLED: '1' },
    stdio: 'ignore',
  });
  const origin = `http://localhost:${port}`;
  let browser;
  const results = [];
  const folder = path.join(root, 'testing/evidence');
  fs.mkdirSync(folder, { recursive: true });
  try {
    let ready = false;
    for (let i = 0; i < 90; i++) {
      try { if ((await fetch(origin + '/login')).ok) { ready = true; break; } } catch { /* wait for Next.js */ }
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    if (!ready) throw new Error('Browser frontend did not start');
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    page.on('dialog', dialog => dialog.accept());
    page.setDefaultTimeout(20000);
    async function check(id, title, action) {
      try { await action(); results.push({ id, title, status: 'PASS' }); console.log(`${id} PASS ${title}`); }
      catch (error) { results.push({ id, title, status: 'FAIL', evidence: error.message }); console.log(`${id} FAIL ${title}: ${error.message}`); }
    }
    const email = 'browser.qa@example.test';
    await check('UI-01', 'Browser rejects invalid email (TC-03)', async () => {
      await page.goto(origin + '/register');
      await page.locator('input[type="text"]').last().fill('Browser QA');
      await page.locator('input[type="email"]').fill('abc');
      await page.locator('input[type="tel"]').fill('0999999999');
      await page.locator('input[type="password"]').fill('Test123!');
      await page.locator('button[type="submit"]').click();
      assert(await page.locator('input[type="email"]').evaluate(input => input.validity.typeMismatch));
      assert.equal(await User.countDocuments({ email: 'abc' }), 0);
    });
    await check('UI-02', 'Registration and persistent login (TC-01/04)', async () => {
      await page.locator('input[type="email"]').fill(email);
      await page.locator('button[type="submit"]').click();
      await expect(page).toHaveURL(origin + '/');
      await expect.poll(() => User.countDocuments({ email })).toBe(1);
      await page.reload();
      await expect(page.getByText('Browser QA', { exact: true }).first()).toBeVisible();
    });
    const f = await fixture('GA', 8, 300000, 'Ha Noi', 'Browser QA Concert');
    const discount = await coupon({ code: 'BROWSER10' });
    await check('UI-03', 'Search and empty-state message (TC-11)', async () => {
      await page.goto(origin);
      const search = page.locator('input[placeholder*="Tìm kiếm"]').first();
      await search.fill('Browser QA Concert');
      await expect(page.getByText('Browser QA Concert', { exact: true }).first()).toBeVisible();
      await search.fill('NoBrowserConcert987');
      await expect(page.getByText('Không tìm thấy sự kiện nào phù hợp với từ khóa.')).toBeVisible();
    });
    await check('UI-04', 'Wishlist persists and removes (TC-13)', async () => {
      await page.locator('input[placeholder*="Tìm kiếm"]').first().fill('Browser QA Concert');
      await page.getByTitle('Yêu thích sự kiện').first().click();
      await page.goto(origin + '/wishlist');
      await expect(page.getByText('Browser QA Concert', { exact: true })).toBeVisible();
      await page.reload();
      await expect(page.getByText('Browser QA Concert', { exact: true })).toBeVisible();
      const doc = await User.findOne({ email });
      assert.equal(doc.wishlist.filter(id => String(id) === String(f.event._id)).length, 1);
      await page.getByTitle('Xóa khỏi yêu thích').click();
      await expect.poll(async () => (await User.findOne({ email })).wishlist.length).toBe(0);
    });
    await check('UI-05', 'Event detail and GA hold (TC-10/14/19)', async () => {
      await page.goto(origin + '/events/' + f.event.slug);
      await expect(page.getByRole('heading', { name: 'Browser QA Concert', exact: true })).toBeVisible();
      await page.getByRole('button', { name: '+', exact: true }).click();
      await page.getByRole('button', { name: '+', exact: true }).click();
      const hold = page.getByRole('button', { name: /Giữ|Đặt|Thanh Toán/i }).filter({ hasText: /vé|Vé|thanh toán|Thanh Toán/ }).last();
      await hold.click();
      await expect(page).toHaveURL(/\/checkout\/[a-f\d]{24}$/);
      const id = page.url().split('/').at(-1);
      const order = await Order.findById(id);
      assert.equal(order.subtotal, 600000);
      assert.equal(order.items[0].quantity, 2);
    });
    await check('UI-06', 'Coupon amount shown in checkout (TC-24)', async () => {
      await page.locator('input[type="text"]').last().fill(discount.code);
      await page.getByRole('button', { name: /Áp dụng/i }).click();
      const id = page.url().split('/').at(-1);
      await expect.poll(async () => (await Order.findById(id)).totalAmount).toBe(550000);
      await expect(page.getByText(/550\.000/).first()).toBeVisible();
      await page.screenshot({ path: path.join(folder, 'checkout.png'), fullPage: true });
    });
    await check('UI-07', 'Payment and issued tickets (TC-27)', async () => {
      await page.getByRole('button', { name: /Thanh Toán/i }).last().click();
      await page.getByRole('button', { name: /Xác Nhận Quét Mã VNPAY Sandbox Thành Công/i }).click();
      await expect(page).toHaveURL(/\/my-tickets/);
      const doc = await User.findOne({ email });
      assert.equal(await Ticket.countDocuments({ userId: doc._id, status: 'valid' }), 2);
      await expect(page.getByText('Browser QA Concert', { exact: true }).first()).toBeVisible();
    });
    await check('UI-08', 'Admin check-in displays ticket and rejects replay (TC-29/30)', async () => {
      const doc = await User.findOne({ email });
      const ticket = await Ticket.findOne({ userId: doc._id });
      assert(ticket, 'UI payment must have produced a ticket');
      await page.evaluate(({ token, user }) => { localStorage.setItem('token', token); localStorage.setItem('user', JSON.stringify(user)); }, { token: admin.token, user: { id: String(admin.doc._id), email: admin.doc.email, fullName: admin.doc.fullName, role: 'admin' } });
      await page.goto(origin + '/checkin');
      await page.locator('textarea').fill(ticket.qrToken);
      await page.getByRole('button', { name: /Check-in Ngay/i }).click();
      await expect(page.getByText('CHECK-IN THÀNH CÔNG', { exact: true })).toBeVisible();
      await expect(page.getByText('#' + ticket.ticketCode, { exact: true })).toBeVisible();
      await expect(page.getByText('Browser QA Concert', { exact: true })).toBeVisible();
      await page.screenshot({ path: path.join(folder, 'checkin.png'), fullPage: true });
      await page.locator('textarea').fill(ticket.qrToken);
      await page.getByRole('button', { name: /Check-in Ngay/i }).click();
      await expect(page.getByText('TỪ CHỐI CHECK-IN', { exact: true })).toBeVisible();
    });
    await check('UI-09', 'React escaping and CSP block XSS (BM-04)', async () => {
      const payload = '<img src=x onerror=window.__qa_xss=1>';
      await f.event.constructor.updateOne({ _id: f.event._id }, { title: payload });
      const response = await page.goto(origin + '/events/' + f.event.slug);
      const csp = response.headers()['content-security-policy'];
      assert(csp.includes("'nonce-") && csp.includes("'strict-dynamic'"));
      await expect(page.getByRole('heading', { name: payload, exact: true })).toBeVisible();
      assert.equal(await page.evaluate(() => window.__qa_xss), undefined);
      await page.evaluate(() => { const image = document.createElement('img'); image.src = '/missing-qa-image'; image.setAttribute('onerror', 'window.__qa_xss=1'); document.body.appendChild(image); });
      await page.waitForTimeout(500);
      assert.equal(await page.evaluate(() => window.__qa_xss), undefined);
    });
    await check('UI-10', 'Privacy link is usable (BM-11)', async () => {
      await page.getByRole('link', { name: 'Chính sách bảo mật', exact: true }).click();
      await expect(page).toHaveURL(origin + '/privacy');
      await expect(page.getByRole('heading', { name: 'Chính sách bảo mật dữ liệu' })).toBeVisible();
      await page.screenshot({ path: path.join(folder, 'privacy.png'), fullPage: true });
    });
  } finally {
    if (browser) await browser.close();
    if (process.platform === 'win32') {
      try { execFileSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }); } catch { /* child already exited */ }
    } else child.kill('SIGTERM');
  }
  fs.writeFileSync(path.join(root, 'testing/results/browser.json'), JSON.stringify({ testedAt: new Date().toISOString(), browser: 'Headless Chromium; actual Next.js development server and isolated API', results }, null, 2) + '\n');
  return results;
};
