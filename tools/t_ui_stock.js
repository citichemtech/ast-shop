/*
 * ขับหน้าสต๊อก / นำเข้าออเดอร์ Shopee ด้วยเบราว์เซอร์จริง
 *
 *   python3 tools/make_preview.py && node tools/t_ui_stock.js
 *
 * ทดสอบทางเดินที่พนักงานใช้จริงตั้งแต่ต้นจนจบ
 *   วางไฟล์ Shopee → ระบบอ่าน → ตรวจ → เจอของที่ยังจับคู่ไม่ได้ → ไปจับคู่ →
 *   กลับมาตรวจใหม่ → ตัดสต๊อก → ตรวจซ้ำแล้วต้องไม่ให้ตัดซ้ำอีก
 *
 * ข้อสอบสำคัญ: ปุ่ม "ตัดสต๊อก" ต้องไม่โผล่เลยจนกว่าจะตรวจผ่านและที่ว่างในชีทพอ
 */
'use strict';
var path = require('path');
var { chromium } = require('/opt/node22/lib/node_modules/playwright');

var FILE = 'file://' + path.join(__dirname, '..', 'out', process.env.PV || 'preview.html');
var fails = 0;

function eq(label, got, want) {
  var ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log((ok ? '  ok   ' : '  FAIL ') + label +
    '  ได้ ' + JSON.stringify(got) + (ok ? '' : '  ควรได้ ' + JSON.stringify(want)));
}
function truthy(label, got) {
  if (!got) fails++;
  console.log((got ? '  ok   ' : '  FAIL ') + label + '  ได้ ' + JSON.stringify(got));
}

/* ไฟล์ Shopee จำลอง คั่นด้วย tab เหมือนที่ก๊อปออกมาจาก Excel
   SP-141 จับคู่ไว้แล้ว · SP-PACK10 จับคู่ไว้แล้ว (แพ็ค 10) · SP-999 ยังไม่ได้จับคู่ */
var SHEET = [
  ['หมายเลขคำสั่งซื้อ', 'สถานะการสั่งซื้อ', 'เวลาการสั่งซื้อ', 'ชื่อสินค้า', 'ชื่อตัวเลือกสินค้า',
   'เลขอ้างอิง SKU (ตัวเลือกสินค้า)', 'จำนวน', 'ราคาขาย', 'ยอดขายสินค้า(฿)', 'ค่าคอมมิชชั่น',
   'ชื่อผู้รับ', 'หมายเลขโทรศัพท์', 'ที่อยู่ในการจัดส่ง', 'ตัวเลือกการจัดส่ง', 'หมายเลขติดตามพัสดุ*'],
  ['2609TEST01', 'ที่ต้องจัดส่ง', '2026-09-01 10:00', 'ดอกกัดข้าวโพด', '3.0 มม.', 'SP-141',
   '4', '129', '516', '51.6', 'ลูกค้าทดสอบ ก', '0800000001', '1 ถ.ทดสอบ กทม 10110',
   'SPX Express', 'SPX001'],
  ['2609TEST02', 'ที่ต้องจัดส่ง', '2026-09-01 11:00', 'ชุดดอกกัด', 'แพ็ค 10', 'SP-PACK10',
   '1', '750', '750', '75', 'ลูกค้าทดสอบ ข', '0800000002', '2 ถ.ทดสอบ กทม 10110',
   'SPX Express', 'SPX002'],
  ['2609TEST03', 'ยังไม่ได้ชำระเงิน', '2026-09-01 12:00', 'ดอกกัดข้าวโพด', '3.0 มม.', 'SP-141',
   '2', '129', '258', '25.8', 'ลูกค้าทดสอบ ค', '0800000003', '3 ถ.ทดสอบ', 'SPX Express', ''],
  ['2609TEST04', 'ที่ต้องจัดส่ง', '2026-09-01 13:00', 'ของที่ยังไม่ได้จับคู่', 'ไซซ์เดียว', 'SP-999',
   '1', '99', '99', '9.9', 'ลูกค้าทดสอบ ง', '0800000004', '4 ถ.ทดสอบ', 'SPX Express', '']
].map(function (r) { return r.join('\t'); }).join('\n');

(async function () {
  var browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--no-sandbox']
  });
  var page = await browser.newPage({ viewport: { width: 390, height: 820 } });
  var errors = [];
  page.on('pageerror', function (e) { errors.push(e.message); });
  var EXT = /fonts\.(googleapis|gstatic)\.com|cdnjs\.cloudflare\.com/;
  page.on('console', function (m) {
    var where = (m.location() && m.location().url) || '';
    if (m.type() === 'error' && !EXT.test(where) && !EXT.test(m.text())) errors.push(m.text());
  });
  /* กล่องยืนยันตอนกดตัดสต๊อก — ในเบราว์เซอร์จริงคนกดตกลง ไม่ใช่โดนปิดอัตโนมัติ */
  page.on('dialog', function (d) { d.accept(); });

  await page.goto(FILE);
  await page.waitForSelector('#form', { state: 'visible', timeout: 20000 });

  /* ---------- 1. เข้าแท็บสต๊อก ---------- */
  console.log('\n1. หน้าสต๊อกสินค้า');
  await page.click('.tabs button[data-go="stock"]');
  await page.waitForSelector('#stock-body .row', { timeout: 20000 });
  truthy('มีหัวข้อของที่ต้องสั่งเพิ่ม',
    /ต้องสั่งเพิ่ม/.test(await page.textContent('#stock-body')));
  truthy('เตือนล็อตใกล้หมดอายุ',
    /ต้องรีบระบาย/.test(await page.textContent('#stock-body')));
  truthy('บอกที่ว่างในชีทออเดอร์เป็นจำนวนใบ',
    /ที่ว่างในชีทออเดอร์[\s\S]*120 ใบ/.test(await page.textContent('#stock-body')));
  await page.fill('#stk-q', 'CHEM');
  await page.waitForTimeout(120);
  eq('ค้นหาสินค้าได้', await page.locator('#stk-list .row').count(), 1);

  /* ---------- 2. นำเข้าไฟล์ Shopee ---------- */
  console.log('\n2. นำเข้าออเดอร์จากไฟล์ Shopee');
  await page.click('#stock-nav button[data-s="imp"]');
  await page.click('#imp-paste-open');
  await page.fill('#imp-paste', SHEET);
  await page.click('#imp-paste-go');
  await page.waitForSelector('#imp-state .msg.ok', { timeout: 20000 });
  truthy('อ่านได้ 4 ใบ', /4 ใบ/.test(await page.textContent('#imp-state')));
  truthy('บอกด้วยว่าแต่ละสถานะมีกี่ใบ',
    /ที่ต้องจัดส่ง 3 ใบ/.test(await page.textContent('#imp-state')));

  await page.click('#imp-cols-open');
  await page.waitForTimeout(150);
  eq('จับคอลัมน์จำนวนได้ถูก',
    await page.inputValue('#imp-cols select[data-f="qty"]'), '6');
  eq('จับคอลัมน์รหัส SKU ฝั่ง Shopee ได้ถูก',
    await page.inputValue('#imp-cols select[data-f="code"]'), '5');
  await page.click('#imp-cols-open');

  /* ---------- 3. ตรวจก่อนตัด ---------- */
  console.log('\n3. ตรวจก่อนตัดสต๊อก');
  eq('ยังไม่ตรวจ ปุ่มตัดสต๊อกต้องยังไม่โผล่',
    await page.locator('#imp-commit').isVisible(), false);
  await page.click('#imp-preview');
  await page.waitForSelector('#imp-result .kpis', { timeout: 20000 });
  var res = await page.textContent('#imp-result');
  truthy('พร้อมตัด 2 ใบ', /พร้อมตัดสต๊อก[\s\S]*2 ใบ/.test(res));
  truthy('กันใบที่ยังจับคู่ SKU ไม่ได้ไว้', /กันไว้ ไม่ตัด 1 ใบ/.test(res));
  truthy('ข้ามใบที่ยังไม่จ่ายเงิน โดยบอกเหตุผล',
    /ข้าม 1 ใบ/.test(res) && /ไม่อยู่ในกลุ่มที่ตั้งไว้ให้ตัดสต๊อก/.test(res));
  truthy('บอกรายการที่ยังจับคู่ไม่ได้เป็นชื่อ ๆ', /SP-999/.test(res));
  truthy('สินค้าจัดเซตคูณจำนวนแล้ว (แพ็ค 10 → 10 ชิ้น)', /× 10/.test(res));
  eq('ตรวจผ่านแล้วปุ่มตัดสต๊อกโผล่',
    await page.locator('#imp-commit').isVisible(), true);
  truthy('ปุ่มบอกจำนวนใบที่จะตัด',
    /ตัดสต๊อก 2 ใบ/.test(await page.textContent('#imp-commit')));

  /* ---------- 4. จับคู่ SKU ที่ยังขาด ---------- */
  console.log('\n4. จับคู่ SKU ที่ยังขาด');
  await page.click('#pv-tomap');
  await page.waitForSelector('#map-list .it', { timeout: 20000 });
  eq('รหัสที่ยังจับคู่ไม่ได้ถูกเติมมาให้แล้ว',
    await page.inputValue('#map-list .it .m-code'), 'SP-999');
  await page.selectOption('#map-list .it .m-sku', 'SKU-143');
  await page.click('#map-save');
  await page.waitForTimeout(400);
  var sent = await page.evaluate(function () {
    return window.SENT.filter(function (x) { return x && x.fn === 'saveSkuMap'; });
  });
  eq('ส่งการจับคู่ขึ้นชีท 1 แถว', sent.length && sent[0].rows.length, 1);
  eq('ส่ง SKU ที่เลือกไปถูกตัว', sent[0].rows[0].sku, 'SKU-143');
  eq('แถวใหม่ไม่มีเลขแถว (ให้หลังบ้านหาแถวว่างเอง)', sent[0].rows[0].row, 0);

  /* ---------- 5. ตรวจใหม่แล้วตัดจริง ---------- */
  console.log('\n5. ตัดสต๊อก');
  await page.click('#stock-nav button[data-s="imp"]');
  await page.click('#imp-preview');
  await page.waitForSelector('#imp-result .kpis', { timeout: 20000 });
  truthy('จับคู่แล้ว ใบที่เคยถูกกันไว้กลับมาพร้อมตัด',
    /พร้อมตัดสต๊อก[\s\S]*3 ใบ/.test(await page.textContent('#imp-result')));

  await page.click('#imp-commit');
  await page.waitForSelector('#ok.on', { timeout: 20000 });
  truthy('บอกผลว่าตัดไปกี่ใบ', /ตัดสต๊อกแล้ว 3 ใบ/.test(await page.textContent('#ok')));
  var commit = await page.evaluate(function () {
    return window.SENT.filter(function (x) { return x && x.fn === 'commitShopee'; });
  });
  eq('ส่งขึ้นตัดจริง 3 ใบ', commit.length && commit[0].n, 3);
  eq('ส่งช่องทางขายเป็น Shopee', commit[0].opts.channel, 'Shopee');
  eq('ส่งกลุ่มสถานะที่ตั้งไว้ไปด้วย', commit[0].opts.cutKinds, ['toship', 'shipped', 'done']);
  eq('ค่าตั้งต้นคือไม่หักค่าธรรมเนียมออกจากยอดขาย', commit[0].opts.feeMode, 'none');

  /* ---------- 6. กันตัดซ้ำ ---------- */
  console.log('\n6. นำเข้าไฟล์เดิมซ้ำ');
  await page.waitForTimeout(600);
  var again = await page.textContent('#imp-result');
  truthy('ตรวจซ้ำอัตโนมัติแล้วบอกว่านำเข้าไปแล้ว', /นำเข้าไปแล้วเป็นออเดอร์/.test(again));
  eq('ไม่มีใบไหนให้ตัดอีก ปุ่มตัดสต๊อกหายไป',
    await page.locator('#imp-commit').isVisible(), false);

  /* ---------- 7. ประวัติ ---------- */
  console.log('\n7. ประวัติรับเข้า–ขายออก–คืนสินค้า');
  await page.click('#stock-nav button[data-s="moves"]');
  await page.waitForSelector('#mv-list .row', { timeout: 20000 });
  var mv = await page.textContent('#mv-list');
  truthy('มีรับเข้า', /รับเข้า/.test(mv));
  truthy('มีขายออก', /ขายออก/.test(mv));
  truthy('มีคืนสินค้า', /คืนสินค้า/.test(mv));
  truthy('ขายออกแสดงเป็นจำนวนติดลบ', /-10/.test(mv));

  /* ---------- 8. คืนสินค้าเข้าสต๊อก ---------- */
  console.log('\n8. คืนสินค้า');
  await page.click('.tabs button[data-go="list"]');
  await page.waitForSelector('#list [data-rt]', { timeout: 20000 });
  await page.click('#list [data-rt]');
  await page.waitForSelector('#rt-go', { timeout: 20000 });
  await page.click('#rt-go');
  await page.waitForTimeout(300);
  truthy('คืนโดยไม่ใส่เหตุผลไม่ได้',
    /เหตุผล/.test(await page.textContent('#toast')));
  await page.fill('#rt-why', 'ลูกค้าตีกลับ ของไม่ตรงรุ่น');
  await page.click('#rt-go');
  await page.waitForTimeout(400);
  var ret = await page.evaluate(function () {
    return window.SENT.filter(function (x) { return x && x.fn === 'recordReturn'; });
  });
  eq('ส่งคำสั่งคืนของขึ้นชีท', ret.length, 1);
  eq('ส่งเหตุผลไปด้วย', ret[0].p.why, 'ลูกค้าตีกลับ ของไม่ตรงรุ่น');
  truthy('ส่งจำนวนที่คืนไปด้วย', ret[0].p.items.length > 0 && ret[0].p.items[0].qty > 0);

  /* ---------- 9. ช่องเชื่อม API ---------- */
  console.log('\n9. ช่องเชื่อม Shopee API');
  await page.click('.tabs button[data-go="stock"]');
  await page.click('#stock-nav button[data-s="imp"]');
  await page.click('#imp-api');
  await page.waitForSelector('#modal.on', { timeout: 20000 });
  var api = await page.textContent('#m-body');
  truthy('บอกว่ายังไม่ได้เชื่อม', /ยังไม่ได้เชื่อม API/.test(api));
  truthy('บอกว่าต้องใส่ค่าอะไรบ้าง', /SHOPEE_PARTNER_ID/.test(api));
  await page.click('#m-close');

  /* ---------- 10. ความสะอาด ---------- */
  console.log('\n10. ความสะอาดของหน้าเว็บ');
  eq('ไม่มี javascript error เลย', errors, []);

  await browser.close();
  console.log('\n' + (fails ? 'ตก ' + fails + ' ข้อ' : 'ผ่านทั้งหมด'));
  process.exit(fails ? 1 : 0);
})().catch(function (e) {
  console.error('\nพังกลางทาง: ' + e.message);
  process.exit(1);
});
