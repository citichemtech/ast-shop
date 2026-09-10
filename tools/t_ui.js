/*
 * ขับหน้าคีย์ออเดอร์ด้วยเบราว์เซอร์จริง
 *
 *   python3 tools/make_preview.py && node tools/t_ui.js
 *
 * ทดสอบทางเดินที่พนักงานใช้จริง: วางข้อความจากไลน์ → ตรวจ → ใช้ข้อมูล →
 * แก้จำนวน → ดูยอดรวม → กดบันทึก → ดูว่าส่งอะไรขึ้นชีท → พิมพ์ใบปะหน้า
 * และที่สำคัญที่สุด: บันทึกไม่สำเร็จแล้วข้อมูลในฟอร์มต้องไม่หาย
 */
'use strict';
var path = require('path');
var fs = require('fs');
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

var SAMPLE = `🧾 สรุปคำสั่งซื้อ
📅 วันที่ 26/08/2026

👤 คุณ ทดสอบ ระบบใหม่
📞 0899999999

📍 ที่อยู่จัดส่ง
9/9 ถ.เมืองใหม่สมมติ
ต.ทดสอบ อ.เมือง
เชียงใหม่ 50100

⚙️ Endmill Corn Cut 2F
🔹 1.8 × 8.5 × 3.175 × 38L
💰 1 ชุด 10 ดอก 750 บาท

💵 รวมค่าสินค้า : 750 บาท
🚚 ค่าจัดส่ง : 50 บาท
✅ ยอดชำระทั้งหมด : 800 บาท`;

(async function () {
  var browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--no-sandbox']
  });
  var page = await browser.newPage({ viewport: { width: 390, height: 820 } });
  var errors = [];
  page.on('pageerror', function (e) { errors.push(e.message); });
  /* ฟอนต์ Sarabun โหลดจากอินเทอร์เน็ต เครื่องที่รันข้อสอบต่อเน็ตออกไม่ได้
     โหลดไม่ติดจึงไม่ใช่ความผิดของโค้ด และหน้าเว็บก็ถอยไปใช้ฟอนต์ในเครื่องเองอยู่แล้ว
     นับเฉพาะ error ที่เกิดจากโค้ดเราจริง ๆ */
  var EXT_FONT = /fonts\.(googleapis|gstatic)\.com/;
  page.on('console', function (m) {
    var where = (m.location() && m.location().url) || '';
    if (m.type() === 'error' && !EXT_FONT.test(where) && !EXT_FONT.test(m.text())) {
      errors.push('console: ' + m.text() + (where ? '  @' + where : ''));
    }
  });

  await page.goto(FILE);
  await page.waitForSelector('#form', { state: 'visible', timeout: 8000 });

  /* ---------- 1. เปิดมาแล้วพร้อมใช้ ---------- */
  console.log('\n1. เปิดหน้าจอ');
  eq('บอกว่าใครล็อกอินอยู่', await page.textContent('#who'), 'somchai@chem-inno-tech.com');
  eq('บอกเลขออเดอร์ถัดไป', await page.textContent('#next-no'), 'AST-26-0006');
  eq('มีแถวสินค้าให้กรอกแล้ว 1 แถว', await page.locator('#items .it').count(), 1);
  eq('มีสินค้าให้เลือกครบ 5 ตัว + บรรทัดว่าง',
    await page.locator('#items .it:first-child .i-sku option').count(), 6);
  eq('วันที่ตั้งเป็นวันนี้ให้แล้ว',
    (await page.inputValue('#f-date')).length, 10);

  /* ---------- 2. วางข้อความจากไลน์ ---------- */
  console.log('\n2. วางข้อความจากไลน์แล้วให้ระบบอ่าน');
  // กล่องวางข้อความถูกย่อเก็บไว้ ต้องกดเปิดก่อนเหมือนที่คนใช้ทำ
  await page.click('#btn-paste-open');
  await page.fill('#paste', SAMPLE);
  await page.click('#btn-parse');
  await page.waitForSelector('.pv', { timeout: 4000 });
  var pv = await page.textContent('.pv');
  truthy('ขึ้นหน้าตรวจก่อนใช้', /ตรวจก่อนใช้/.test(pv));
  truthy('อ่านชื่อลูกค้าได้', pv.indexOf('คุณ ทดสอบ ระบบใหม่') > -1);
  truthy('อ่านเบอร์ได้', pv.indexOf('0899999999') > -1);
  truthy('อ่านที่อยู่ได้ครบถึงอำเภอ', pv.indexOf('อ.เมือง') > -1);
  truthy('จับคู่สินค้าเป็นชุด 10 ดอกได้ถูกตัว', pv.indexOf('SKU-160') > -1);
  truthy('จำนวนเป็น 1 ชุด ไม่ใช่ 10', /SKU-160 · จำนวน 1/.test(pv));

  console.log('\n   ยังไม่กด "ใช้ข้อมูลนี้" ฟอร์มต้องยังว่าง');
  eq('ชื่อลูกค้ายังว่าง', await page.inputValue('#f-cust'), '');
  eq('ที่อยู่ยังว่าง', await page.inputValue('#f-addr'), '');

  /* ---------- 3. ใช้ข้อมูล ---------- */
  console.log('\n3. กดใช้ข้อมูลนี้');
  await page.click('#pv-use');
  await page.waitForTimeout(200);
  eq('ชื่อลูกค้าลงฟอร์มแล้ว', await page.inputValue('#f-cust'), 'คุณ ทดสอบ ระบบใหม่');
  eq('เบอร์โทร', await page.inputValue('#f-tel'), '0899999999');
  truthy('ที่อยู่มีอำเภอครบ (บั๊กเก่าเคยทำหาย)',
    (await page.inputValue('#f-addr')).indexOf('อ.เมือง') > -1);
  truthy('ที่อยู่มีจังหวัดและไปรษณีย์',
    /จ.เชียงใหม่ 50100/.test(await page.inputValue('#f-addr')));
  eq('วันที่จากข้อความ', await page.inputValue('#f-date'), '2026-08-26');
  eq('สินค้ากลายเป็น 1 แถว', await page.locator('#items .it').count(), 1);
  eq('เลือก SKU ให้แล้ว', await page.inputValue('#items .it:first-child .i-sku'), 'SKU-160');
  eq('จำนวน 1 ชุด', await page.inputValue('#items .it:first-child .i-qty'), '1');
  eq('ค่าจัดส่งจากข้อความ ไม่ใช่ค่าที่ระบบแนะนำ', await page.inputValue('#f-ship'), '50');
  eq('ยอดสินค้า', await page.textContent('#s-sub'), '฿750.00');
  eq('ยอดสุทธิ', await page.textContent('#s-net'), '฿800.00');
  eq('หน้าตรวจปิดไปแล้ว', await page.locator('.pv').count(), 0);

  console.log('\n   ผู้คีย์ออเดอร์ — ทั้งร้านใช้บัญชีเดียว ต้องเลือกชื่อเองว่าใครคีย์');
  eq('มีรายชื่อพนักงานให้เลือกครบ + ตัวเลือกพิมพ์ชื่อเอง',
    await page.locator('#f-by option').count(), 4);
  await page.selectOption('#f-by', 'น้องบี');
  eq('เครื่องนี้จำชื่อที่เลือกไว้',
    await page.evaluate(function () { return localStorage.getItem('ast-by'); }), 'น้องบี');

  /* คนคีย์คนใหม่ที่ยังไม่มีในชีท ต้องพิมพ์ชื่อลงไปเองได้เลย ไม่ต้องรอแก้ชีทก่อน */
  console.log('\n   พิมพ์ชื่อคนคีย์ที่ยังไม่มีในรายการ');
  await page.selectOption('#f-by', '✎ พิมพ์ชื่อเอง…');
  truthy('ช่องพิมพ์ชื่อโผล่ขึ้นมา', await page.isVisible('#f-by-new'));
  await page.fill('#f-by-new', 'น้องใหม่');
  await page.evaluate(function () { document.querySelector('#f-by-new').blur(); });
  await page.waitForTimeout(150);
  eq('ชื่อที่พิมพ์เข้าไปอยู่ในรายการแล้ว',
    await page.locator('#f-by option').count(), 5);
  eq('และถูกเลือกไว้ให้เลย', await page.inputValue('#f-by'), 'น้องใหม่');
  eq('เครื่องนี้จำชื่อที่พิมพ์เองไว้ด้วย',
    await page.evaluate(function () { return localStorage.getItem('ast-by'); }), 'น้องใหม่');
  eq('ชื่อที่พิมพ์เองถูกเก็บไว้ใช้ครั้งหน้า',
    await page.evaluate(function () { return localStorage.getItem('ast-by-list'); }),
    '["น้องใหม่"]');
  await page.selectOption('#f-by', 'น้องบี');

  /* ---------- 4. แก้ของในฟอร์ม ---------- */
  console.log('\n4. เพิ่มสินค้าอีกรายการและตั้งราคาพิเศษ');
  await page.click('#btn-add');
  await page.selectOption('#items .it:nth-child(2) .i-sku', 'SKU-141');
  await page.fill('#items .it:nth-child(2) .i-qty', '20');
  await page.waitForTimeout(120);
  eq('ราคามาตรฐานขึ้นให้เอง', await page.inputValue('#items .it:nth-child(2) .i-std'), '129.00');
  eq('ยอดรวมคิดตามราคามาตรฐาน', await page.textContent('#s-sub'), '฿3,330.00');
  await page.fill('#items .it:nth-child(2) .i-price', '110');
  await page.waitForTimeout(120);
  eq('ใส่ราคาขายจริงแล้วยอดเปลี่ยนตาม', await page.textContent('#s-sub'), '฿2,950.00');
  eq('ค่าส่งที่พิมพ์เองไม่ถูกทับ', await page.inputValue('#f-ship'), '50');

  console.log('\n   ติ๊กแถมฟรี — ราคาเป็น 0 แต่ยังต้องตัดสต๊อก');
  await page.click('#btn-add');
  await page.selectOption('#items .it:nth-child(3) .i-sku', 'SKU-161');
  await page.fill('#items .it:nth-child(3) .i-qty', '1');
  await page.waitForTimeout(120);
  var subBefore = await page.textContent('#s-sub');
  await page.check('#items .it:nth-child(3) .i-gift');
  await page.waitForTimeout(150);
  eq('ราคาขายจริงถูกตั้งเป็น 0', await page.inputValue('#items .it:nth-child(3) .i-price'), '0');
  truthy('ของแถมไม่ถูกคิดเงิน', (await page.textContent('#s-sub')) !== subBefore);
  eq('ยอดสินค้ากลับไปเท่าก่อนเพิ่มของแถม', await page.textContent('#s-sub'), '฿2,950.00');
  await page.click('#items .it:nth-child(3) .rm');
  await page.waitForTimeout(120);

  console.log('\n   เปิด VAT');
  await page.selectOption('#f-vat', 'รับ VAT');
  await page.waitForTimeout(120);
  eq('VAT 7% ของยอดสินค้า', await page.textContent('#s-vat'), '฿206.50');
  eq('ยอดสุทธิรวม VAT และค่าส่ง', await page.textContent('#s-net'), '฿3,206.50');
  await page.selectOption('#f-vat', 'ไม่รับ VAT');
  await page.waitForTimeout(120);

  /* ---------- 5. เตือนเรื่องล็อต ---------- */
  console.log('\n5. เตือนเรื่องล็อตและสต๊อก');
  await page.click('#btn-add');
  await page.selectOption('#items .it:nth-child(3) .i-sku', 'CHEM-001');
  await page.fill('#items .it:nth-child(3) .i-qty', '3');
  await page.waitForTimeout(120);
  var lot = await page.textContent('#items .it:nth-child(3) .lotline');
  truthy('บอกว่าจะตัดล็อตไหนก่อน', /จะตัดล็อต L-2610/.test(lot));
  truthy('บอกวันหมดอายุของล็อตนั้น', /หมดอายุ/.test(lot));
  await page.fill('#items .it:nth-child(3) .i-qty', '99');
  await page.waitForTimeout(120);
  var lot2 = await page.textContent('#items .it:nth-child(3) .lotline');
  truthy('สั่งเกินของในล็อต ต้องเตือนเป็นสีแดง', /ไม่พอ/.test(lot2));
  eq('คลาสเป็นแบบเตือนหนัก',
    await page.getAttribute('#items .it:nth-child(3) .lotline', 'class'), 'lotline bad');
  console.log('\n   สินค้าตัวเดียวกันสองแถว ต้องดูยอดรวมทั้งใบ');
  await page.fill('#items .it:nth-child(3) .i-qty', '8');
  await page.click('#btn-add');
  await page.selectOption('#items .it:nth-child(4) .i-sku', 'CHEM-001');
  await page.fill('#items .it:nth-child(4) .i-qty', '8');
  await page.waitForTimeout(150);
  var both = await page.textContent('#items .it:nth-child(4) .lotline');
  truthy('เตือนว่ารวมสองแถวแล้วเกินของที่มี', /ถูกสั่งหลายแถว รวม 16/.test(both));
  await page.click('#items .it:nth-child(4) .rm');
  await page.waitForTimeout(120);

  await page.click('#items .it:nth-child(3) .rm');
  await page.waitForTimeout(120);
  eq('ลบรายการออกได้', await page.locator('#items .it').count(), 2);

  /* ---------- 6. บันทึกไม่สำเร็จ ต้องไม่ทำข้อมูลหาย ---------- */
  console.log('\n6. บันทึกไม่สำเร็จ (เน็ตหลุด / ชีทปฏิเสธ)');
  await page.evaluate(function () { window.MOCK_FAIL = 'ล็อตมีของไม่พอ สั่ง 9 แต่ในล็อตเหลือรวม 2 ชิ้น'; });
  await page.click('#btn-save');
  await page.waitForTimeout(400);
  var err = await page.textContent('#err');
  truthy('ขึ้นข้อความว่าบันทึกไม่สำเร็จ', /บันทึกไม่สำเร็จ/.test(err));
  truthy('บอกเหตุผลจริงจากหลังบ้าน', /ล็อตมีของไม่พอ/.test(err));
  eq('ชื่อลูกค้ายังอยู่', await page.inputValue('#f-cust'), 'คุณ ทดสอบ ระบบใหม่');
  eq('รายการสินค้ายังอยู่ครบ', await page.locator('#items .it').count(), 2);
  eq('ปุ่มบันทึกกดได้อีก', await page.isDisabled('#btn-save'), false);
  eq('ปุ่มกลับเป็นข้อความเดิม', await page.textContent('#btn-save'), 'บันทึกออเดอร์ลงชีท');

  /* ---------- 7. บันทึกสำเร็จ ---------- */
  console.log('\n7. บันทึกสำเร็จ');
  await page.evaluate(function () { window.MOCK_FAIL = ''; window.SENT = []; });
  await page.click('#btn-save');
  await page.waitForTimeout(500);
  var sent = await page.evaluate(function () { return window.SENT[0]; });
  eq('ส่งชื่อลูกค้าไปถูก', sent.cust, 'คุณ ทดสอบ ระบบใหม่');
  eq('ส่งสองรายการ', sent.items.length, 2);
  eq('รายการแรก', [sent.items[0].sku, sent.items[0].qty], ['SKU-160', '1']);
  eq('รายการที่สองมีราคาขายจริง', [sent.items[1].sku, sent.items[1].qty, sent.items[1].price],
    ['SKU-141', '20', '110']);
  eq('ค่าจัดส่ง', sent.ship, 50);
  eq('ไม่รับ VAT', sent.vat, false);
  truthy('มี clientKey กันบันทึกซ้ำ', sent.clientKey && sent.clientKey.length > 8);
  eq('ส่งชื่อคนคีย์ไปด้วย', sent.by, 'น้องบี');
  truthy('ขึ้นข้อความว่าบันทึกแล้ว', /บันทึกแล้ว/.test(await page.textContent('#ok')));
  eq('ล้างฟอร์มให้คีย์ใบต่อไป', await page.inputValue('#f-cust'), '');
  eq('เหลือแถวสินค้าว่าง 1 แถว', await page.locator('#items .it').count(), 1);

  console.log('\n   กดบันทึกใบใหม่ ต้องได้ clientKey ตัวใหม่ ไม่ใช่ตัวเดิม');
  await page.evaluate(function () { window.SENT = []; });
  await page.fill('#f-cust', 'ลูกค้าใบถัดไป');
  await page.selectOption('#items .it:first-child .i-sku', 'SKU-143');
  await page.fill('#items .it:first-child .i-qty', '2');
  await page.click('#btn-save');
  await page.waitForTimeout(500);
  var sent2 = await page.evaluate(function () { return window.SENT[0]; });
  truthy('clientKey เปลี่ยนแล้ว', sent2.clientKey !== sent.clientKey);

  /* ---------- 8. กันคีย์ไม่ครบ ---------- */
  console.log('\n8. กรอกไม่ครบ ต้องบอกก่อนยิงขึ้นชีท');
  await page.evaluate(function () { window.SENT = []; });
  await page.click('#btn-save');
  await page.waitForTimeout(250);
  truthy('บอกว่ายังไม่ได้เลือกสินค้า', /ยังไม่ได้เลือกสินค้า/.test(await page.textContent('#err')));
  eq('ไม่ยิงขึ้นชีทเลย', await page.evaluate(function () { return window.SENT.length }), 0);

  await page.selectOption('#items .it:first-child .i-sku', 'SKU-143');
  await page.click('#btn-save');
  await page.waitForTimeout(250);
  truthy('บอกว่ายังไม่ใส่จำนวน', /ยังไม่ได้ใส่จำนวน/.test(await page.textContent('#err')));
  await page.fill('#items .it:first-child .i-qty', '1');
  await page.click('#btn-save');
  await page.waitForTimeout(250);
  truthy('บอกว่ายังไม่ใส่ชื่อลูกค้า', /ชื่อลูกค้า/.test(await page.textContent('#err')));
  eq('ยังไม่ยิงขึ้นชีท', await page.evaluate(function () { return window.SENT.length }), 0);

  /* ---------- 9. หน้ารายการออเดอร์ ---------- */
  console.log('\n9. แท็บออเดอร์');
  await page.click('.tabs button[data-go="list"]');
  await page.waitForSelector('#list .row', { timeout: 4000 });
  var row = await page.textContent('#list .row');
  truthy('เห็นออเดอร์ที่บันทึกไว้', row.indexOf('AST-26-0005') > -1);
  truthy('เห็นยอดสุทธิ', row.indexOf('฿800.00') > -1);
  truthy('เห็นเลขพัสดุ', row.indexOf('TH0000000001') > -1);

  /* ---------- 10. ใบปะหน้าพัสดุ ---------- */
  console.log('\n10. ใบปะหน้าพัสดุ');
  await page.click('#list .row .sq[data-lb="0"]');
  await page.waitForSelector('#lb-make', { timeout: 3000 });
  await page.click('#lb-make');
  await page.waitForSelector('#lb-out img', { timeout: 20000 });
  var img = await page.evaluate(function () {
    var i = document.querySelector('#lb-out img');
    return { len: i.src.length, png: i.src.slice(0, 21), w: i.naturalWidth, h: i.naturalHeight };
  });
  eq('เป็นรูป PNG', img.png, 'data:image/png;base64');
  eq('ขนาดใบปะหน้าเท่าของเดิม', [img.w, img.h], [1181, 1772]);
  truthy('รูปมีเนื้อหาจริง ไม่ใช่หน้าขาว', img.len > 30000);
  await page.screenshot({ path: 'out/ui-label.png' });

  console.log('\n   ติ๊กเก็บเงินปลายทางแล้วสร้างใหม่');
  await page.click('#lb-cod');
  await page.click('#lb-make');
  await page.waitForSelector('#lb-out img', { timeout: 20000 });
  var img2 = await page.evaluate(function () { return document.querySelector('#lb-out img').src.length });
  truthy('ได้รูปใหม่ที่ต่างจากเดิม (ขึ้นยอดเก็บปลายทาง)', img2 !== img.len);
  await page.click('#m-close');

  /* ---------- 11. ข้อความส่งลูกค้า ---------- */
  console.log('\n11. ข้อความส่งลูกค้า');
  await page.click('#list .row .sq[data-sm="0"]');
  await page.waitForSelector('#mg-ord', { timeout: 3000 });
  var ord = await page.inputValue('#mg-ord');
  /* รูปแบบต้องตรงกับที่ร้านพิมพ์เองในเพจทุกวัน ไม่ใช่รูปแบบที่เราคิดเอง */
  truthy('ขึ้นต้นแบบเดียวกับที่ร้านส่งจริง', ord.indexOf('📦 สรุปออเดอร์ลูกค้า') === 0);
  /* ชื่อกับเบอร์เคยหายไปจากข้อความนี้ ทั้งที่เป็นสองอย่างที่ลูกค้าต้องตรวจว่าถูก */
  truthy('มีชื่อลูกค้า', /👤 ลูกค้าตัวอย่าง ก\n/.test(ord));
  truthy('มีเบอร์โทร ศูนย์หน้าครบ', /📞 0800000000\n/.test(ord));
  truthy('ชื่อกับเบอร์อยู่ก่อนรายการสินค้า',
    ord.indexOf('📞 0800000000') < ord.indexOf('💰'));
  truthy('แยกรุ่นกับขนาดคนละบรรทัด', /🛠 [^\n]+\n🔷 [^\n]+\n/.test(ord));
  truthy('บรรทัดราคาเป็น ราคา×จำนวน = รวม', /💰 750×1 = 750/.test(ord));
  truthy('รวมค่าสินค้า', /💵 รวมค่าสินค้า : 750 บาท/.test(ord));
  truthy('ค่าจัดส่ง', /🚚 ค่าจัดส่ง : 50 บาท/.test(ord));
  truthy('ยอดชำระทั้งหมด ไม่มีทศนิยมเกิน', /✅ ยอดชำระทั้งหมด : 800 บาท/.test(ord));
  truthy('ปิดท้ายด้วยที่อยู่จัดส่ง', /📍 ที่อยู่จัดส่ง\n/.test(ord));

  var shp = await page.inputValue('#mg-shp');
  truthy('ข้อความแจ้งพัสดุขึ้นต้นเหมือนของร้าน', shp.indexOf('📦 แจ้งเลขพัสดุสินค้า') === 0);
  truthy('มีชื่อขนส่ง', /🚛 ขนส่ง: Flash Express/.test(shp));
  truthy('มีเลขพัสดุ', /📦 เลขพัสดุ: TH0000000001/.test(shp));
  truthy('มีลิงก์ติดตามของ Flash', /flashexpress\.com/.test(shp));
  truthy('ขอฝากรีวิวท้ายข้อความ', /ฝากรีวิว ⭐⭐⭐⭐⭐/.test(shp));
  await page.click('#m-close');

  /* ---------- 12. ใส่เลขพัสดุ ---------- */
  console.log('\n12. ใส่เลขพัสดุย้อนหลัง');
  await page.click('#list .row .sq[data-tk="0"]');
  await page.waitForSelector('#tk-save', { timeout: 3000 });
  await page.fill('#tk-no', 'TH9998887776');
  await page.selectOption('#tk-st', 'ส่งแล้ว');
  await page.click('#tk-save');
  await page.waitForTimeout(600);
  truthy('เลขพัสดุใหม่ขึ้นในรายการ',
    (await page.textContent('#list')).indexOf('TH9998887776') > -1);

  /* ---------- 13. สรุปยอด ---------- */
  console.log('\n13. แท็บสรุปยอด');
  await page.click('.tabs button[data-go="sum"]');
  await page.waitForTimeout(600);
  eq('มีปุ่มเลือกช่วงเวลาครบ', await page.locator('#sum-range button').count(), 5);
  eq('เปิดมาอยู่ที่ "วันนี้"', await page.textContent('#sum-range button.on'), 'วันนี้');

  /* ออเดอร์ตัวอย่างเป็นของเมื่อวาน กด "ทั้งหมด" ให้เห็นแน่ ไม่ขึ้นกับวันที่รันทดสอบ */
  await page.click('#sum-range button[data-r="all"]');
  await page.waitForTimeout(300);
  var sum = await page.textContent('#summary');
  truthy('นับจำนวนออเดอร์', /2 ใบ/.test(sum));
  truthy('มียอดชำระสุทธิ', /฿1,103.59/.test(sum));
  truthy('มีกำไรขั้นต้น', /กำไรขั้นต้น/.test(sum));
  truthy('แยกตามค่ายขนส่ง', /Flash Express/.test(sum));
  truthy('แยกตามช่องทางขาย', /เพจ Facebook/.test(sum));
  truthy('มีสินค้าขายดี', /สินค้าขายดี/.test(sum));
  eq('แท่งกราฟยาวสุดของแต่ละกล่องเต็ม 100%',
    await page.evaluate(function () {
      return document.querySelector('.btrack i').style.width;
    }), '100%');

  console.log('\n   สลับไป "เมื่อวาน" แล้วตัวเลขต้องเปลี่ยนตาม');
  await page.click('#sum-range button[data-r="today"]');
  await page.waitForTimeout(300);
  truthy('วันนี้ยังไม่มีออเดอร์ ต้องบอกตรง ๆ ไม่ใช่โชว์ศูนย์',
    /ยังไม่มีออเดอร์ในช่วงนี้/.test(await page.textContent('#summary')));
  await page.click('#sum-range button[data-r="all"]');
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'out/ui-summary.png' });

  await page.click('.tabs button[data-go="new"]');
  await page.waitForTimeout(200);
  await page.screenshot({ path: 'out/ui-form.png' });

  /* ---------- 14. เอกสารขาย: ต้นฉบับให้ลูกค้า / สำเนาส่งบัญชี ----------
     ฝ่ายบัญชีต้องได้ใบสำเนาของเอกสารใบเดิม ไม่ใช่ใบใหม่ที่ออกเลขใหม่
     ข้อสอบนี้จึงตรวจว่ากดแล้วรูปเปลี่ยนจริง และกดกลับได้ต้นฉบับเดิมเป๊ะ */
  console.log('\n14. ต้นฉบับ / สำเนา ของเอกสารขาย');
  await page.evaluate(function () { go('list'); });
  await page.waitForTimeout(600);
  await page.evaluate(function () { openDoc((ORDERS || [])[0], 'rec'); });
  await page.waitForTimeout(400);
  /* ชื่อบนหัวใบ — ติ๊กตั้งต้นตามชนิดเอกสาร แล้วคนออกใบเลือกเพิ่มเองได้
     ใบใบเดียวบางทีใช้เป็นทั้งใบส่งของและใบกำกับภาษี ระบบเดาแทนไม่ได้ */
  eq('ใบเสร็จ/ใบกำกับภาษี ติ๊กมาให้สองชื่อ',
    await page.locator('#dc-form .fchk-i:checked').count(), 2);
  await page.check('#dc-form .fchk-i[value="2"]');
  eq('ติ๊กใบส่งของเพิ่มได้เป็นสามชื่อ',
    await page.locator('#dc-form .fchk-i:checked').count(), 3);

  await page.click('#dc-make');
  await page.waitForSelector('#dc-copy', { timeout: 20000 });
  var docOrig = await page.getAttribute('img.docimg', 'src');
  await page.click('#dc-copy');
  await page.waitForFunction(function () {
    return document.querySelector('#dc-copy').disabled === false;
  }, null, { timeout: 20000 });
  var docCopy = await page.getAttribute('img.docimg', 'src');
  truthy('กดสำเนาแล้วได้รูปคนละใบกับต้นฉบับ', docOrig !== docCopy);
  truthy('ปุ่มเปลี่ยนเป็นทางกลับให้เห็นว่ากำลังดูสำเนาอยู่',
    /ต้นฉบับ/.test(await page.textContent('#dc-copy')));
  await page.click('#dc-copy');
  await page.waitForFunction(function () {
    return document.querySelector('#dc-copy').disabled === false;
  }, null, { timeout: 20000 });
  eq('กดกลับแล้วได้ต้นฉบับใบเดิม ไม่ได้ออกเลขใหม่',
    (await page.getAttribute('img.docimg', 'src')) === docOrig, true);

  /* พิมพ์ซ้ำ — ใบที่ออกไปแล้วต้องเปิดกลับมาพิมพ์ใหม่ได้ โดยไม่ออกเลขใหม่
     ก่อนหน้านี้ทำไม่ได้เลย กดออกใหม่ก็โดนด่านกันใบซ้ำ คนเลยตัน */
  console.log('\n   พิมพ์ซ้ำใบที่ออกไปแล้ว');
  await page.evaluate(function () { closeModal(); });
  await page.waitForTimeout(200);
  await page.evaluate(function () { openDoc((ORDERS || [])[0], 'rec'); });
  await page.waitForSelector('#dc-old [data-rp]', { timeout: 20000 });
  var oldNo = await page.textContent('#dc-old .row .i b');
  truthy('ใบที่เพิ่งออกโผล่ในรายการใบเก่า', /ONIV26-/.test(oldNo));
  await page.click('#dc-old [data-rp]');
  await page.waitForSelector('#rp-out-dcold img.docimg', { timeout: 20000 });
  eq('พิมพ์ซ้ำแล้วได้รูปหน้าตาเดียวกับตอนออกใบ',
    (await page.getAttribute('#rp-out-dcold img.docimg', 'src')) === docOrig, true);
  truthy('บอกชัดว่าเป็นใบเดิม ไม่ได้ออกใบใหม่',
    /ไม่ได้ออกใบใหม่/.test(await page.textContent('#rp-out-dcold')));
  /* รูปที่พิมพ์ซ้ำเท่ากับตอนออกใบเป๊ะ (ตรวจไปแล้วข้างบน) แปลว่าชื่อสามชื่อที่ติ๊กไว้
     ถูกเก็บและดึงกลับมาครบ ไม่ได้กลับไปใช้ค่าตั้งต้นของชนิดเอกสาร */
  await page.evaluate(function () { closeModal(); });
  await page.waitForTimeout(200);

  /* ---------- 15. สินค้าซื้อมาขายไป: พิมพ์ชื่อเอง ไม่ต้องมีรหัส ----------
     ของที่รับมาขายทีเดียวแล้วจบ ไม่คุ้มที่จะตั้งรหัสไว้ในฐานสินค้าล่วงหน้า
     แต่ยอดขายต้องเข้าบิลถูก และถ้าใส่ต้นทุนมาด้วยก็ต้องได้กำไรจริง ไม่ใช่เดา */
  console.log('\n15. สินค้าซื้อมาขายไป (พิมพ์ชื่อเอง)');
  await page.evaluate(function () { go('new'); resetForm(); window.SENT = []; });
  await page.waitForTimeout(200);
  await page.fill('#f-cust', 'ลูกค้าซื้อมาขายไป');

  var R1 = '#items .it:first-child ';
  eq('ตั้งต้นยังเป็นแบบเลือกจากฐานสินค้า',
    await page.locator(R1 + '.i-free').isChecked(), false);
  eq('ช่องพิมพ์ชื่อเองยังซ่อนอยู่', await page.locator(R1 + '.i-name').isVisible(), false);

  await page.check(R1 + '.i-free');
  await page.waitForTimeout(150);
  eq('ติ๊กแล้วซ่อนช่องเลือกรหัสสินค้า', await page.locator(R1 + '.i-sku').isVisible(), false);
  eq('ติ๊กแล้วขึ้นช่องพิมพ์ชื่อ', await page.locator(R1 + '.i-name').isVisible(), true);
  eq('ติ๊กแล้วขึ้นช่องต้นทุน', await page.locator(R1 + '.i-cost').isVisible(), true);
  eq('ราคามาตรฐานหายไป เพราะของแบบนี้ไม่มีราคาป้าย',
    await page.locator(R1 + '.i-std').isVisible(), false);

  await page.fill(R1 + '.i-name', 'สายลมร้อน 2000W');
  await page.fill(R1 + '.i-qty', '3');
  await page.fill(R1 + '.i-price', '1200');
  await page.waitForTimeout(200);
  eq('ยอดสินค้าคิดจากราคาที่พิมพ์เอง', await page.textContent('#s-sub'), '฿3,600.00');
  truthy('ไม่ใส่ต้นทุน ต้องเตือนว่ากำไรจะเกินจริง',
    /กำไร.*สูงเกินจริง/.test(await page.textContent(R1 + '.lotline')));
  eq('คำเตือนเป็นสีเหลือง ไม่ใช่สีแดงห้ามบันทึก',
    await page.getAttribute('#items .it:first-child .lotline', 'class'), 'lotline warn');

  console.log('\n   ไม่ใส่ราคาขาย ต้องไม่ยอมให้บันทึก');
  await page.fill(R1 + '.i-price', '');
  await page.click('#btn-save');
  await page.waitForTimeout(300);
  truthy('บอกว่าต้องใส่ราคาขายจริง',
    /ต้องใส่ราคาขายจริง/.test(await page.textContent('#err')));
  eq('ยังไม่ยิงขึ้นชีท', await page.evaluate(function () { return window.SENT.length }), 0);
  await page.fill(R1 + '.i-price', '1200');

  console.log('\n   ใส่ต้นทุน แล้วต้องบอกว่าจะเพิ่มเข้าฐานสินค้าให้');
  await page.fill(R1 + '.i-cost', '820');
  await page.waitForTimeout(200);
  var fl = await page.textContent(R1 + '.lotline');
  truthy('บอกว่าจะเพิ่มเข้าฐานสินค้า', /เพิ่ม.*เข้าฐานสินค้า/.test(fl));
  truthy('บอกว่าจะลงรับเข้าเท่าที่ขาย สต๊อกจึงไม่ติดลบ', /รับเข้า 3 ชิ้น/.test(fl));
  eq('ข้อความนี้เป็นสีเขียว', await page.getAttribute(R1 + '.lotline', 'class'), 'lotline ok');

  console.log('\n   ปนกับสินค้าที่มีรหัสในใบเดียวกันได้');
  await page.click('#btn-add');
  await page.waitForTimeout(150);
  await page.selectOption('#items .it:nth-child(2) .i-sku', 'SKU-141');
  await page.fill('#items .it:nth-child(2) .i-qty', '2');
  await page.waitForTimeout(250);
  await page.click('#btn-save');
  await page.waitForTimeout(600);
  var sf = await page.evaluate(function () { return window.SENT[0]; });
  eq('ส่งไปสองบรรทัด', sf.items.length, 2);
  eq('บรรทัดพิมพ์ชื่อเองไม่มีรหัสสินค้าติดไป',
    [sf.items[0].free, sf.items[0].sku, sf.items[0].name, sf.items[0].qty,
     sf.items[0].price, sf.items[0].cost],
    [true, '', 'สายลมร้อน 2000W', '3', '1200', '820']);
  eq('บรรทัดสินค้าปกติยังส่งรหัสไปเหมือนเดิม',
    [sf.items[1].free, sf.items[1].sku, sf.items[1].name, sf.items[1].qty],
    [false, 'SKU-141', '', '2']);

  console.log('\n   ติ๊กออกแล้วต้องกลับไปเลือกจากฐานสินค้าได้เหมือนเดิม');
  await page.check(R1 + '.i-free');
  await page.waitForTimeout(120);
  await page.uncheck(R1 + '.i-free');
  await page.waitForTimeout(150);
  eq('ช่องเลือกรหัสกลับมา', await page.locator(R1 + '.i-sku').isVisible(), true);
  eq('ช่องพิมพ์ชื่อหายไป', await page.locator(R1 + '.i-name').isVisible(), false);
  eq('ราคามาตรฐานกลับมา', await page.locator(R1 + '.i-std').isVisible(), true);
  await page.screenshot({ path: 'out/ui-free-item.png' });

  /* ---------- 16. เอกสารออกผิด: ยกเลิกใบเดิม แล้วออกใบใหม่ ----------
     ใบที่ออกไปแล้วแก้ทับไม่ได้ เพราะลูกค้าถือใบเดิมอยู่ในมือ
     ข้อสอบนี้จึงตรวจว่ากดยกเลิกได้จริง ต้องบอกเหตุผล และใบเดิมยังพิมพ์ย้อนหลังได้ */
  console.log('\n16. ยกเลิกเอกสารที่ออกผิด');
  await page.evaluate(function () { go('list'); });
  await page.waitForTimeout(500);
  await page.evaluate(function () { openDoc((ORDERS || [])[0], 'rec'); });
  await page.waitForSelector('#dc-old .row', { timeout: 8000 });

  /* ใบที่ออกไว้ในหมวด 14 ยังอยู่ในทะเบียน จึงใช้ใบนั้นเป็นตัวทดสอบได้เลย */
  var VD = '#dc-old .row ';
  eq('เห็นใบที่ออกไปแล้วหนึ่งใบ', await page.locator('#dc-old .row').count(), 1);
  eq('ใบที่ยังใช้ได้ต้องมีปุ่มยกเลิก', await page.locator(VD + '[data-vd]').count(), 1);

  await page.click(VD + '[data-vd]');
  await page.waitForTimeout(200);
  truthy('กดแล้วขึ้นช่องให้กรอกเหตุผล', await page.locator(VD + '.vd-why').isVisible());

  console.log('\n   ไม่บอกเหตุผล ต้องยกเลิกให้ไม่ได้');
  await page.fill(VD + '.vd-why', 'ผิด');
  await page.click(VD + '.vd-go');
  await page.waitForTimeout(300);
  truthy('บอกว่าต้องใส่เหตุผลยาวกว่านี้',
    /อย่างน้อย 5 ตัวอักษร/.test(await page.textContent(VD + '.vd-msg')));
  eq('ยังไม่ถูกยกเลิก ปุ่มยกเลิกยังอยู่', await page.locator('#dc-old [data-vd]').count(), 1);

  console.log('\n   กดไม่ยกเลิก ต้องปิดกล่องแล้วไม่มีอะไรเปลี่ยน');
  await page.click(VD + '.vd-no');
  await page.waitForTimeout(200);
  eq('กล่องหายไป', await page.locator('#dc-old .vdbox').count(), 0);
  eq('ใบยังใช้ได้อยู่', await page.locator('#dc-old [data-vd]').count(), 1);

  console.log('\n   ยกเลิกจริง');
  await page.click(VD + '[data-vd]');
  await page.waitForTimeout(200);
  await page.fill(VD + '.vd-why', 'ออกผิดชนิดเอกสาร ที่ถูกต้องเป็นใบเสนอราคา');
  await page.click(VD + '.vd-go');
  await page.waitForTimeout(700);
  var oldTxt = await page.textContent('#dc-old');
  truthy('ขึ้นป้ายว่ายกเลิกแล้ว', /ยกเลิกแล้ว/.test(oldTxt));
  truthy('เห็นเหตุผลที่ยกเลิกในรายการ', /ออกผิดชนิดเอกสาร/.test(oldTxt));
  eq('ใบที่ยกเลิกแล้วไม่มีปุ่มให้กดยกเลิกซ้ำ', await page.locator('#dc-old [data-vd]').count(), 0);
  eq('แต่ยังกดพิมพ์ซ้ำได้อยู่', await page.locator('#dc-old [data-rp]').count(), 1);

  console.log('\n   พิมพ์ซ้ำใบที่ยกเลิกแล้ว ต้องดูออกว่าใช้ไม่ได้');
  await page.click('#dc-old [data-rp]');
  await page.waitForSelector('#dc-old img.docimg', { timeout: 20000 });
  await page.waitForTimeout(300);
  truthy('เตือนว่าใบนี้ยกเลิกไปแล้ว',
    /ถูกยกเลิกไปแล้ว/.test(await page.textContent('#dc-old')));

  /* ตรา "ยกเลิก" ต้องถูกวาดลงบนกระดาษจริง ไม่ใช่ขึ้นแค่ข้อความบนหน้าจอ
     เพราะรูปนี้คือสิ่งที่ถูกพิมพ์หรือส่งต่อ ข้อความบนหน้าจอไม่ติดไปด้วย */
  var stamped = await page.evaluate(async function () {
    var d = { lines: [{ name: 'x', qty: 1, price: 100, amount: 100 }],
              base: 100, vat: 7, total: 107, sub: 100, disc: 0, ship: 0 };
    var m = { no: 'X-1', date: '2026-09-01', cust: { name: 'ก' } };
    var clean = await buildDocPage(d, m, CFG.doc || {}, 'ต้นฉบับ');
    m.voidWhy = 'ออกผิดชนิดเอกสาร';
    var dead = await buildDocPage(d, m, CFG.doc || {}, 'ต้นฉบับ');
    return { same: clean === dead, len: dead.length };
  });
  eq('ใบที่ยกเลิกวาดออกมาไม่เหมือนใบปกติ', stamped.same, false);
  truthy('และยังเป็นรูปที่มีเนื้อหาจริง', stamped.len > 30000);
  await page.screenshot({ path: 'out/ui-void.png' });
  await page.evaluate(function () { closeModal(); });
  await page.waitForTimeout(200);

  /* ---------- 17. ไม่ได้กรอกที่อยู่ผู้ส่ง ต้องบอกก่อนพิมพ์ ----------
     ที่อยู่ผู้ส่งมาจากชีท ตั้งค่าแอป และตั้งต้นเป็นช่องว่าง ถ้าไม่บอกอะไรเลย
     จะรู้ตัวอีกทีตอนแปะใบปะหน้าบนกล่องไปแล้ว */
  /* ---------- 16.5 โลโก้ขนส่งบนใบปะหน้า ----------
     ชุดใหม่ที่เจ้าของร้านส่งมา 8 ก.ย. 69 เปลี่ยนทั้งสี่รูป
     จับคู่ผิดคือแปะกล่องส่งลูกค้าด้วยโลโก้ขนส่งเจ้าอื่น */
  console.log('\n16.5 โลโก้ขนส่งบนใบปะหน้า');
  var logoMap = await page.evaluate(function () {
    return ['Flash Express', 'Kerry Express', 'KEX Express', 'ไปรษณีย์ไทย',
            'ส่งด่วน (ไรเดอร์)', 'Shopee Xpress (SPX)', 'รับเองที่ร้าน'].map(function (n) {
      var u = carrierLogo(n);
      if (!u) return '';
      for (var k in CARRIER_LOGOS) if (CARRIER_LOGOS[k] === u) return k;
      return '?';
    });
  });
  eq('จับคู่โลโก้ถูกทุกเจ้า · เจ้าที่ไม่มีโลโก้คืนค่าว่างแล้วพิมพ์เป็นตัวหนังสือแทน',
    logoMap, ['flash', 'kerry', 'kerry', 'post', 'moto', 'spx', '']);
  eq('โลโก้ทุกอันเป็น PNG ชุดใหม่ ไม่ใช่ JPEG ชุดเดิม',
    await page.evaluate(function () {
      return ['flash', 'kerry', 'post', 'moto', 'spx'].map(function (k) {
        return CARRIER_LOGOS[k].slice(0, 14);
      });
    }), ['data:image/png', 'data:image/png', 'data:image/png', 'data:image/png',
         'data:image/png']);
  truthy('ปุ่มนำเข้า Shopee มีไอคอน Shopee ขึ้นจริง',
    await page.evaluate(function () {
      var el = $('#btn-shop-ic');
      return !!el && /^data:image\//.test(el.src || '');
    }));

  console.log('\n17. เตือนเมื่อยังไม่ได้กรอกที่อยู่ผู้ส่ง');
  await page.evaluate(function () { go('list'); });
  await page.waitForTimeout(400);
  await page.evaluate(function () { openLabel((ORDERS || [])[0]); });
  await page.waitForTimeout(300);
  eq('กรอกที่อยู่ไว้แล้ว ต้องไม่ขึ้นคำเตือน',
    /ยังไม่ได้กรอก/.test(await page.textContent('#m-body')), false);
  await page.evaluate(function () { closeModal(); });
  await page.waitForTimeout(200);

  await page.evaluate(function () { CFG.sender = { name: '', addr: '   ', tel: '096' }; });
  await page.evaluate(function () { openLabel((ORDERS || [])[0]); });
  await page.waitForTimeout(300);
  var lbTxt = await page.textContent('#m-body');
  truthy('ไม่ได้กรอก ต้องขึ้นคำเตือน', /ยังไม่ได้กรอก/.test(lbTxt));
  truthy('บอกด้วยว่าไปกรอกที่ชีทไหน', /ตั้งค่าแอป/.test(lbTxt));
  truthy('แต่ยังกดสร้างใบปะหน้าได้อยู่ ไม่ได้ห้าม',
    await page.locator('#lb-make').count() > 0);
  await page.evaluate(function () { closeModal(); });
  await page.waitForTimeout(200);

  /* ---------- 18. ค้นตำบล/อำเภอ/จังหวัด แล้วได้รหัสไปรษณีย์ ----------
     ของเดิมต้องเปิดกูเกิลหารหัสไปรษณีย์ทีละใบแล้วพิมพ์ตามมือ
     พิมพ์ผิดทีคือพัสดุไปผิดจังหวัด */
  console.log('\n18. ค้นที่อยู่ไทย');
  await page.evaluate(function () { go('new'); resetForm(); });
  await page.waitForTimeout(200);

  eq('ข้อมูลครบทั้งประเทศ', await page.evaluate(function () { return thRows().length }), 7438);

  console.log('\n   พิมพ์สั้นเกินไป ต้องยังไม่ขึ้นอะไร');
  await page.fill('#f-addr-find', 'ท');
  await page.waitForTimeout(150);
  eq('ตัวเดียวยังไม่ค้น', await page.locator('#f-addr-hit [data-th]').count(), 0);

  console.log('\n   พิมพ์ชื่อตำบล');
  await page.fill('#f-addr-find', 'ท่าคล้อ');
  await page.waitForTimeout(200);
  var hitTxt = await page.textContent('#f-addr-hit');
  truthy('เจอตำบลท่าคล้อของสระบุรี พร้อมรหัสไปรษณีย์',
    /ต\.ท่าคล้อ อ\.แก่งคอย จ\.สระบุรี 18110/.test(hitTxt));
  truthy('ชื่อซ้ำกันคนละจังหวัดก็ขึ้นให้เลือกทั้งคู่',
    /ศรีสะเกษ/.test(hitTxt) && /สระบุรี/.test(hitTxt));

  console.log('\n   กดเลือกแล้วต้องเติมต่อท้ายที่อยู่ ไม่เขียนทับ');
  await page.fill('#f-addr', '32 ม.6');
  await page.fill('#f-addr-find', 'ท่าคล้อ');
  await page.waitForTimeout(200);
  await page.click('#f-addr-hit [data-th]:nth-of-type(2)');
  await page.waitForTimeout(200);
  var addrNow = await page.inputValue('#f-addr');
  truthy('บ้านเลขที่ที่ลูกค้าพิมพ์มายังอยู่', /^32 ม\.6/.test(addrNow));
  truthy('ต่อท้ายด้วยตำบล อำเภอ จังหวัด รหัส',
    /\n?ต\.ท่าคล้อ อ\.แก่งคอย จ\.สระบุรี 18110$/.test(addrNow));
  eq('ล้างช่องค้นหาให้พร้อมพิมพ์ใหม่', await page.inputValue('#f-addr-find'), '');
  eq('เก็บรายการที่ค้นไว้ออกให้', await page.locator('#f-addr-hit [data-th]').count(), 0);

  console.log('\n   ค้นด้วยรหัสไปรษณีย์ก็ได้');
  await page.fill('#f-addr-find', '18110');
  await page.waitForTimeout(200);
  truthy('พิมพ์รหัสแล้วขึ้นตำบลในรหัสนั้น',
    /จ\.สระบุรี 18110/.test(await page.textContent('#f-addr-hit')));

  console.log('\n   กรุงเทพฯ ต้องใช้ แขวง/เขต ไม่ใช่ ตำบล/อำเภอ');
  await page.fill('#f-addr-find', 'บางรัก');
  await page.waitForTimeout(200);
  truthy('ขึ้นเป็นแขวง/เขต',
    /แขวงบางรัก เขตบางรัก กรุงเทพมหานคร 10500/.test(await page.textContent('#f-addr-hit')));

  console.log('\n   พิมพ์ชื่อที่ไม่มีจริง ต้องบอกตรง ๆ ไม่ใช่เงียบ');
  await page.fill('#f-addr-find', 'ตำบลที่ไม่มีอยู่จริงเลย');
  await page.waitForTimeout(200);
  truthy('บอกว่าไม่พบ', /ไม่พบ/.test(await page.textContent('#f-addr-hit')));
  await page.evaluate(function () { resetForm(); });
  await page.waitForTimeout(150);
  eq('ล้างฟอร์มแล้วช่องค้นหาว่างด้วย', await page.inputValue('#f-addr-find'), '');

  /* ---------- 18.5 แก้รายการสินค้าของออเดอร์ที่คีย์แล้ว ---------- */
  console.log('\n18.5 แก้รายการสินค้าของออเดอร์ที่คีย์แล้ว');

  await page.click('.tabs button[data-go="list"]');
  await page.waitForTimeout(600);
  truthy('ทุกออเดอร์มีปุ่มแก้รายการ',
    await page.locator('#list [data-ed]').count() > 0);

  await page.locator('#list [data-ed]').first().click();
  await page.waitForTimeout(350);
  var edStart = await page.locator('#ed-rows .edrow').count();
  truthy('เปิดมาแล้วเห็นรายการเดิมของใบนั้น', edStart > 0);

  console.log('\n   กดเพิ่มสินค้าแล้วต้องมีบรรทัดใหม่ให้กรอก');
  await page.click('#ed-add');
  await page.waitForTimeout(200);
  eq('ได้บรรทัดเพิ่มมาหนึ่ง', await page.locator('#ed-rows .edrow').count(), edStart + 1);

  /* เลือกสินค้าและใส่จำนวนในบรรทัดใหม่ แล้วยอดที่คิดให้ดูต้องขยับตาม */
  var lastRow = page.locator('#ed-rows .edrow').last();
  var sku2 = await page.evaluate(function () { return CFG.products[1].sku });
  await lastRow.locator('.i-sku').selectOption(sku2);
  await lastRow.locator('.i-qty').fill('2');
  await lastRow.locator('.i-price').fill('150');
  await page.waitForTimeout(200);
  truthy('ยอดที่คิดให้ดูรวมของใหม่เข้าไปด้วย',
    /300|฿/.test(await page.textContent('#ed-sum')));

  console.log('\n   ลบบรรทัดได้ แต่ห้ามลบจนไม่เหลือเลย');
  var n1 = await page.locator('#ed-rows .edrow').count();
  await page.locator('#ed-rows .edrow .rm').last().click();
  await page.waitForTimeout(150);
  eq('ลบแล้วเหลือน้อยลงหนึ่ง', await page.locator('#ed-rows .edrow').count(), n1 - 1);

  while (await page.locator('#ed-rows .edrow').count() > 1) {
    await page.locator('#ed-rows .edrow .rm').last().click();
    await page.waitForTimeout(80);
  }
  await page.locator('#ed-rows .edrow .rm').last().click();
  await page.waitForTimeout(150);
  eq('บรรทัดสุดท้ายลบไม่ได้', await page.locator('#ed-rows .edrow').count(), 1);

  console.log('\n   บันทึกจริงแล้วรายการในใบต้องเปลี่ยนตาม');
  await page.evaluate(function () { window.confirm = function () { return true } });
  await page.locator('#ed-rows .edrow').first().locator('.i-qty').fill('7');
  await page.click('#ed-save');
  await page.waitForTimeout(700);
  truthy('ขึ้นว่าแก้รายการแล้ว',
    /แก้รายการของ/.test(await page.textContent('#ed-msg')));
  eq('ส่งจำนวนใหม่ขึ้นชีทจริง',
    await page.evaluate(function () {
      return MOCK_ORDERS[0].items[0].qty;
    }), 7);

  console.log('\n   ใบที่ออกเอกสารไปแล้วต้องแก้ไม่ได้ และบอกเหตุผลตรง ๆ');
  await page.evaluate(function () {
    MOCK_DOCS.push({ no: 'ONIV26-09999', type: 'ใบเสร็จรับเงิน',
                     orderNo: MOCK_ORDERS[0].no, voidWhy: '' });
  });
  await page.click('#ed-save');
  await page.waitForTimeout(600);
  truthy('บอกว่าออกเอกสารไปแล้ว',
    /ออกเอกสารไปแล้ว/.test(await page.textContent('#ed-msg')));
  truthy('บอกด้วยว่าต้องยกเลิกใบเดิมก่อน',
    /ยกเลิกใบเดิมก่อน/.test(await page.textContent('#ed-msg')));
  await page.evaluate(function () { MOCK_DOCS.pop(); closeModal(); });
  await page.waitForTimeout(200);

  /* ---------- 19. ลายเซ็น ---------- */
  console.log('\n19. ลายเซ็น');

  /* วาดลายเซ็นแบบเส้น แล้วดูว่ามีหมึกลงบนกระดาษจริงตรงช่องที่ควรลง
     ไม่ใช่แค่ "ฟังก์ชันไม่ throw" — ช่องเซ็นที่ยังว่างคือบั๊กที่เงียบที่สุด */
  var sigInk = await page.evaluate(async function () {
    var sig = { w: 600, h: 200, s: [[40, 150, 180, 40, 320, 160, 470, 45, 560, 120]] };
    var cv = document.createElement('canvas');
    cv.width = 400; cv.height = 140;
    var g = cv.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, 400, 140);
    var drew = signDraw(g, sig, 10, 10, 380, 120);
    var d = g.getImageData(0, 0, 400, 140).data, ink = 0;
    for (var i = 0; i < d.length; i += 4) if (d[i] < 200 || d[i + 1] < 200) ink++;
    return { drew: drew, ink: ink };
  });
  eq('signDraw บอกว่าวาดแล้ว', sigInk.drew, true);
  truthy('มีหมึกลงบนผืนผ้าใบจริง ไม่ใช่ช่องว่าง', sigInk.ink > 200);

  console.log('\n   ค่าที่พังต้องไม่ทำให้ใบออกไม่ได้ แค่เว้นช่องไว้เซ็นมือ');
  var bad = await page.evaluate(function () {
    var g = document.createElement('canvas').getContext('2d');
    return ['', null, 'ไม่ใช่ json', '{}', '{"s":[]}', 12345].map(function (v) {
      try { return signDraw(g, v, 0, 0, 100, 50); } catch (e) { return 'THREW:' + e.message; }
    });
  });
  eq('ค่าพังทุกแบบคืน false เฉย ๆ ไม่โยน error', bad, [false, false, false, false, false, false]);

  console.log('\n   เก็บลายเซ็นของร้าน แล้วต้องขึ้นบนใบที่ออกหลังจากนั้น');
  var stamped = await page.evaluate(async function () {
    var sig = JSON.stringify({ w: 600, h: 200, s: [[40, 150, 300, 40, 560, 150]] });
    await api('saveSignature', 'auth', sig);
    CFG.doc = CFG.doc || {}; CFG.doc.sign = CFG.doc.sign || {};
    CFG.doc.sign.auth = sig;

    /* วาดใบสองรอบ — ไม่มีลายเซ็น กับมีลายเซ็น แล้วนับหมึกเฉพาะช่องขวาสุด
       (ผู้มีอำนาจลงนาม) ถ้าตัวเลขไม่ต่างกัน แปลว่าลายเซ็นไม่ได้ลงบนกระดาษจริง */
    var d = { no: 'TEST-1', type: 'ใบเสร็จรับเงิน', vatRate: 0.07,
              lines: [{ name: 'ของทดสอบ', po: '', qty: 1, unit: 'ชิ้น', price: 100, amount: 100 }],
              base: 100, vat: 7, total: 107, totalText: 'หนึ่งร้อยเจ็ดบาทถ้วน' };
    var m = { no: 'TEST-1', date: '2026-09-02', cust: { name: 'ลูกค้าทดสอบ' }, form: [0] };

    function ink(url) {
      return new Promise(function (res) {
        var im = new Image();
        im.onload = function () {
          var c = document.createElement('canvas');
          c.width = im.naturalWidth; c.height = im.naturalHeight;
          var g = c.getContext('2d');
          g.drawImage(im, 0, 0);
          /* ช่องขวาสุดของแถวลายเซ็น อยู่ท้ายกระดาษ */
          var x = Math.round(c.width * 0.70), y = Math.round(c.height * 0.855);
          var w = Math.round(c.width * 0.25), h = Math.round(c.height * 0.05);
          var p = g.getImageData(x, y, w, h).data, n = 0;
          for (var i = 0; i < p.length; i += 4) if (p[i] < 200 || p[i + 2] < 200) n++;
          res(n);
        };
        im.onerror = function () { res(-1); };
        im.src = url;
      });
    }
    var off = await ink(await buildDocPage(d, m, { co: {} }, 'ต้นฉบับ'));
    var on  = await ink(await buildDocPage(d, m, { co: {}, sign: { auth: sig } }, 'ต้นฉบับ'));
    return { off: off, on: on };
  });
  truthy('ใบที่ยังไม่ได้เซ็น ช่องนั้นแทบไม่มีหมึก', stamped.off >= 0);
  truthy('เซ็นแล้วหมึกในช่องนั้นเพิ่มขึ้นจริง', stamped.on > stamped.off + 100);

  console.log('\n   ที่ตั้งลายเซ็นต้องหาเจอเสมอ แม้ช่วงที่เลือกไม่มีออเดอร์');
  await page.click('.tabs button[data-go="sum"]');
  await page.waitForTimeout(700);
  eq('เข้าหน้าสรุปยอดแล้วเจอปุ่มตั้งลายเซ็นสองช่อง',
    await page.locator('#sig-box button[data-signbtn]').count(), 2);
  eq('มีปุ่มใช้รูปลายเซ็นที่มีอยู่แล้วด้วย',
    await page.locator('#sig-box button[data-sigimg]').count(), 2);

  /* เลือกช่วงเวลาที่ไม่มีออเดอร์ กล่องสรุปยอดจะถูกแทนที่ด้วยข้อความว่าง
     ที่ตั้งลายเซ็นต้องยังอยู่ ไม่หายไปพร้อมกัน (ของเดิมหายทั้งอันโดยไม่มีอะไรบอก) */
  await page.evaluate(function () {
    SUM_RANGE = 'today';
    drawSummary([{ no: 'X', date: '2000-01-01', status: 'รอชำระ', items: [] }]);
  });
  await page.waitForTimeout(200);
  truthy('กล่องสรุปยอดขึ้นว่าไม่มีออเดอร์',
    /ยังไม่มีออเดอร์ในช่วงนี้/.test(await page.textContent('#summary')));
  eq('แต่ที่ตั้งลายเซ็นยังอยู่ครบ',
    await page.locator('#sig-box button[data-signbtn]').count(), 2);

  /* ---------- 19.5 ข้อความส่งลูกค้าต้องบวกลงตัว + ไฟล์ต้องไม่ใหญ่เกินส่ง ---------- */
  console.log('\n19.5 ข้อความส่งลูกค้า: ตัวเลขต้องบวกลงตัว');

  /* ของจริง: 237 + ค่าส่ง 50 = 287 แต่ยอดชำระขึ้น 303.59 ลูกค้าทักมาว่าบวกผิด
     เพราะบรรทัด VAT ไม่ได้ถูกพิมพ์ลงในข้อความ */
  var msg = await page.evaluate(function () {
    var o = ORDERS.filter(function (x) { return x.no === 'AST-26-0006' })[0];
    return orderMsg(o);
  });
  truthy('มีบรรทัดภาษีมูลค่าเพิ่ม', /ภาษีมูลค่าเพิ่ม : 16\.59 บาท/.test(msg));

  /* ข้อสอบที่สำคัญกว่าการมีบรรทัด: ตัวเลขที่พิมพ์ต้องบวกได้เท่ายอดชำระเสมอ */
  var lines = msg.split('\n');
  function pick(re) {
    for (var i = 0; i < lines.length; i++) {
      var m = re.exec(lines[i]);
      if (m) return Number(m[1].replace(/,/g, ''));
    }
    return null;
  }
  var mSub  = pick(/รวมค่าสินค้า : ([\d,.]+)/);
  var mVat  = pick(/ภาษีมูลค่าเพิ่ม : ([\d,.]+)/);
  var mShip = pick(/ค่าจัดส่ง : ([\d,.]+)/);
  var mNet  = pick(/ยอดชำระทั้งหมด : ([\d,.]+)/);
  eq('บรรทัดที่พิมพ์บวกกันได้เท่ายอดชำระพอดี',
    Math.round((mSub + mVat + mShip) * 100) / 100, mNet);

  console.log('\n   ใบที่ไม่รับ VAT ต้องไม่มีบรรทัดนั้นโผล่มาเปล่า ๆ');
  var msg2 = await page.evaluate(function () {
    var o = ORDERS.filter(function (x) { return x.no === 'AST-26-0005' })[0];
    return orderMsg(o);
  });
  eq('ไม่มีบรรทัดภาษี', /ภาษีมูลค่าเพิ่ม/.test(msg2), false);
  var s2 = /รวมค่าสินค้า : ([\d,.]+)/.exec(msg2), n2 = /ยอดชำระทั้งหมด : ([\d,.]+)/.exec(msg2),
      p2 = /ค่าจัดส่ง : ([\d,.]+)/.exec(msg2);
  eq('ยังบวกลงตัวเหมือนเดิม',
    Number(s2[1].replace(/,/g,'')) + Number(p2[1].replace(/,/g,'')),
    Number(n2[1].replace(/,/g,'')));

  console.log('\n   ไฟล์เอกสารต้องเล็กพอส่งในไลน์ได้ ไม่ต้องเอาไปบีบเอง');
  var fsz = await page.evaluate(async function () {
    var d = { no:'X', type:'ใบเสร็จรับเงิน', vatRate:0.07,
      lines:[{name:'End Mill Corn cut 2F 1.0*7.0*3.175*38L (1pcs)',po:'',qty:3,unit:'ชิ้น',price:79,amount:237}],
      base:237, vat:16.59, total:303.59, totalText:'สามร้อยสามบาท' };
    var url = await buildDocPage(d, { no:'X', date:'2026-09-03', cust:{name:'ก'} },
                                 { co:{} }, 'ต้นฉบับ');
    var jpg = await toJpegUrl(url, 0.85);
    var b64 = function(u){ return Math.round(u.split(',')[1].length * 0.75 / 1024) };
    return { png: b64(url), jpg: b64(jpg), isJpeg: jpg.indexOf('data:image/jpeg') === 0 };
  });
  eq('แปลงเป็น JPEG จริง', fsz.isJpeg, true);
  truthy('เล็กลงจริงเมื่อเทียบกับ PNG (' + fsz.png + ' KB → ' + fsz.jpg + ' KB)',
    fsz.jpg < fsz.png * 0.8);
  truthy('ไฟล์ไม่เกินครึ่งเมกะไบต์', fsz.jpg < 512);

  /* ---------- 20. ไฟล์ PDF ---------- */
  console.log('\n20. ไฟล์ PDF');

  var pdf = await page.evaluate(async function () {
    var cv = document.createElement('canvas');
    cv.width = 300; cv.height = 424;
    var g = cv.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, 300, 424);
    g.fillStyle = '#000'; g.fillRect(30, 30, 240, 60);
    var blob = pdfFromCanvas(cv, 210, 297, 'ONIV26-00243');
    var buf = new Uint8Array(await blob.arrayBuffer());
    var head = '', tail = '';
    for (var i = 0; i < 8; i++) head += String.fromCharCode(buf[i]);
    for (var j = buf.length - 8; j < buf.length; j++) tail += String.fromCharCode(buf[j]);

    /* ตำแหน่งใน xref ต้องชี้ไปที่หัว object จริง ถ้าคลาดไปไบต์เดียวไฟล์เปิดไม่ได้
       และ "เปิดไม่ได้" คือสิ่งที่จะไปโผล่ตอนส่งให้บัญชีลูกค้า ไม่ใช่ตอนทดสอบ */
    var all = '';
    for (var k = 0; k < buf.length; k++) all += String.fromCharCode(buf[k]);
    var sx = all.lastIndexOf('startxref');
    var off = parseInt(all.slice(sx + 9).trim(), 10);
    var lines = all.slice(off).split('\n');
    var okOff = true;
    for (var n = 1; n <= 6; n++) {
      var o = parseInt(lines[2 + n], 10);
      if (all.slice(o, o + String(n).length + 6) !== n + ' 0 obj') okOff = false;
    }
    /* ไบต์แรกของรูปต้องอยู่ติดหลัง "stream\n" พอดี และยาวเท่า /Length เป๊ะ
       เกินมาตัวเดียว ตัวอ่าน PDF จะอ่านรูปเลื่อนไปหนึ่งไบต์ ไฟล์เปิดได้แต่รูปเสีย
       ซึ่งจะไปโผล่ตอนบัญชีลูกค้าเปิดดู ไม่ใช่ตอนเราทดสอบ */
    var im = /\/Length (\d+) >>\nstream\n/.exec(all.slice(all.indexOf('/DCTDecode')));
    var st = all.indexOf('/DCTDecode') + im.index + im[0].length;
    var jpg = all.slice(st, st + Number(im[1]));

    return { type: blob.type, size: blob.size, head: head, tail: tail.trim(),
             xrefHead: lines[0], okOff: okOff,
             jpgHead: jpg.charCodeAt(0) + ',' + jpg.charCodeAt(1),
             jpgTail: jpg.charCodeAt(jpg.length-2) + ',' + jpg.charCodeAt(jpg.length-1) };
  });
  eq('ชนิดไฟล์เป็น PDF', pdf.type, 'application/pdf');
  eq('ขึ้นต้นด้วยหัว PDF', pdf.head, '%PDF-1.4');
  truthy('ปิดท้ายด้วย %%EOF', /%%EOF$/.test(pdf.tail));
  eq('มีตาราง xref', pdf.xrefHead, 'xref');
  eq('ทุกตำแหน่งใน xref ชี้ไปที่หัว object จริง', pdf.okOff, true);
  truthy('ไฟล์มีเนื้อจริง ไม่ใช่ไฟล์เปล่า', pdf.size > 1000);
  eq('รูปข้างในเริ่มที่หัว JPEG พอดี ไม่มีไบต์แปลกปลอมนำหน้า', pdf.jpgHead, '255,216');
  eq('และจบที่ท้าย JPEG พอดีตามความยาวที่ประกาศไว้', pdf.jpgTail, '255,217');

  /* ---------- 22. ยกเลิกทั้งออเดอร์ ---------- */
  console.log('\n22. ยกเลิกทั้งออเดอร์ — ลูกค้าเปลี่ยนใจไม่รับของ');

  await page.click('.tabs button[data-go="list"]');
  await page.evaluate(function () { loadOrders(true) });
  await page.waitForTimeout(600);
  truthy('ใบที่ยังไม่ยกเลิกมีปุ่มยกเลิกให้กด',
    await page.locator('#list [data-cx]').count() > 0);

  /* เลือกใบสุดท้ายในรายการ ไม่ใช่ใบที่หมวดก่อนหน้าเพิ่งแก้รายการไป */
  var cxLast = await page.locator('#list [data-cx]').count() - 1;
  var cxNo = await page.evaluate(function (i) {
    var b = document.querySelectorAll('#list [data-cx]')[i];
    return ORDERS[Number(b.dataset.cx)].no;
  }, cxLast);
  var cxWas = await page.evaluate(function (no) {
    return MOCK_ORDERS.filter(function (o) { return o.no === no })[0].status;
  }, cxNo);

  await page.locator('#list [data-cx]').nth(cxLast).click();
  await page.waitForTimeout(350);
  truthy('เปิดหน้าต่างยกเลิกของใบที่กด',
    (await page.textContent('#m-title')).indexOf(cxNo) > -1);
  truthy('บอกก่อนว่าของจะคืนเข้าสต๊อก',
    /คืนเข้าสต๊อก/.test(await page.textContent('#m-body')));
  truthy('บอกว่ายกเลิกแล้วย้อนกลับไม่ได้',
    /ย้อนกลับไม่ได้/.test(await page.textContent('#m-body')));

  console.log('\n   ไม่ใส่เหตุผล ต้องไม่ยอมให้ยกเลิก');
  await page.evaluate(function () { window.confirm = function () { return true } });
  await page.click('#cx-go');
  await page.waitForTimeout(250);
  truthy('บอกว่าต้องมีเหตุผลอย่างน้อย 5 ตัวอักษร',
    /5 ตัวอักษร/.test(await page.textContent('#cx-msg')));
  eq('ออเดอร์ยังไม่ถูกแตะเลย', await page.evaluate(function (no) {
    return MOCK_ORDERS.filter(function (o) { return o.no === no })[0].status;
  }, cxNo), cxWas);

  console.log('\n   กดเหตุผลสำเร็จรูปได้ ไม่ต้องพิมพ์เองทุกครั้ง');
  await page.locator('#cx-quick button').first().click();
  await page.waitForTimeout(150);
  eq('เหตุผลลงช่องให้แล้ว', await page.inputValue('#cx-why'), 'ลูกค้าเปลี่ยนใจไม่รับของ');

  console.log('\n   ใบที่ออกเอกสารไปแล้ว ต้องยกเลิกใบเอกสารก่อน');
  await page.evaluate(function (no) {
    MOCK_DOCS.push({ no: 'ONIV26-08888', type: 'ใบเสร็จรับเงิน', orderNo: no, voidWhy: '' });
  }, cxNo);
  await page.click('#cx-go');
  await page.waitForTimeout(600);
  truthy('บอกว่าออกเอกสารไปแล้ว',
    /ออกเอกสารไปแล้ว/.test(await page.textContent('#cx-msg')));
  eq('ยังไม่ยกเลิกให้', await page.evaluate(function (no) {
    return MOCK_ORDERS.filter(function (o) { return o.no === no })[0].status;
  }, cxNo), cxWas);
  await page.evaluate(function () { MOCK_DOCS.pop() });

  console.log('\n   ยกเลิกจริง');
  await page.click('#cx-go');
  await page.waitForTimeout(700);
  truthy('ขึ้นว่ายกเลิกแล้ว', /ยกเลิก/.test(await page.textContent('#cx-msg')));
  var cxAfter = await page.evaluate(function (no) {
    var o = MOCK_ORDERS.filter(function (x) { return x.no === no })[0];
    return { status: o.status, net: o.net, items: (o.items || []).length, note: o.note };
  }, cxNo);
  eq('สถานะเป็นยกเลิก', cxAfter.status, 'ยกเลิก');
  eq('ยอดของใบนี้เป็นศูนย์', cxAfter.net, 0);
  eq('รายการสินค้าถูกรื้อออก ของจึงคืนเข้าสต๊อก', cxAfter.items, 0);
  truthy('เหตุผลถูกส่งขึ้นชีทด้วย', /ลูกค้าเปลี่ยนใจไม่รับของ/.test(cxAfter.note));

  console.log('\n   ใบที่ยกเลิกแล้วต้องไม่มีปุ่มให้กดต่อ');
  await page.evaluate(function () { closeModal() });
  await page.waitForTimeout(500);
  var deadRow = await page.evaluate(function (no) {
    var rows = document.querySelectorAll('#list .row');
    for (var i = 0; i < rows.length; i++) {
      if (rows[i].textContent.indexOf(no) > -1) {
        return { txt: rows[i].querySelector('.acts').textContent,
                 btns: rows[i].querySelectorAll('.acts button').length };
      }
    }
    return null;
  }, cxNo);
  truthy('แถวนั้นบอกว่ายกเลิกแล้ว', deadRow && /ยกเลิกแล้ว/.test(deadRow.txt));
  eq('ไม่มีปุ่มพิมพ์ใบปะหน้าหรือออกเอกสารเหลืออยู่เลย', deadRow && deadRow.btns, 0);

  /* ---------- 23. พิมพ์ชื่อลูกค้าเก่าแล้วเติมเบอร์กับที่อยู่ให้ ---------- */
  console.log('\n23. ลูกค้าเก่า — พิมพ์ชื่อแล้วขึ้นข้อมูลเดิมให้เลือก');

  await page.click('.tabs button[data-go="new"]');
  await page.evaluate(function () { resetForm() });
  await page.waitForTimeout(200);

  await page.fill('#f-cust', 'ล');
  await page.waitForTimeout(400);
  eq('พิมพ์ตัวเดียวยังไม่ขึ้นรายชื่อ กันเด้งใส่ทุกตัวอักษร',
    await page.locator('#f-cust-hit button').count(), 0);

  await page.fill('#f-cust', 'ลูกค้า');
  await page.waitForTimeout(600);
  truthy('ขึ้นรายชื่อลูกค้าเก่าให้เลือก',
    await page.locator('#f-cust-hit button').count() > 0);
  truthy('ในรายการบอกเบอร์ให้ดูก่อนกด ไม่ใช่มีแต่ชื่อ',
    /08\d{8}/.test(await page.textContent('#f-cust-hit')));

  await page.locator('#f-cust-hit button').first().click();
  await page.waitForTimeout(300);
  var picked = await page.evaluate(function () {
    return { cust: document.querySelector('#f-cust').value,
             tel: document.querySelector('#f-tel').value,
             addr: document.querySelector('#f-addr').value };
  });
  truthy('ใส่ชื่อลงช่องให้', picked.cust.length > 0);
  truthy('เติมเบอร์ของครั้งล่าสุดให้', /^0\d{8,9}$/.test(picked.tel));
  truthy('เติมที่อยู่ของครั้งล่าสุดให้', picked.addr.length > 10);
  eq('เลือกแล้วกล่องรายชื่อปิดเอง', await page.locator('#f-cust-hit button').count(), 0);

  console.log('\n   ที่อยู่ที่พิมพ์ไว้เองแล้ว ต้องไม่ถูกที่อยู่เก่าทับ');
  await page.evaluate(function () { resetForm() });
  await page.fill('#f-addr', 'ส่งที่หน้างานโครงการใหม่ 99 ถ.สมมติ');
  await page.fill('#f-cust', 'ลูกค้า');
  await page.waitForTimeout(600);
  await page.locator('#f-cust-hit button').first().click();
  await page.waitForTimeout(300);
  eq('ที่อยู่ที่คีย์ไว้ยังอยู่ครบ', await page.inputValue('#f-addr'),
    'ส่งที่หน้างานโครงการใหม่ 99 ถ.สมมติ');
  truthy('แต่เบอร์ที่ยังว่างอยู่ยังเติมให้',
    /^0\d{8,9}$/.test(await page.inputValue('#f-tel')));

  console.log('\n   ใบเสนอราคาก็ดึงลูกค้าเก่าได้เหมือนกัน');
  await page.click('.tabs button[data-go="quote"]');
  await page.waitForTimeout(300);
  await page.fill('#q-name', 'ลูกค้า');
  await page.waitForTimeout(600);
  truthy('ขึ้นรายชื่อในหน้าใบเสนอราคาด้วย',
    await page.locator('#q-name-hit button').count() > 0);
  await page.locator('#q-name-hit button').first().click();
  await page.waitForTimeout(300);
  truthy('เติมที่อยู่ให้ในใบเสนอราคา', (await page.inputValue('#q-addr')).length > 10);
  await page.click('.tabs button[data-go="list"]');
  await page.waitForTimeout(200);

  /* ---------- 24. เน็ตหลุดกลางทาง ---------- */
  console.log('\n24. เน็ตหลุดกลางทาง (HTTP 0) — ของจริงเจอตอนกดแก้รายการใบ AST-26-0018');

  var nm = await page.evaluate(function () {
    return {
      http0: netMsg_('NetworkError: การเชื่อมต่อล้มเหลวเนื่องจาก HTTP 0'),
      fetch: netMsg_('Failed to fetch'),
      other: netMsg_('ออเดอร์ AST-26-0018 ถูกยกเลิกไปแล้ว แก้รายการไม่ได้')
    };
  });
  truthy('บอกว่ายังไม่รู้ว่าบันทึกลงไปแล้วหรือยัง', /ยังไม่รู้ว่าบันทึกลงไปแล้วหรือยัง/.test(nm.http0));
  truthy('บอกว่ากดซ้ำได้ ระบบกันงานซ้ำไว้ให้', /กดปุ่มเดิมซ้ำได้เลย/.test(nm.http0));
  truthy('บอกทางออกว่าให้เปิดแอปใหม่', /เปิดลิงก์ใหม่/.test(nm.http0));
  truthy('ไม่มีคำว่า HTTP 0 ดิบ ๆ เหลืออยู่ให้คนอ่านงง', nm.http0.indexOf('HTTP 0') < 0);
  truthy('ข้อความแบบอื่นก็แปลด้วย', /ยังไม่รู้ว่าบันทึก/.test(nm.fetch));
  eq('ข้อความปกติของระบบต้องไม่ถูกแปลทับ', nm.other,
    'ออเดอร์ AST-26-0018 ถูกยกเลิกไปแล้ว แก้รายการไม่ได้');

  console.log('\n   กดซ้ำหลังเน็ตหลุด ต้องใช้กุญแจกันซ้ำตัวเดิม ไม่ใช่ตัวใหม่');
  await page.click('.tabs button[data-go="list"]');
  await page.evaluate(function () { loadOrders(true) });
  await page.waitForTimeout(600);
  await page.locator('#list [data-ed]').first().click();
  await page.waitForTimeout(350);

  /* ตัดสายจริง ๆ ที่ชั้น google.script.run — ทางเดียวกับที่ของจริงล้ม
     จะได้ทดสอบทั้งการแปลข้อความและกุญแจกันซ้ำพร้อมกันในทางเดินเดียว */
  await page.evaluate(function () {
    window.CAPKEYS = [];
    window.__realRun = google.script.run;
    var stub = {
      withSuccessHandler: function () { return stub },
      withFailureHandler: function (f) { stub.__fail = f; return stub },
      editOrderItems: function (no, items, by, ck) {
        window.CAPKEYS.push(ck);
        setTimeout(function () {
          stub.__fail({ message: 'NetworkError: การเชื่อมต่อล้มเหลวเนื่องจาก HTTP 0' });
        }, 5);
      }
    };
    google.script.run = stub;
  });

  await page.click('#ed-save');
  await page.waitForTimeout(400);
  truthy('ขึ้นข้อความเน็ตหลุดที่อ่านรู้เรื่อง',
    /ยังไม่รู้ว่าบันทึกลงไปแล้วหรือยัง/.test(await page.textContent('#ed-msg')));
  truthy('ปุ่มกลับมากดได้อีก ไม่ค้างเป็นกำลังบันทึก',
    !(await page.locator('#ed-save').isDisabled()));

  await page.click('#ed-save');
  await page.waitForTimeout(400);
  var keys = await page.evaluate(function () { return window.CAPKEYS });
  eq('ยิงไปสองรอบ', keys.length, 2);
  eq('กุญแจเป็นตัวเดิมทั้งสองรอบ เซิร์ฟเวอร์จึงกันซ้ำได้จริง', keys[0], keys[1]);

  await page.evaluate(function () {
    google.script.run = window.__realRun;
    closeModal();
  });
  await page.waitForTimeout(200);

  console.log('\n   บันทึกสำเร็จแล้ว กุญแจต้องเปลี่ยน ไม่งั้นแก้รอบสองจะเงียบหาย');
  await page.locator('#list [data-ed]').first().click();
  await page.waitForTimeout(350);
  var k1 = await page.evaluate(function () { return ED_KEY });
  await page.evaluate(function () { window.confirm = function () { return true } });
  await page.locator('#ed-rows .edrow').first().locator('.i-qty').fill('4');
  await page.click('#ed-save');
  await page.waitForTimeout(700);
  var k2 = await page.evaluate(function () { return ED_KEY });
  truthy('กุญแจเปลี่ยนหลังบันทึกสำเร็จ', !!k1 && !!k2 && k1 !== k2);
  await page.evaluate(function () { closeModal() });
  await page.waitForTimeout(200);

  /* ---------- 24.5 ค่าส่ง/ส่วนลด แก้ได้ในหน้าต่างแก้รายการ ---------- */
  console.log('\n24.5 แก้ค่าส่งกับส่วนลดพร้อมรายการสินค้า');

  await page.click('.tabs button[data-go="list"]');
  await page.evaluate(function () { MOCK_DOCS.length = 0; loadOrders(true) });
  await page.waitForTimeout(500);
  await page.locator('#list [data-ed]').first().click();
  await page.waitForTimeout(400);

  truthy('มีช่องค่าจัดส่งให้แก้', await page.locator('#ed-ship').count() > 0);
  truthy('มีช่องส่วนลดให้แก้', await page.locator('#ed-disc').count() > 0);
  eq('ค่าส่งขึ้นค่าเดิมของใบนั้น', await page.inputValue('#ed-ship'),
     String(await page.evaluate(function () { return Number(ORDERS[0].ship) || 0 })));

  console.log('\n   กล่องสรุปต้องโชว์ยอดสุทธิ ไม่ใช่แค่ยอดก่อน VAT');
  truthy('มีบรรทัดยอดสุทธิ', /ยอดสุทธิ/.test(await page.textContent('#ed-sum')));

  console.log('\n   ลบค่าส่งแล้วยอดสุทธิต้องลดลงทันทีบนหน้าจอ');
  var netBefore = await page.textContent('#ed-sum');
  await page.fill('#ed-ship', '0');
  await page.waitForTimeout(250);
  var netAfter = await page.textContent('#ed-sum');
  truthy('ตัวเลขบนกล่องสรุปเปลี่ยนตาม', netBefore !== netAfter);
  truthy('ไม่มีบรรทัดค่าจัดส่งเหลือแล้ว', !/ค่าจัดส่ง/.test(netAfter));

  console.log('\n   บันทึกแล้วค่าส่งต้องขึ้นชีทจริง');
  await page.evaluate(function () { window.confirm = function () { return true } });
  await page.click('#ed-save');
  await page.waitForTimeout(800);
  eq('ค่าส่งในชีทเป็นศูนย์แล้ว',
     await page.evaluate(function () { return Number(MOCK_ORDERS[0].ship) }), 0);
  truthy('ข้อความยืนยันบอกยอดสุทธิด้วย',
    /ยอดสุทธิ/.test(await page.textContent('#ed-msg')));
  await page.evaluate(function () { closeModal() });
  await page.waitForTimeout(200);

  /* ---------- 25. แก้ใบที่ยังไม่ได้ส่ง + ปุ่มส่งแล้ว ---------- */
  console.log('\n25. แก้ใบที่ยังไม่ได้ส่งลูกค้า และปุ่ม "ส่งแล้ว"');

  await page.click('.tabs button[data-go="list"]');
  await page.evaluate(function () { MOCK_DOCS.length = 0; loadOrders(true) });
  await page.waitForTimeout(500);

  /* ออกใบให้ออเดอร์ใบแรกก่อน แล้วค่อยแก้ */
  await page.locator('#list [data-dc]').first().click();
  await page.waitForTimeout(400);
  await page.click('#dc-make');
  await page.waitForTimeout(900);
  var docNo = await page.evaluate(function () { return MOCK_DOCS[0].no });
  truthy('ออกใบได้', !!docNo);
  var totalBefore = await page.evaluate(function () { return MOCK_DOCS[0].doc.total });

  await page.evaluate(function () { drawOldDocs(ORDERS[0].no) });
  await page.waitForTimeout(500);
  truthy('ใบที่ยังไม่ส่งมีปุ่มแก้ไขใบ', await page.locator('#dc-old [data-rv]').count() > 0);
  truthy('และมีปุ่มบอกว่าส่งแล้ว', await page.locator('#dc-old [data-sd]').count() > 0);
  truthy('ขึ้นป้ายว่ายังไม่ได้ส่ง', /ยังไม่ได้ส่ง/.test(await page.textContent('#dc-old')));

  console.log('\n   กดแก้ไขใบ ต้องบังคับให้บอกเหตุผลก่อน');
  await page.locator('#dc-old [data-rv]').first().click();
  await page.waitForTimeout(250);
  await page.click('#dc-old .rv-go');
  await page.waitForTimeout(250);
  truthy('เตือนว่าต้องมีเหตุผล 5 ตัวอักษร',
    /5 ตัวอักษร/.test(await page.textContent('#dc-old .rv-msg')));

  console.log('\n   แก้จริงแล้วเลขใบต้องไม่เปลี่ยน');
  await page.evaluate(function () {
    window.confirm = function () { return true };
    /* ลูกค้าขอลดราคา — ยอดใหม่ต้องไปโผล่บนใบเดิม */
    MOCK_ORDERS[0].items[0].price = 500;
    MOCK_ORDERS[0].items[0].total = 500;
  });
  await page.fill('#dc-old .rv-why', 'ยอดผิด ใบยังไม่ได้ส่ง');
  await page.click('#dc-old .rv-go');
  await page.waitForTimeout(800);
  var after = await page.evaluate(function () {
    return { n: MOCK_DOCS.length, no: MOCK_DOCS[0].no, total: MOCK_DOCS[0].doc.total,
             note: MOCK_DOCS[0].note || '' };
  });
  eq('ไม่มีใบใหม่งอกขึ้นมา', after.n, 1);
  eq('ยังเป็นเลขใบเดิม', after.no, docNo);
  truthy('ยอดบนใบเปลี่ยนตามออเดอร์', after.total !== totalBefore);
  truthy('จดร่องรอยว่าแก้ครั้งที่ 1', /แก้ไขครั้งที่ 1/.test(after.note));
  truthy('จดยอดเดิมไว้ด้วย', after.note.indexOf(String(totalBefore)) > -1);

  console.log('\n   กดว่าส่งแล้ว ปุ่มแก้ต้องหายไป');
  await page.evaluate(function () { drawOldDocs(ORDERS[0].no) });
  await page.waitForTimeout(400);
  await page.locator('#dc-old [data-sd]').first().click();
  await page.waitForTimeout(800);
  truthy('บันทึกว่าส่งแล้ว', await page.evaluate(function () { return !!MOCK_DOCS[0].sentAt }));
  eq('ปุ่มแก้ไขใบหายไปแล้ว', await page.locator('#dc-old [data-rv]').count(), 0);
  eq('ปุ่มส่งแล้วก็หายไปด้วย', await page.locator('#dc-old [data-sd]').count(), 0);
  truthy('ขึ้นป้ายว่าส่งแล้ว', /ส่งแล้ว/.test(await page.textContent('#dc-old')));
  truthy('ยังยกเลิกได้อยู่', await page.locator('#dc-old [data-vd]').count() > 0);

  console.log('\n   ใบที่ส่งแล้ว ถ้าฝืนแก้ต้องโดนปฏิเสธพร้อมบอกทางออก');
  var refused = await page.evaluate(async function (no) {
    try {
      await api('reviseDoc', { no: no, why: 'ขอแก้อีกที', clientKey: 'x1' });
      return 'ไม่ได้ปฏิเสธ';
    } catch (e) { return e.message }
  }, docNo);
  truthy('บอกว่าส่งไปแล้วจึงแก้ไม่ได้', /ส่งให้ลูกค้าแล้ว/.test(refused));

  await page.evaluate(function () { closeModal() });
  await page.waitForTimeout(200);

  /* ---------- 26. ค้นหาออเดอร์ทั้งชีท ---------- */
  console.log('\n26. ค้นหาออเดอร์ — ลูกค้าโทรมาถามใบเก่าที่ไม่ได้อยู่ใน 40 ใบล่าสุด');

  await page.click('.tabs button[data-go="list"]');
  await page.evaluate(function () { ORD_Q = ''; ORDERS = []; loadOrders(true) });
  await page.waitForTimeout(500);
  truthy('มีช่องค้นหาอยู่เหนือรายการ', await page.locator('#ord-q').count() > 0);
  eq('ยังไม่ได้ค้น เห็นใบล่าสุดทั้งหมด', await page.locator('#list .row').count(), 2);

  await page.fill('#ord-q', 'ตัวอย่าง ข');
  await page.waitForTimeout(900);
  eq('ค้นชื่อลูกค้าแล้วเหลือใบเดียว', await page.locator('#list .row').count(), 1);
  truthy('บอกว่าเจอกี่ใบ', /เจอ 1 ใบ/.test(await page.textContent('#ord-q-hint')));

  console.log('\n   ค้นด้วยเบอร์โทรก็ต้องเจอ — ลูกค้าโทรมามักบอกเบอร์ ไม่บอกเลขออเดอร์');
  await page.fill('#ord-q', '0800000001');
  await page.waitForTimeout(900);
  eq('ค้นเบอร์โทรเจอใบเดียวกัน', await page.locator('#list .row').count(), 1);

  console.log('\n   คำที่ไม่มีในชีท ต้องบอกว่าไม่เจอ ไม่ใช่โชว์ใบล่าสุดหลอกตา');
  await page.fill('#ord-q', 'ไม่มีลูกค้าคนนี้');
  await page.waitForTimeout(900);
  eq('ไม่มีแถวไหนขึ้นมา', await page.locator('#list .row').count(), 0);
  truthy('บอกว่าไม่เจอ', /ไม่เจอ/.test(await page.textContent('#list')));

  console.log('\n   ล้างคำค้นแล้วต้องกลับมาเป็นใบล่าสุดเอง');
  await page.fill('#ord-q', '');
  await page.waitForTimeout(900);
  eq('กลับมาครบทุกใบ', await page.locator('#list .row').count(), 2);
  eq('เลิกโหมดค้นหาแล้ว', await page.evaluate(function () { return ORD_Q }), '');

  /* ---------- 27. ค้างชำระ + เตือนของใกล้หมด ---------- */
  console.log('\n27. หน้าสรุปยอด — ใครยังไม่จ่าย และของอะไรใกล้หมด');

  await page.evaluate(function () {
    /* ตั้งสถานะให้แน่นอน ไม่ให้ข้อสอบข้อก่อนหน้ามีผลกับข้อนี้ */
    MOCK_ORDERS[0].status = 'ส่งแล้ว';   MOCK_ORDERS[0].net = 800;
    MOCK_ORDERS[1].status = 'รอชำระ';    MOCK_ORDERS[1].net = 303.59;
    SUM_CACHE = null; ORDERS = [];
  });
  await page.click('.tabs button[data-go="sum"]');
  await page.waitForTimeout(900);

  var dueTxt = await page.textContent('#sum-due');
  truthy('บอกว่าค้างชำระกี่ใบ', /ค้างชำระ 2 ใบ/.test(dueTxt));
  truthy('บอกยอดรวมที่ยังไม่ได้เก็บ', /1,103\.59/.test(dueTxt));
  eq('ขึ้นครบทั้งสองใบ', await page.locator('#due-list .row').count(), 2);
  truthy('ใบเก่าสุดขึ้นก่อน (ใบที่ต้องโทรตามก่อน)',
    (await page.textContent('#due-list .row:first-child')).indexOf('AST-26-0005') > -1);

  var alertTxt = await page.textContent('#sum-alert');
  truthy('เตือนล็อตที่ใกล้หมดอายุ', /ล็อตที่ต้องรีบระบาย/.test(alertTxt));
  truthy('บอกว่าเหลืออีกกี่วัน', /อีก \d+ วันหมดอายุ/.test(alertTxt));
  truthy('เตือนของที่ถึงจุดสั่งซื้อ', /ถึงจุดสั่งซื้อแล้ว/.test(alertTxt));
  truthy('น้ำยาหล่อเย็นเหลือ 14 ต่ำกว่าจุดสั่งซื้อ 20 ของตัวเอง',
    /น้ำยาหล่อเย็น 20L/.test(alertTxt));
  truthy('สินค้าที่ไม่ได้ตั้งจุดสั่งซื้อ ใช้จุดสั่งซื้อกลาง 50',
    /\(จุดสั่งซื้อ 50\)/.test(alertTxt));

  console.log('\n   เก็บเงินได้แล้วกดปุ่มเขียว ต้องปิดยอดในชีทจริง');
  /* ปุ่มเขียวเปิดประวัติของลูกค้ารายนั้นก่อน แล้วปิดยอดจากในนั้น
     เพราะตอนจะปิดยอดคือตอนที่เพิ่งคุยกับลูกค้าเสร็จ ซึ่งเป็นจังหวะเดียวกับที่อยากดูประวัติ */
  await page.evaluate(function () { window.confirm = function () { return true } });
  await page.locator('#due-list [data-due-cu]').first().click();
  await page.waitForTimeout(700);
  await page.click('#cu-paid');
  await page.waitForTimeout(900);
  eq('สถานะในชีทเปลี่ยนเป็นชำระแล้ว',
     await page.evaluate(function () { return MOCK_ORDERS[0].status }), 'ชำระแล้ว');
  await page.evaluate(function () { closeModal() });
  await page.waitForTimeout(300);
  eq('เหลือค้างใบเดียว', await page.locator('#due-list .row').count(), 1);
  truthy('ยอดค้างลดลงตาม', /303\.59/.test(await page.textContent('#sum-due')));

  /* ---------- 28. ใบเสนอราคา → ออเดอร์ ---------- */
  console.log('\n28. ลูกค้าตกลงตามใบเสนอราคา — ดึงใบมาเป็นออเดอร์ ไม่ต้องคีย์ใหม่');

  await page.click('.tabs button[data-go="quote"]');
  await page.waitForTimeout(500);
  await page.fill('#q-name', 'ลูกค้าตัวอย่าง ค');
  await page.fill('#q-tel', '0800000002');
  await page.fill('#q-addr', '9/9 ถ.สมมติ อ.เมือง ชลบุรี 20000');
  /* บรรทัดแรกเลือกจากฐานสินค้า บรรทัดที่สองพิมพ์ชื่อเอง (ของที่ไม่มีในสต๊อก) */
  await page.selectOption('#q-items .it:nth-child(1) .q-sku', 'SKU-141');
  await page.fill('#q-items .it:nth-child(1) .q-qty', '4');
  await page.fill('#q-items .it:nth-child(1) .q-price', '120');
  await page.click('#q-add');
  await page.waitForTimeout(200);
  await page.fill('#q-items .it:nth-child(2) .q-desc', 'ด้ามจับพิเศษสั่งทำ');
  await page.fill('#q-items .it:nth-child(2) .q-qty', '1');
  await page.fill('#q-items .it:nth-child(2) .q-price', '500');
  await page.fill('#q-ship', '50');
  await page.fill('#q-disc', '30');
  await page.click('#q-make');
  await page.waitForTimeout(1200);

  var qNo = await page.evaluate(function () {
    var q = MOCK_DOCS.filter(function (d) { return d.type === 'ใบเสนอราคา' })[0];
    return q ? q.no : '';
  });
  truthy('ออกใบเสนอราคาได้', !!qNo);

  await page.evaluate(function () { drawOldDocs('', '#q-old') });
  await page.waitForTimeout(600);
  truthy('ใบเสนอราคามีปุ่มทำเป็นออเดอร์', await page.locator('#q-old [data-q2o]').count() > 0);

  await page.locator('#q-old [data-q2o]').first().click();
  await page.waitForTimeout(900);

  eq('เด้งมาหน้าคีย์ออเดอร์ให้เลย',
     await page.evaluate(function () { return $('#pg-new').style.display !== 'none' }), true);
  var f = await page.evaluate(function () {
    return { cust: $('#f-cust').value, tel: $('#f-tel').value, addr: $('#f-addr').value,
             ship: $('#f-ship').value, disc: $('#f-disc').value,
             note: $('#f-note').value, vat: $('#f-vat').value,
             rows: $$('#items .it').length,
             sku1: $$('#items .it')[0].querySelector('.i-sku').value,
             qty1: $$('#items .it')[0].querySelector('.i-qty').value,
             price1: $$('#items .it')[0].querySelector('.i-price').value,
             free2: $$('#items .it')[1].querySelector('.i-free').checked,
             name2: $$('#items .it')[1].querySelector('.i-name').value,
             price2: $$('#items .it')[1].querySelector('.i-price').value };
  });
  eq('ยกชื่อลูกค้ามาให้', f.cust, 'ลูกค้าตัวอย่าง ค');
  eq('ยกเบอร์โทรมาให้', f.tel, '0800000002');
  truthy('ยกที่อยู่มาให้', f.addr.indexOf('ชลบุรี') > -1);
  eq('ได้สองบรรทัดเท่าใบเสนอราคา (ค่าส่งกับส่วนลดไม่นับเป็นสินค้า)', f.rows, 2);
  eq('บรรทัดที่จับคู่ชื่อได้ กลายเป็นรหัสสินค้าจริง', f.sku1, 'SKU-141');
  eq('จำนวนตามใบ', f.qty1, '4');
  eq('ราคาที่เสนอไปตามมาด้วย ไม่ใช่ราคาป้าย', f.price1, '120');
  eq('บรรทัดที่ไม่มีในฐานสินค้า ตั้งเป็นซื้อมาขายไป', f.free2, true);
  eq('พร้อมชื่อที่พิมพ์ไว้บนใบ', f.name2, 'ด้ามจับพิเศษสั่งทำ');
  eq('และราคาเดิม', f.price2, '500');
  eq('ค่าส่งไปอยู่ในช่องค่าส่ง ไม่ใช่บรรทัดสินค้า', Number(f.ship), 50);
  eq('ส่วนลดไปอยู่ในช่องส่วนลด', Number(f.disc), 30);
  truthy('จดเลขใบเสนอราคาไว้ในหมายเหตุ', f.note.indexOf(qNo) > -1);

  console.log('\n   ยอดไม่ตรงกับใบที่เสนอไป ต้องบอกตรงนั้น ไม่ใช่ปล่อยให้รู้ตอนลูกค้าโอนมา');
  /* ใบเสนอราคาคิด VAT รวมค่าจัดส่ง แต่สูตรในชีทคิด VAT เฉพาะค่าสินค้า
     ใบนี้จึงต่างกันเท่ากับ VAT ของค่าส่ง 50 บาท = 3.50 */
  var warn = await page.textContent('#err');
  truthy('ขึ้นคำเตือนว่ายอดไม่เท่ากัน', /ยอดไม่เท่ากัน/.test(warn));
  truthy('บอกยอดที่ออเดอร์คิดได้', /1,066\.50/.test(warn));
  truthy('บอกยอดที่เสนอไป', /1,070\.00/.test(warn));
  truthy('บอกด้วยว่าต่างกันเท่าไร', /3\.50/.test(warn));
  truthy('และบอกว่าต้องทำอะไรต่อ', /ก่อนกดบันทึก/.test(warn));

  console.log('\n   ใบที่ไม่มีค่าส่ง ยอดต้องตรงกันเป๊ะ');
  await page.click('.tabs button[data-go="quote"]');
  await page.waitForTimeout(400);
  await page.fill('#q-ship', '0');
  await page.fill('#q-disc', '0');
  await page.click('#q-make');
  await page.waitForTimeout(1200);
  var qNo2 = await page.evaluate(function () {
    var q = MOCK_DOCS.filter(function (d) { return d.type === 'ใบเสนอราคา' });
    return q[q.length - 1].no;
  });
  /* ลูกค้าตอบตกลงทันทีหลังออกใบเป็นเรื่องปกติ ปุ่มทำเป็นออเดอร์จึงต้องอยู่ในกล่อง
     ผลลัพธ์ตรงที่เพิ่งกดออกใบ ไม่ใช่ให้เลื่อนผ่านใบ A4 ทั้งใบไปหาข้างล่าง */
  var q2o = await page.evaluate(function () {
    var b = $('#q2o-now');
    if (!b) return null;
    var img = $('#q-out .docimg');
    return { text: b.textContent,
             /* อยู่ในกล่องเดียวกับใบที่เพิ่งออก ไม่ใช่คนละการ์ดที่ต้องเลื่อนไปหา */
             inBox: !!$('#q-out #q2o-now'),
             /* ต้องเจอปุ่มนี้ก่อนรายการ "ใบที่ออกไปแล้ว" ซึ่งอยู่คนละการ์ดข้างล่าง
                (ปุ่มเดิมอยู่ในรายการนั้น เจ้าของร้านเลื่อนไม่ถึงจนหาไม่เจอ) */
             before: !!$('#q-old') &&
               b.getBoundingClientRect().top < $('#q-old').getBoundingClientRect().top,
             hasImg: !!img };
  });
  truthy('มีปุ่มทำเป็นออเดอร์อยู่ในกล่องผลลัพธ์ทันทีที่ออกใบเสร็จ', q2o && q2o.inBox);
  truthy('เขียนให้รู้ว่ากดเมื่อลูกค้าตกลงสั่ง', /ลูกค้าสั่งแล้ว/.test(q2o.text));
  truthy('เจอปุ่มก่อนรายการใบที่ออกไปแล้ว ไม่ต้องเลื่อนลงไปหาข้างล่างสุด',
    q2o.hasImg && q2o.before);
  await page.click('#q2o-now');
  await page.waitForTimeout(900);
  var net2 = await page.evaluate(function () {
    return Number(String($('#s-net').textContent).replace(/[^\d.]/g, ''));
  });
  var qTotal2 = await page.evaluate(function (no) {
    return MOCK_DOCS.filter(function (d) { return d.no === no })[0].doc.total;
  }, qNo2);
  eq('ยอดสุทธิตรงกับใบที่เสนอไป', net2, qTotal2);
  eq('ไม่มีคำเตือนค้างอยู่',
     await page.evaluate(function () { return $('#err').classList.contains('on') }), false);
  truthy('ขึ้นข้อความว่าดึงใบมาแล้ว', /ดึงใบ/.test(await page.textContent('#ok')));

  console.log('\n   ใบที่เสนอราคารวม VAT ต้องถอด VAT ออกก่อน ไม่ใช่บวกซ้ำ');
  await page.click('.tabs button[data-go="quote"]');
  await page.waitForTimeout(400);
  await page.selectOption('#q-vat', 'incl');
  await page.click('#q-make');
  await page.waitForTimeout(1200);
  var qNo3 = await page.evaluate(function () {
    var q = MOCK_DOCS.filter(function (d) { return d.type === 'ใบเสนอราคา' });
    return q[q.length - 1].no;
  });
  var qTotal3 = await page.evaluate(function (no) {
    return MOCK_DOCS.filter(function (d) { return d.no === no })[0].doc.total;
  }, qNo3);
  eq('ใบราคารวม VAT ยอดรวมเท่าราคาที่กรอก', qTotal3, 980);
  await page.evaluate(function (no) { quoteToOrder(no) }, qNo3);
  await page.waitForTimeout(900);
  var f3 = await page.evaluate(function () {
    return { price1: $$('#items .it')[0].querySelector('.i-price').value,
             net: Number(String($('#s-net').textContent).replace(/[^\d.]/g, '')) };
  });
  eq('ราคาต่อหน่วยถูกถอด VAT ออกแล้ว (120 ÷ 1.07)', f3.price1, '112.15');
  eq('ยอดสุทธิยังเท่ายอดบนใบ ไม่ได้บวก VAT ซ้ำ', f3.net, qTotal3);

  /* ---------- 29. หน้ารับของเข้าสต๊อก ---------- */
  console.log('\n29. รับของเข้าสต๊อก');
  await page.click('.tabs button[data-go="recv"]');
  await page.waitForTimeout(400);
  truthy('เปิดหน้ารับของได้',
    await page.evaluate(function () { return $('#pg-recv').style.display !== 'none' }));

  /* ของที่คุมล็อต ต้องบอกให้ชัดว่าเลขล็อตเป็นของบังคับ */
  var chemSku = await page.evaluate(function () {
    for (var k in MOCK_BOOT.lots) return k;
    return '';
  });
  await page.selectOption('#r-sku', chemSku);
  await page.waitForTimeout(200);
  truthy('บอกว่าสินค้าตัวนี้คุมล็อต',
    /คุมล็อต ต้องใส่เลขล็อต/.test(await page.textContent('#r-lot-why')));
  truthy('โชว์ยอดคงเหลือปัจจุบันให้ดูก่อนกรอก',
    /ตอนนี้สต๊อกเหลือ/.test(await page.textContent('#r-now')));

  console.log('\n   ลืมใส่เลขล็อต ต้องกันไว้ก่อนถึงเซิร์ฟเวอร์');
  await page.fill('#r-qty', '12');
  var sentBefore = await page.evaluate(function () { return window.SENT.length });
  await page.click('#btn-recv');
  await page.waitForTimeout(400);
  truthy('ขึ้นคำเตือนเรื่องเลขล็อต',
    /ต้องใส่เลขล็อต/.test(await page.textContent('#err')));
  eq('ไม่ได้ยิงขึ้นชีทเลย',
    await page.evaluate(function () { return window.SENT.length }), sentBefore);

  console.log('\n   กรอกครบแล้วบันทึกได้ และยอดคงเหลือขยับตาม');
  var before29 = await page.evaluate(function (sku) {
    return MOCK_BOOT.products.filter(function (p) { return p.sku === sku })[0].remain;
  }, chemSku);
  await page.fill('#r-lot', 'L-ทดสอบ29');
  await page.fill('#r-exp', '2027-12-31');
  await page.click('#btn-recv');
  await page.waitForTimeout(1200);
  var sent29 = await page.evaluate(function () { return window.SENT[window.SENT.length - 1] });
  eq('ส่งจำนวนและเลขล็อตไปถูกต้อง',
    [sent29.sku, sent29.qty, sent29.lotNo, sent29.exp],
    [chemSku, 12, 'L-ทดสอบ29', '2027-12-31']);
  truthy('มี clientKey กันบันทึกซ้ำติดไปด้วย', /^rs-/.test(String(sent29.clientKey || '')));
  truthy('ขึ้นข้อความว่ารับของแล้ว พร้อมยอดคงเหลือ',
    /รับ .* เข้า 12 ชิ้นแล้ว/.test(await page.textContent('#ok')));
  eq('ยอดคงเหลือของสินค้าเพิ่มขึ้นจริง',
    await page.evaluate(function (sku) {
      return MOCK_BOOT.products.filter(function (p) { return p.sku === sku })[0].remain;
    }, chemSku), before29 + 12);
  eq('ล้างช่องจำนวนกับเลขล็อตให้พร้อมรับของก้อนถัดไป',
    await page.evaluate(function () { return [$('#r-qty').value, $('#r-lot').value] }), ['', '']);

  console.log('\n   หน้าคีย์ออเดอร์ต้องเห็นยอดใหม่ทันที ไม่ต้องเปิดแอปใหม่');
  truthy('ตัวเลือกสินค้าในฟอร์มออเดอร์อัปเดตยอดคงเหลือแล้ว',
    await page.evaluate(function (n) {
      return $$('#items .it')[0].querySelector('.i-sku').innerHTML.indexOf('(เหลือ ' + n + ')') > -1;
    }, before29 + 12));

  /* ---------- 30. นำเข้าออเดอร์จาก Shopee ---------- */
  console.log('\n30. นำเข้าออเดอร์จาก Shopee');
  await page.click('.tabs button[data-go="list"]');
  await page.waitForTimeout(400);
  await page.click('#btn-shop');
  await page.waitForTimeout(400);
  truthy('เปิดหน้านำเข้า Shopee จากหน้าออเดอร์ได้',
    await page.evaluate(function () { return $('#pg-shop').style.display !== 'none' }));
  truthy('แท็บ "ออเดอร์" ยังติดไฟค้างไว้ ไม่ใช่ดับหมดทั้งแถบ',
    await page.evaluate(function () {
      return $('.tabs button[data-go="list"]').classList.contains('on');
    }));
  truthy('ตั้งสถานะเริ่มต้นเป็น "ชำระแล้ว" เพราะ Shopee เก็บเงินไปแล้ว',
    await page.evaluate(function () { return $('#sp-status').value }) === 'ชำระแล้ว');

  console.log('\n   วางของที่ไม่ใช่ตาราง ต้องบอกว่าอ่านไม่ได้ ไม่ใช่เงียบ');
  await page.fill('#sp-text', 'สวัสดีครับ ส่งของด้วย');
  await page.click('#sp-read');
  await page.waitForTimeout(400);
  truthy('บอกว่าหาคอลัมน์ไม่เจอ พร้อมชื่อคอลัมน์ที่ขาด',
    /หาคอลัมน์ไม่เจอ/.test(await page.textContent('#err')));

  console.log('\n   วางตารางจริง — ต้องกางให้ตรวจก่อน ยังไม่เขียนอะไรลงชีท');
  var sku30 = await page.evaluate(function () { return MOCK_BOOT.products[0].sku });
  var name30 = await page.evaluate(function () { return MOCK_BOOT.products[0].name });
  var price30 = await page.evaluate(function () { return MOCK_BOOT.products[0].price });
  var HEAD30 = ['หมายเลขคำสั่งซื้อ', 'สถานะการสั่งซื้อ', 'วันที่ทำการสั่งซื้อ',
    'วันที่จัดส่งสินค้า', 'ชื่อสินค้า', 'เลขอ้างอิง SKU (ตัวเลือก)', 'ราคาขาย', 'จำนวน',
    'ค่าจัดส่งที่ชำระโดยผู้ซื้อ', 'ผู้ให้บริการขนส่ง', 'หมายเลขติดตามพัสดุ',
    'ชื่อผู้รับ', 'หมายเลขโทรศัพท์', 'ที่อยู่ในการจัดส่ง', 'จังหวัด', 'รหัสไปรษณีย์'];
  var PASTE30 = [HEAD30,
    ['260907AAA1', 'สำเร็จแล้ว', '07/09/2026', '08/09/2026', name30, sku30,
     String(price30), '2',
     '0', 'Flash Express', 'TH99999', 'ผู้ซื้อ ทดสอบ', '0812345678',
     '9/9 ถ.ทดสอบ', 'ปทุมธานี', '12150'],
    ['260907AAA2', 'สำเร็จแล้ว', '07/09/2026', '08/09/2026', 'ของที่ร้านไม่มีขาย',
     'ZZZ-999', '250', '1',
     '0', 'J&T Express', 'TH88888', 'ผู้ซื้อ สอง', '0899999999',
     '1 ถ.สอง', 'กรุงเทพมหานคร', '10500'],
    /* ใบที่ตีกลับ — ของยังอยู่ที่ร้าน ห้ามให้กดนำเข้าไปตัดสต๊อก */
    ['260907AAA3', 'ตีกลับ', '07/09/2026', '08/09/2026', name30, sku30,
     String(price30), '3',
     '0', 'Flash Express', 'TH77777', 'ผู้ซื้อ สาม', '0800000003',
     '3 ถ.สาม', 'ชลบุรี', '20000']
  ].map(function (r) { return r.join('\t') }).join('\n');

  var sentBefore30 = await page.evaluate(function () { return window.SENT.length });
  await page.fill('#sp-text', PASTE30);
  await page.click('#sp-read');
  await page.waitForTimeout(700);
  truthy('บอกว่ามีใบพร้อมนำเข้ากี่ใบ ติดปัญหากี่ใบ ตีกลับกี่ใบ',
    /พร้อมนำเข้า 1 ใบ/.test(await page.textContent('#sp-sum')) &&
    /ติดปัญหา 1 ใบ/.test(await page.textContent('#sp-sum')) &&
    /ตีกลับ\/ยกเลิก 1 ใบ/.test(await page.textContent('#sp-sum')));
  truthy('ใบที่ตีกลับบอกเหตุผลว่าทำไมไม่นำเข้า',
    /ของยังอยู่ที่ร้าน สต๊อกไม่ควรถูกตัด/.test(await page.textContent('#sp-list')));
  truthy('ใบที่จับคู่สินค้าไม่ได้ บอกชื่อสินค้าที่จับไม่ได้ตรง ๆ',
    /จับคู่สินค้าไม่ได้.*ของที่ร้านไม่มีขาย/.test(await page.textContent('#sp-list')));
  truthy('โชว์ต้นทุนกับกำไรให้เห็นก่อนกดนำเข้า',
    /ต้นทุน .*กำไร/.test(await page.textContent('#sp-list')));
  eq('ตรวจอย่างเดียว ยังไม่ได้สั่งบันทึกอะไร',
    await page.evaluate(function (n) {
      return window.SENT.slice(n).filter(function (x) { return x && x.clientKey }).length;
    }, sentBefore30), 0);

  console.log('\n   กดนำเข้า — เขียนเฉพาะใบที่พร้อม ใบที่ติดปัญหาต้องไม่ถูกเขียน');
  var before30 = await page.evaluate(function () { return window.SENT.length });
  await page.click('#sp-go');
  await page.waitForTimeout(1200);
  var sent30 = await page.evaluate(function (n) {
    return window.SENT.slice(n).filter(function (x) { return x && x.clientKey });
  }, before30);
  eq('ยิงบันทึกไปใบเดียว', sent30.length, 1);
  eq('กุญแจกันซ้ำผูกกับหมายเลขของ Shopee', sent30[0].clientKey, 'sp-260907AAA1');
  eq('ช่องทางขายเป็น Shopee', sent30[0].channel, 'Shopee');
  eq('หมายเหตุเก็บหมายเลข Shopee ไว้ตามกลับได้', sent30[0].note, 'Shopee 260907AAA1');
  eq('บันทึกเป็นไม่รับ VAT', sent30[0].vat, false);
  eq('รายการสินค้าใช้รหัสของร้าน ไม่ใช่รหัสของ Shopee',
    [sent30[0].items.length, sent30[0].items[0].sku, sent30[0].items[0].qty],
    [1, sku30, 2]);
  eq('ส่งชื่อลูกค้าขึ้นไป', sent30[0].cust, 'ผู้ซื้อ ทดสอบ');
  eq('ไม่ส่งที่อยู่ เบอร์โทร เลขพัสดุ ขนส่ง ขึ้นไปเลย — ไม่ได้ใช้ต่อ',
    [sent30[0].addr, sent30[0].tel, sent30[0].track, sent30[0].carrier],
    [undefined, undefined, undefined, undefined]);
  eq('ใบที่ Shopee บอกว่าส่งสำเร็จแล้ว ลงชีทเป็น "ส่งแล้ว" ให้เลย',
    sent30[0].status, 'ส่งแล้ว');
  eq('ค่าส่งกับส่วนลดเป็นศูนย์ ไม่ได้ดูดของ Shopee เข้ามา',
    [sent30[0].ship, sent30[0].discount], [0, 0]);
  eq('ใช้วันจัดส่ง ไม่ใช่วันสั่งซื้อ', sent30[0].date, '2026-09-08');
  truthy('ขึ้นสรุปว่านำเข้าสำเร็จกี่ใบ',
    /นำเข้าสำเร็จ 1 ใบ/.test(await page.textContent('#ok')));
  truthy('ล้างรายการที่นำเข้าไปแล้วออกจากหน้าจอ กันกดซ้ำ',
    await page.evaluate(function () { return $('#sp-list').innerHTML === '' }));

  console.log('\n   วางไฟล์เดิมซ้ำ — ใบที่เคยนำเข้าแล้วต้องขึ้นว่าข้าม ไม่ใช่เขียนซ้ำ');
  await page.evaluate(function () {
    MOCK_ORDERS.push({ no: 'AST-26-0099', note: 'Shopee 260907CCC1', items: [] });
  });
  var PASTE30C = [HEAD30,
    ['260907CCC1', 'สำเร็จแล้ว', '07/09/2026', '08/09/2026', name30, sku30,
     String(price30), '1',
     '0', 'Flash Express', 'TH66666', 'ผู้ซื้อ สี่', '0800000004',
     '4 ถ.สี่', 'ระยอง', '21000']
  ].map(function (r) { return r.join('\t') }).join('\n');
  await page.fill('#sp-text', PASTE30C);
  await page.click('#sp-read');
  await page.waitForTimeout(700);
  truthy('บอกว่าเคยนำเข้าไปแล้วเป็นใบไหน',
    /นำเข้าไปแล้วเป็นใบ AST-26-0099/.test(await page.textContent('#sp-list')));
  truthy('ไม่มีปุ่มให้กดนำเข้าซ้ำ',
    await page.evaluate(function () { return $('#sp-go').style.display === 'none' }));

  /* ---------- 31. ส่งบัญชี ---------- */
  console.log('\n31. ส่งบัญชี — แยกจากปุ่มออกเอกสาร');
  await page.click('.tabs button[data-go="list"]');
  await page.waitForTimeout(600);
  truthy('แถวออเดอร์โชว์สถานะบัญชีคู่กับสถานะออเดอร์',
    /ยังไม่ส่งบัญชี/.test(await page.textContent('#list')));

  var acctNo = await page.evaluate(function () { return ORDERS[0].no });
  await page.click('#list [data-ac="0"]');
  await page.waitForTimeout(700);
  truthy('เปิดหน้าต่างส่งบัญชีของใบที่กด',
    (await page.textContent('#m-title')).indexOf(acctNo) > -1);
  truthy('บอกว่าไฟล์จะไปอยู่โฟลเดอร์ไหน',
    /AST_ส่งบัญชี/.test(await page.textContent('#m-body')));
  truthy('บอกว่าไม่ได้แนบสลิป เพราะดูจากรายการเดินบัญชี',
    /รายการเดินบัญชี/.test(await page.textContent('#m-body')));

  console.log('\n   ใบที่ยังไม่เคยออกเอกสาร ต้องบอกตรง ๆ ไม่ใช่โชว์ช่องติ๊กเปล่า');
  /* ข้อสอบหมวดก่อนหน้าออกใบให้ออเดอร์ใบนี้ไปแล้ว เก็บไว้ก่อนแล้วคืนทีหลัง
     จะได้ทดสอบทางที่ "ยังไม่เคยออกใบ" ได้จริงโดยไม่กระทบหมวดอื่น */
  await page.evaluate(function () { window.__docs = MOCK_DOCS.slice(); MOCK_DOCS.length = 0; });
  await page.click('#m-close');
  await page.waitForTimeout(250);
  await page.click('#list [data-ac="0"]');
  await page.waitForTimeout(700);
  truthy('บอกให้ไปออกเอกสารก่อน',
    /ยังไม่เคยออกเอกสาร/.test(await page.textContent('#ac-docs')));
  eq('ไม่มีช่องติ๊กเอกสารให้กดเลย',
    await page.evaluate(function () { return $$('.ac-doc').length }), 0);

  console.log('\n   เปลี่ยนสถานะอย่างเดียว ไม่ส่งไฟล์');
  var before31 = await page.evaluate(function () { return window.SENT.length });
  await page.selectOption('#ac-st', 'รอเอกสาร');
  await page.click('#ac-save');
  await page.waitForTimeout(700);
  var sent31 = await page.evaluate(function (n) {
    return window.SENT.slice(n).filter(function (x) { return x && x.fn === 'setAcctStatus' });
  }, before31);
  eq('ยิงแค่คำสั่งเปลี่ยนสถานะ', sent31.length, 1);
  eq('ส่งสถานะที่เลือกไปถูกต้อง', sent31[0].acct, 'รอเอกสาร');
  eq('ไม่ได้ส่งไฟล์อะไรขึ้นไปเลย',
    await page.evaluate(function (n) {
      return window.SENT.slice(n).filter(function (x) { return x && x.files }).length;
    }, before31), 0);

  console.log('\n   ไม่ติ๊กอะไรเลยแล้วกดส่ง ต้องกันไว้ก่อนถึงเซิร์ฟเวอร์');
  await page.evaluate(function () {
    $$('.ac-x').forEach(function (c) { c.checked = false });
    $$('.ac-doc').forEach(function (c) { c.checked = false });
  });
  var before31b = await page.evaluate(function () { return window.SENT.length });
  await page.click('#ac-go');
  await page.waitForTimeout(400);
  truthy('บอกว่ายังไม่ได้ติ๊ก', /ยังไม่ได้ติ๊ก/.test(await page.textContent('#ac-out')));
  eq('ไม่ได้ยิงอะไรขึ้นไป',
    await page.evaluate(function (n) { return window.SENT.length - n }, before31b), 0);

  console.log('\n   ใบที่ออกไปแล้วจริง ๆ กลับมา แล้วส่งบัญชี');
  /* คืนใบที่ข้อสอบหมวดก่อนหน้าออกไว้ ใบพวกนี้มีรายการสินค้าครบ วาดรูปได้จริง */
  await page.evaluate(function () {
    (window.__docs || []).forEach(function (d) { MOCK_DOCS.push(d) });
  });
  var docNo31 = await page.evaluate(function () { return MOCK_DOCS[0].no });
  await page.click('#m-close');
  await page.waitForTimeout(300);
  await page.click('#list [data-ac="0"]');
  await page.waitForTimeout(700);
  truthy('เห็นใบที่ออกไปแล้วในรายการให้ติ๊ก',
    (await page.textContent('#ac-docs')).indexOf(docNo31) > -1);
  eq('ติ๊กใบแรกไว้ให้เลย',
    await page.evaluate(function () { return $$('.ac-doc')[0].checked }), true);

  var picked31 = await page.evaluate(function () {
    return $$('.ac-doc').filter(function (c) { return c.checked }).map(function (c) { return c.value });
  });
  var before31c = await page.evaluate(function () { return window.SENT.length });
  await page.click('#ac-go');
  await page.waitForTimeout(4000);
  var pack31 = await page.evaluate(function (n) {
    return window.SENT.slice(n).filter(function (x) { return x && x.files })[0];
  }, before31c);
  truthy('ส่งคำขอขึ้นไปแล้ว', !!pack31);
  eq('ส่งเฉพาะใบที่ติ๊กไว้ ไม่ใช่ทุกใบของออเดอร์',
    (pack31.files || []).map(function (f) { return f.name }), picked31);
  eq('ข้อมูลประกอบส่งไปครบสองอย่าง', pack31.extras, ['order', 'cust']);
  truthy('รูปที่ส่งเป็น JPEG ที่ย่อแล้ว ไม่ใช่ PNG ก้อนโต',
    /^data:image\/jpeg;base64,/.test(pack31.files[0].data));
  truthy('มี clientKey กันส่งซ้ำ', /^[a-z0-9]/i.test(String(pack31.clientKey || '')));
  eq('บอกเลขออเดอร์ที่ส่งไปด้วย', pack31.no, acctNo);
  truthy('ขึ้นลิงก์โฟลเดอร์ให้กดเปิด',
    /เปิดโฟลเดอร์บัญชี/.test(await page.textContent('#ac-out')));

  console.log('\n   ส่งเสร็จแล้ว แถวออเดอร์ต้องเปลี่ยนเป็น "ส่งบัญชีแล้ว" ทันที');
  await page.click('#m-close');
  await page.waitForTimeout(300);
  truthy('เห็นสถานะใหม่โดยไม่ต้องโหลดใหม่',
    /ส่งบัญชีแล้ว/.test(await page.textContent('#list')));

  /* ---------- 33. ลูกค้าเปลี่ยนใจขอส่งด่วน ---------- */
  console.log('\n33. ลูกค้าเปลี่ยนใจขอส่งด่วน — เปลี่ยนขนส่งจากหน้าใบปะหน้า');
  await page.click('.tabs button[data-go="list"]');
  await page.waitForTimeout(600);
  await page.evaluate(function () {
    ORDERS[0].carrier = 'Flash Express';
    ORDERS[0].track = 'TH1111111111';
    renderOrders();
  });
  var no33 = await page.evaluate(function () { return ORDERS[0].no });
  await page.evaluate(function () { openLabel(ORDERS[0]) });
  await page.waitForTimeout(400);
  eq('ช่องขนส่งตั้งค่าเป็นเจ้าเดิมของใบนี้',
    await page.evaluate(function () { return $('#lb-car').value }), 'Flash Express');
  eq('ยังไม่เปลี่ยน จึงไม่ถามเรื่องล้างเลขพัสดุ',
    await page.evaluate(function () { return $('#lb-clr-box').style.display }), 'none');

  console.log('\n   เปลี่ยนเป็นส่งด่วน — ต้องถามเรื่องเลขพัสดุเดิมด้วย');
  await page.selectOption('#lb-car', 'ส่งด่วน (ไรเดอร์)');
  await page.waitForTimeout(200);
  truthy('ช่องล้างเลขพัสดุโผล่ขึ้นมา',
    await page.evaluate(function () { return $('#lb-clr-box').style.display !== 'none' }));
  truthy('ติ๊กไว้ให้เลย เพราะเลขของเจ้าเดิมใช้กับเจ้าใหม่ไม่ได้',
    await page.evaluate(function () { return $('#lb-clr').checked }));

  var before33 = await page.evaluate(function () { return window.SENT.length });
  await page.click('#lb-make');
  await page.waitForTimeout(2500);
  var sent33 = await page.evaluate(function (n) {
    return window.SENT.slice(n).filter(function (x) { return x && x.fn === 'setTracking' })[0];
  }, before33);
  truthy('บันทึกลงชีทให้ด้วย ไม่ใช่เปลี่ยนแค่บนกระดาษ', !!sent33);
  eq('ส่งขนส่งใหม่ขึ้นไป', sent33.carrier, 'ส่งด่วน (ไรเดอร์)');
  eq('ล้างเลขพัสดุเดิมด้วย', sent33.track, '');
  eq('ไม่ไปแตะสถานะออเดอร์', sent33.status, null);
  eq('แถวออเดอร์ในหน้าจอเปลี่ยนตามทันที',
    await page.evaluate(function (no) {
      var o = ORDERS.filter(function (x) { return x.no === no })[0];
      return [o.carrier, o.track];
    }, no33), ['ส่งด่วน (ไรเดอร์)', '']);
  truthy('วาดใบปะหน้าออกมาให้จริง', await page.locator('#lb-out img').count() > 0);

  console.log('\n   บันทึกลงชีทไม่สำเร็จ ต้องยังได้ใบปะหน้า แต่บอกให้รู้ว่าชีทยังไม่ขยับ');
  await page.evaluate(function () { closeModal(); window.MOCK_FAIL = 'เน็ตหลุด' });
  await page.waitForTimeout(200);
  await page.evaluate(function () { openLabel(ORDERS[0]) });
  await page.waitForTimeout(300);
  await page.selectOption('#lb-car', 'ไปรษณีย์ไทย');
  await page.click('#lb-make');
  await page.waitForTimeout(2500);
  truthy('บอกว่าบันทึกลงชีทไม่สำเร็จ ต้องไปแก้เอง',
    /บันทึกลงชีทไม่สำเร็จ/.test(await page.textContent('#lb-out')));
  truthy('แต่ยังได้ใบปะหน้าออกมาใช้ ของต้องส่งวันนี้',
    await page.locator('#lb-out img').count() > 0);
  await page.evaluate(function () { window.MOCK_FAIL = null; closeModal() });
  await page.waitForTimeout(200);

  /* ---------- 34. ปิดยอดวัน ---------- */
  console.log('\n34. ปิดยอดวัน — แยกหน้าจากสรุปยอด');
  await page.click('.tabs button[data-go="day"]');
  await page.waitForTimeout(500);
  truthy('เข้าหน้าปิดยอดวันจากแถบล่างได้',
    await page.evaluate(function () { return $('#pg-day').style.display !== 'none' }));
  truthy('หน้าสรุปยอดไม่โผล่ขึ้นมาพร้อมกัน — คนละหน้ากันจริง ๆ',
    await page.evaluate(function () { return $('#pg-sum').style.display === 'none' }));
  eq('เปิดมาที่วันนี้เสมอ ไม่ต้องเลือกเอง',
    await page.evaluate(function () { return $('#dy-date').value }),
    await page.evaluate(function () { return todayISO() }));
  truthy('เดินไปวันข้างหน้าไม่ได้ ยังไม่มีของให้ปิดยอด',
    await page.evaluate(function () { return $('#dy-next').disabled }));

  /* วันที่ของออเดอร์จำลองคือ 2026-08-28 ทั้งสองใบ ตั้งไว้ตายตัวเพื่อให้ข้อสอบเชื่อได้
     ตัวเลขที่คาดหวังคิดจากข้อมูลจำลองสด ๆ ไม่ใช่เลขที่พิมพ์ค้างไว้ —
     หมวดก่อนหน้ามีการแก้ออเดอร์จำลองไปแล้ว เลขที่พิมพ์ค้างไว้จะกลายเป็นข้อสอบที่โกหก */
  await page.evaluate(function () { goDay('2026-08-28') });
  await page.waitForTimeout(500);
  var dayTxt = await page.textContent('#dy-body');
  var want34 = await page.evaluate(function () {
    var live = MOCK_ORDERS.filter(function (o) {
      return o.date === '2026-08-28' && String(o.status || '').trim() !== 'ยกเลิก';
    });
    var t = { n: live.length, net: 0, paid: 0, due: 0, profit: 0, ship: 0, pieces: 0 };
    live.forEach(function (o) {
      var net = Number(o.net) || 0;
      t.net += net;
      t.profit += Number(o.profit) || 0;
      t.ship += Number(o.ship) || 0;
      if (String(o.status || '').trim() === 'ชำระแล้ว') t.paid += net; else t.due += net;
      (o.items || []).forEach(function (it) { t.pieces += Number(it.qty) || 0 });
    });
    var b = function (n) { return baht(n) };
    return { n: t.n, net: b(t.net), paid: b(t.paid), due: b(t.due),
             profit: b(t.profit), ship: b(t.ship), pieces: t.pieces };
  });
  truthy('นับใบของวันนั้นได้ครบ', dayTxt.indexOf(want34.n + ' ใบ') > -1);
  truthy('ยอดขายรวมเท่ากับผลรวมของทุกใบในวันนั้น (' + want34.net + ')',
    dayTxt.indexOf('ยอดขายรวม' + want34.net) > -1);
  truthy('เก็บเงินแล้ว = เฉพาะใบที่สถานะ "ชำระแล้ว" (' + want34.paid + ')',
    dayTxt.indexOf('เก็บเงินแล้ว' + want34.paid) > -1);
  truthy('ยังไม่เก็บ = ที่เหลือ (' + want34.due + ')',
    dayTxt.indexOf('ยังไม่เก็บ' + want34.due) > -1);
  truthy('เก็บแล้ว + ยังไม่เก็บ ต้องเท่ากับยอดขายรวมพอดี ไม่มีเงินหายไประหว่างทาง',
    await page.evaluate(function (w) {
      var num = function (s) { return Number(String(s).replace(/[^\d.]/g, '')) };
      return Math.abs((num(w.paid) + num(w.due)) - num(w.net)) < 0.005;
    }, want34));
  truthy('มีกำไรขั้นต้นของวัน (' + want34.profit + ')',
    dayTxt.indexOf('กำไรขั้นต้น' + want34.profit) > -1);
  truthy('มีค่าจัดส่งรวมของวัน (' + want34.ship + ')',
    dayTxt.indexOf('ค่าจัดส่ง' + want34.ship) > -1);
  truthy('นับจำนวนชิ้นจากรายการสินค้าในใบ (' + want34.pieces + ')',
    dayTxt.indexOf('จำนวนชิ้น' + want34.pieces) > -1);
  truthy('ลิสต์ออเดอร์ของวันให้เห็นทุกใบ',
    await page.evaluate(function () { return $$('#dy-body .row').length }) === 2);
  truthy('เดินไปวันข้างหน้าได้แล้ว เพราะไม่ได้ยืนอยู่ที่วันนี้',
    await page.evaluate(function () { return !$('#dy-next').disabled }));

  console.log('\n   ปุ่ม ◀ ▶ เดินทีละวัน');
  await page.click('#dy-prev');
  await page.waitForTimeout(400);
  eq('กด ◀ ถอยไปหนึ่งวัน',
    await page.evaluate(function () { return $('#dy-date').value }), '2026-08-27');
  truthy('วันที่ไม่มีออเดอร์ต้องบอกให้รู้ ไม่ใช่หน้าว่างเปล่า',
    /ยังไม่มีออเดอร์/.test(await page.textContent('#dy-body')));
  truthy('วันที่ไม่มีออเดอร์ก็ยังเห็นแถบย้อนหลัง กดกลับไปวันที่มีของได้',
    await page.evaluate(function () { return $$('#dy-body [data-dy]').length }) === 7);
  await page.click('#dy-next');
  await page.waitForTimeout(400);
  eq('กด ▶ เดินกลับมาหนึ่งวัน',
    await page.evaluate(function () { return $('#dy-date').value }), '2026-08-28');

  console.log('\n   แถบ 7 วันย้อนหลัง กดแท่งแล้วเด้งไปวันนั้น');
  truthy('แท่งของวันที่กำลังดูอยู่ถูกไฮไลต์ไว้', await page.evaluate(function () {
    var b = $('#dy-body [data-dy="2026-08-28"]');
    return !!b && b.classList.contains('on');
  }));
  await page.click('#dy-body [data-dy="2026-08-26"]');
  await page.waitForTimeout(400);
  eq('กดแท่งแล้วเด้งไปปิดยอดวันนั้นเลย',
    await page.evaluate(function () { return $('#dy-date').value }), '2026-08-26');

  console.log('\n   ข้อความสรุปวันสำหรับส่งเข้าไลน์กลุ่ม');
  var dayCopy = await page.evaluate(function () {
    return dayText({ date: '2026-08-28', trend: [],
      orders: MOCK_ORDERS.filter(function (o) { return o.date === '2026-08-28' }) });
  });
  truthy('ขึ้นต้นด้วยวันที่แบบไทย', /^สรุปยอดวัน 28 ส\.ค\. 2569/.test(dayCopy));
  truthy('มียอดขายรวมในข้อความ (' + want34.net + ')',
    dayCopy.indexOf('ยอดขายรวม ' + want34.net) > -1);
  truthy('มีกำไรในข้อความ (' + want34.profit + ')',
    dayCopy.indexOf('กำไรขั้นต้น ' + want34.profit) > -1);
  truthy('แยกช่องทางขายให้ด้วย', /เพจ Facebook 2 ใบ/.test(dayCopy));
  truthy('ตัวเลขในข้อความตรงกับตัวเลขบนจอ ไม่ได้คิดคนละรอบ',
    dayCopy.indexOf(want34.net) > -1 && dayTxt.indexOf(want34.net) > -1);

  /* ---------- 39. หน้าค้างชำระ — เครดิต 30 วัน กับประวัติลูกค้า ---------- */
  console.log('\n39. หน้าค้างชำระ — เงินสด vs เครดิต 30 วัน');
  var pay39 = await page.evaluate(function () {
    /* วันนี้ในเครื่องทดสอบคือวันไหนก็ได้ ข้อสอบจึงคิดวันที่ย้อนหลังจาก todayISO() เอง
       ไม่ใช่เขียนวันที่ตายตัวไว้ ซึ่งจะพังเองเมื่อเวลาผ่านไป */
    function back(n) {
      var d = new Date(todayISO() + 'T00:00:00');
      d.setDate(d.getDate() - n);
      return isoOf(d.getTime());
    }
    return {
      cashFresh: payState({ status: 'รอชำระ', date: todayISO() }),
      cashLate:  payState({ status: 'รอชำระ', date: back(5) }),
      crFresh:   payState({ status: 'รอชำระเครดิต 30วัน', date: back(5) }),
      crEdge:    payState({ status: 'รอชำระเครดิต 30วัน', date: back(30) }),
      crOver:    payState({ status: 'รอชำระเครดิต 30วัน', date: back(51) }),
      paid:      payState({ status: 'ชำระแล้ว', date: back(99) }),
      dead:      payState({ status: 'ตีกลับ', date: back(9) })
    };
  });
  eq('เงินสดวันนี้ ยังไม่สาย', pay39.cashFresh.key, 'due');
  eq('เงินสดค้าง 5 วัน = เกินกำหนดแล้ว', pay39.cashLate.key, 'over');
  eq('บอกด้วยว่าเกินมากี่วัน', pay39.cashLate.label, 'เกินกำหนดชำระ 5 วัน');
  eq('เครดิต 30 วัน ผ่านไป 5 วัน ยังไม่ถึงกำหนด ต้องไม่ขึ้นแดง', pay39.crFresh.key, 'cr30');
  eq('ครบ 30 วันพอดี ยังไม่ถือว่าเกิน', pay39.crEdge.key, 'cr30');
  eq('เครดิต 30 วัน ผ่านไป 51 วัน = เกินมา 21 วัน', pay39.crOver.label, 'เกินกำหนดชำระ 21 วัน');
  eq('ใบที่จ่ายแล้ว', pay39.paid.key, 'paid');
  eq('ใบที่ตีกลับไม่ใช่ลูกหนี้', pay39.dead.key, 'dead');

  console.log('\n   แถบบอกสถานะเงินต้องขึ้นสีจริง ไม่ใช่โดนสีเทาของบรรทัดทับ');
  /* ".row .i span" ทาสีเทาไว้ทั้งบรรทัด และเจาะจงกว่า ".paybar.over" อยู่หนึ่งขั้น
     แถบทั้งหมดจึงเคยเป็นสีเทาหมดทุกอัน ทั้งที่ทั้งแถบมีไว้ให้ใบที่เกินกำหนด
     สะดุดตาโดยเฉพาะ — สีที่ไม่ต่างกันเลยคือสีที่ไม่ได้ทำงาน */
  await page.click('.tabs button[data-go="sum"]');
  await page.waitForTimeout(900);
  var bar39 = await page.evaluate(function () {
    var gray = getComputedStyle(document.documentElement)
      .getPropertyValue('--gray').trim();
    function hex(c) {
      var m = /rgb\((\d+), (\d+), (\d+)\)/.exec(c);
      return m ? '#' + [1,2,3].map(function (i) {
        return ('0' + Number(m[i]).toString(16)).slice(-2);
      }).join('') : c;
    }
    var out = {};
    $$('#sum-due .paybar').forEach(function (e) {
      var k = e.className.replace('paybar', '').trim();
      if (k && !out[k]) out[k] = hex(getComputedStyle(e).color);
    });
    return { bars: out, gray: gray };
  });
  truthy('มีแถบสถานะเงินให้ตรวจ', Object.keys(bar39.bars).length > 0);
  Object.keys(bar39.bars).forEach(function (k) {
    truthy('แถบ "' + k + '" ไม่ใช่สีเทาของบรรทัด (ได้ ' + bar39.bars[k] + ')',
      bar39.bars[k].toLowerCase() !== bar39.gray.toLowerCase());
  });
  if (bar39.bars.over)
    truthy('ใบที่เกินกำหนดชำระเป็นสีแดง', /^#[89abc]/.test(bar39.bars.over));

  console.log('\n   แถบกรองสี่กลุ่มบนหน้าสรุปยอด');
  await page.evaluate(function () {
    function back(n) {
      var d = new Date(todayISO() + 'T00:00:00'); d.setDate(d.getDate() - n);
      return isoOf(d.getTime());
    }
    MOCK_ORDERS.length = 0;
    MOCK_ORDERS.push(
      { no:'AST-26-0201', date:back(2), channel:'หน้าร้าน', cust:'คุณจ่ายแล้ว ทดสอบ',
        tel:'0800000001', addr:'-', carrier:'', track:'', vat:'ไม่รับ VAT', discount:0, ship:0,
        status:'ชำระแล้ว', staff:'x', note:'', subtotal:100, vatAmt:0, net:100, cost:40,
        profit:60, check:'OK', items:[] },
      { no:'AST-26-0202', date:back(5), channel:'หน้าร้าน', cust:'คุณเงินสด ค้างจ่าย',
        tel:'0800000002', addr:'-', carrier:'', track:'', vat:'ไม่รับ VAT', discount:0, ship:0,
        status:'รอชำระ', staff:'x', note:'', subtotal:200, vatAmt:0, net:200, cost:80,
        profit:120, check:'OK', items:[] },
      { no:'AST-26-0203', date:back(5), channel:'หน้าร้าน', cust:'คุณเครดิต ยังไม่ครบ',
        tel:'0800000003', addr:'-', carrier:'', track:'', vat:'ไม่รับ VAT', discount:0, ship:0,
        status:'รอชำระเครดิต 30วัน', staff:'x', note:'', subtotal:300, vatAmt:0, net:300,
        cost:100, profit:200, check:'OK', items:[] },
      { no:'AST-26-0204', date:back(51), channel:'หน้าร้าน', cust:'คุณเครดิต เกินแล้ว',
        tel:'0800000004', addr:'-', carrier:'', track:'', vat:'ไม่รับ VAT', discount:0, ship:0,
        status:'รอชำระเครดิต 30วัน', staff:'x', note:'', subtotal:400, vatAmt:0, net:400,
        cost:150, profit:250, check:'OK', items:[] }
    );
    PAY_PICK = 'due'; SUM_CACHE = null; ORDERS = [];
  });
  /* ต้องยืนอยู่หน้าสรุปยอดจริง ๆ ไม่งั้นแถบกรองซ่อนอยู่แล้วกดไม่ได้ */
  await page.click('.tabs button[data-go="sum"]');
  await page.waitForTimeout(900);

  var chips39 = await page.evaluate(function () {
    return $$('#pay-tabs button').map(function (b) {
      return { key: b.dataset.pay, n: b.querySelector('i').textContent,
               ic: !!b.querySelector('img'), on: b.classList.contains('on') };
    });
  });
  eq('มีสี่กลุ่มตามที่เจ้าของร้านวางไว้',
    chips39.map(function (c) { return c.key }), ['paid', 'due', 'cr30', 'over']);
  truthy('ทุกกลุ่มมีไอคอนรูปจริง', chips39.every(function (c) { return c.ic }));
  eq('ชำระเรียบร้อยหนึ่งใบ', chips39[0].n, '1');
  eq('ค้างชำระนับทุกใบที่ยังไม่ได้เงิน (เงินสด + เครดิต + เกินกำหนด)', chips39[1].n, '3');
  eq('เครดิตที่ยังไม่ถึงกำหนดหนึ่งใบ', chips39[2].n, '1');
  eq('เกินกำหนดสองใบ (เงินสดค้าง 5 วัน + เครดิตเกิน 21 วัน)', chips39[3].n, '2');
  truthy('เปิดมาที่กลุ่มค้างชำระก่อน เพราะเป็นเงินที่ยังไม่ได้', chips39[1].on);

  var due39 = await page.textContent('#sum-due');
  truthy('หัวการ์ดบอกยอดรวมของกลุ่มที่เลือก (200+300+400)', /฿900\.00/.test(due39));
  var bars39 = await page.evaluate(function () {
    return $$('#due-list .paybar').map(function (b) {
      return { cls: b.className.replace('paybar ', ''), txt: b.textContent };
    });
  });
  eq('ใบเครดิตที่ยังไม่ครบกำหนดใช้สีของตัวเอง ไม่ใช่สีแดง',
    bars39.filter(function (b) { return b.cls === 'cr30' }).length, 1);
  eq('ใบที่เกินกำหนดสองใบขึ้นแถบแดงเข้ม',
    bars39.filter(function (b) { return b.cls === 'over' }).length, 2);

  console.log('\n   กดแถบอื่นแล้วลิสต์ต้องเปลี่ยนตาม');
  await page.click('#pay-tabs button[data-pay="cr30"]');
  await page.waitForTimeout(400);
  var only39 = await page.evaluate(function () {
    return $$('#due-list .row').map(function (r) { return r.textContent });
  });
  eq('กลุ่มเครดิต 30 วัน เหลือใบเดียว', only39.length, 1);
  truthy('และเป็นใบที่ยังไม่ถึงกำหนดจริง ๆ', /AST-26-0203/.test(only39[0]));
  await page.click('#pay-tabs button[data-pay="paid"]');
  await page.waitForTimeout(400);
  truthy('กลุ่มชำระเรียบร้อยขึ้นแถบเขียว',
    await page.evaluate(function () {
      var b = $('#due-list .paybar');
      return !!b && b.className.indexOf('paid') > -1;
    }));

  console.log('\n   ปุ่มเขียว = เปิดประวัติคำสั่งซื้อของลูกค้ารายนั้น');
  await page.click('#pay-tabs button[data-pay="due"]');
  await page.waitForTimeout(400);
  await page.click('#due-list [data-due-cu]');
  await page.waitForTimeout(700);
  truthy('เปิดหน้าประวัติของลูกค้ารายนั้น',
    /ประวัติคำสั่งซื้อ/.test(await page.textContent('#m-title')));
  var cu39 = await page.textContent('#cu-body');
  truthy('บอกว่าซื้อไปแล้วกี่ใบ', /ซื้อไปแล้ว/.test(cu39));
  truthy('บอกยอดรวมที่เคยซื้อ', /ยอดรวม/.test(cu39));
  truthy('บอกว่าค้างอยู่กี่ใบ เป็นเงินเท่าไร', /ค้างชำระ/.test(cu39) && /ยอดที่ค้าง/.test(cu39));
  truthy('ยังปิดยอดใบที่กำลังดูอยู่ได้จากในนี้ ไม่ได้เสียปุ่มเดิมไป',
    await page.evaluate(function () { return !!$('#cu-paid') }));

  console.log('\n   ปิดยอดจากหน้าประวัติ');
  await page.evaluate(function () {
    window.PAID39 = ($('#cu-paid').textContent.match(/AST-\d{2}-\d{4}/) || [''])[0];
  });
  page.once('dialog', function (d) { d.accept() });
  await page.click('#cu-paid');
  await page.waitForTimeout(800);
  truthy('บอกว่าบันทึกแล้ว', /ชำระแล้ว/.test(await page.textContent('#cu-msg')));
  /* ลิสต์เรียงใบเก่าสุดขึ้นก่อน ปุ่มแรกจึงไม่ใช่ใบแรกที่ใส่เข้าไป — อ่านจากปุ่มเอาว่าใบไหน */
  eq('สถานะของใบที่กดปิดยอด เปลี่ยนจริง', await page.evaluate(function () {
    var o = MOCK_ORDERS.filter(function (x) { return x.no === PAID39 })[0];
    return o ? o.status : '(ไม่เจอ)';
  }), 'ชำระแล้ว');
  await page.evaluate(function () { closeModal() });
  await page.waitForTimeout(300);

  console.log('\n   ใบที่ไม่ระบุชื่อลูกค้า ต้องไม่เปิดหน้าเปล่า');
  truthy('บอกว่าไม่มีประวัติให้ดู แทนที่จะเปิดหน้าว่าง', await page.evaluate(function () {
    var before = $('#modal').classList.contains('on');
    openCustomer('', 'AST-26-0299');
    return !before && !$('#modal').classList.contains('on');
  }));

  /* ---------- 38. หน้าตาใหม่ — แถบล่างเป็นรูป กับปุ่มเอกสารบนหัวฟอร์มที่เอาออก ---------- */
  console.log('\n38. หน้าตาใหม่ของแถบล่างกับหัวฟอร์ม');
  await page.click('.tabs button[data-go="new"]');
  await page.waitForTimeout(400);
  truthy('เอาปุ่มขอเอกสารสามอันบนหัวฟอร์มออกแล้ว',
    await page.evaluate(function () { return !$('#docbar') }));
  var bn38 = await page.evaluate(function () {
    var bn = $('#paste-card .banner');
    if (!bn) return null;
    return { th: bn.querySelector('.bn-tx b').textContent,
             en: bn.querySelector('.bn-tx em').textContent,
             btn: !!bn.querySelector('#btn-paste-open'),
             ic: !!bn.querySelector('.bn-ic') };
  });
  truthy('ช่องวางที่อยู่เป็นแบนเนอร์ — ไอคอน ชื่องาน คำอธิบาย และปุ่มลงมือ',
    bn38 && bn38.ic && bn38.btn);
  eq('ชื่องานบนแบนเนอร์', bn38 && bn38.th, 'วางที่อยู่จากแชท');
  truthy('มีคำอธิบายบอกว่าวางอะไรได้บ้าง',
    bn38 && /Shopee/.test(bn38.en) && /Line/.test(bn38.en));
  /* ปุ่มนี้เป็นปุ่มสลับเปิด/ปิด หมวดก่อนหน้าอาจเปิดค้างไว้ จึงเทียบก่อน-หลังแทนที่จะเดาสถานะ */
  var pasteBefore = await page.evaluate(function () { return $('#paste-box').style.display });
  await page.click('#btn-paste-open');
  await page.waitForTimeout(250);
  var pasteAfter = await page.evaluate(function () { return $('#paste-box').style.display });
  truthy('กดแล้วช่องวางข้อความยังสลับเปิด/ปิดได้เหมือนเดิม', pasteBefore !== pasteAfter);
  await page.click('#btn-paste-open');
  await page.waitForTimeout(200);
  eq('กดอีกทีกลับมาเป็นเหมือนเดิม',
    await page.evaluate(function () { return $('#paste-box').style.display }), pasteBefore);

  console.log('\n   แถบล่างหกปุ่ม ชื่อใหม่ + ไอคอนเป็นรูปจริง');
  var bar38 = await page.evaluate(function () {
    var bs = $$('.tabs button');
    return {
      labels: bs.map(function (b) { return b.querySelector('b').textContent.trim() }),
      en: bs.map(function (b) { return b.querySelector('em').textContent.trim() }),
      gos: bs.map(function (b) { return b.dataset.go }),
      imgs: bs.map(function (b) {
        var im = b.querySelector('img');
        if (!im) return null;
        var r = im.getBoundingClientRect();
        return { w: Math.round(r.width), h: Math.round(r.height),
                 nat: im.naturalWidth, src: im.src.slice(0, 14) };
      }),
      h: Math.round($('.tabs').getBoundingClientRect().height)
    };
  });
  eq('ชื่อปุ่มภาษาไทยตรงตามที่เจ้าของร้านวางไว้', bar38.labels,
    ['คีย์ออเดอร์', 'ออเดอร์ทั้งหมด', 'รับเข้าสินค้า', 'ใบเสนอราคา', 'ปิดยอดวัน', 'สรุปยอด']);
  eq('และมีชื่ออังกฤษบรรทัดเล็กใต้ลงมา', bar38.en,
    ['New Order', 'All Orders', 'Stock In', 'Quotation', 'Daily Report', 'Summary']);
  eq('หน้าที่ของแต่ละปุ่มไม่ได้สลับกัน', bar38.gos,
    ['new', 'list', 'recv', 'quote', 'day', 'sum']);
  truthy('ทุกปุ่มมีรูปไอคอนจริง ไม่ใช่ตัวอักษรสัญลักษณ์',
    bar38.imgs.every(function (x) { return x && x.src === 'data:image/png' }));
  truthy('รูปโหลดขึ้นจริงทุกอัน ไม่มีอันไหนเป็นรูปเสีย',
    bar38.imgs.every(function (x) { return x.nat > 0 }));
  truthy('ไอคอนสูงเท่ากันหมด ป้าย ORDER ที่เป็นแนวนอนก็ไม่ลีบกว่าเพื่อน',
    (function () {
      var hs = bar38.imgs.map(function (x) { return x.h });
      return Math.max.apply(null, hs) - Math.min.apply(null, hs) <= 1;
    })());
  truthy('แถบล่างไม่สูงเกินไปจนกินที่อ่านข้อมูล (' + bar38.h + 'px)', bar38.h <= 92);

  console.log('\n   ไอคอนของปุ่มที่ยืนอยู่ต้องเข้มกว่าปุ่มอื่น');
  var dim38 = await page.evaluate(function () {
    return $$('.tabs button').map(function (b) {
      return { on: b.classList.contains('on'),
               op: getComputedStyle(b.querySelector('img')).opacity };
    });
  });
  truthy('ปุ่มที่เลือกอยู่ไอคอนทึบเต็มที่',
    dim38.filter(function (x) { return x.on })[0].op === '1');
  truthy('ปุ่มอื่นหรี่ลง จะได้รู้ว่ายืนอยู่หน้าไหน',
    dim38.filter(function (x) { return !x.on }).every(function (x) { return Number(x.op) < 1 }));

  console.log('\n   ชื่อร้านต้องไม่ถูกตัดท้ายด้วยจุดสามจุด');
  truthy('ชื่อร้านแสดงครบทุกตัวอักษร', await page.evaluate(function () {
    var b = $('#brand');
    return b.scrollWidth <= b.clientWidth + 1;
  }));

  /* ---------- 37. ลูกค้าคืนของ / ของตีกลับ ---------- */
  console.log('\n37. ลูกค้าคืนของ / ของตีกลับ');
  await page.click('.tabs button[data-go="list"]');
  await page.waitForTimeout(400);
  await page.evaluate(function () {
    /* ใบสดใบใหม่ ไม่ให้ชนกับใบที่หมวดก่อน ๆ แก้ไปแล้ว */
    MOCK_ORDERS.unshift({
      no: 'AST-26-0090', date: '2026-08-28', channel: 'เพจ Facebook',
      cust: 'คุณตีกลับ ทดสอบ', tel: '0800000009', addr: 'ที่อยู่ทดสอบ',
      carrier: 'Flash Express', track: '', vat: 'ไม่รับ VAT',
      discount: 0, ship: 50, status: 'ส่งแล้ว', staff: 'somchai@chem-inno-tech.com',
      note: '', subtotal: 600, vatAmt: 0, net: 650, cost: 200, profit: 400, check: 'OK',
      items: [{ sku: 'SKU-141', name: 'ดอกกัดทดสอบ', unit: 'ชิ้น',
                qty: 6, price: 100, total: 600, lot: '' }]
    });
    ORDERS = []; SUM_CACHE = null; loadOrders();
  });
  await page.waitForTimeout(700);

  truthy('มีปุ่มคืนของแยกจากปุ่มยกเลิกบนแถวออเดอร์', await page.evaluate(function () {
    var row = $$('#list .row')[0];
    return !!row.querySelector('[data-rt]') && !!row.querySelector('[data-cx]');
  }));
  await page.click('#list .row [data-rt]');
  await page.waitForTimeout(400);
  truthy('เปิดหน้าต่างคืนของได้', /ตีกลับ/.test(await page.textContent('#m-title')));
  truthy('บอกว่าค่าจัดส่งจะถูกล้าง เพราะของไม่ได้อยู่กับลูกค้าแล้ว',
    /ค่าจัดส่งจะถูกล้าง/.test(await page.textContent('#m-body')));
  truthy('ช่องจำนวนตั้งต้นเป็น 0 ไม่ใช่คืนทั้งใบให้เอง',
    await page.evaluate(function () { return $('#rt-q0').value }) === '0');

  console.log('\n   ยังไม่ใส่จำนวน / ไม่บอกเหตุผล ต้องไม่ยอมให้บันทึก');
  await page.click('#rt-go');
  await page.waitForTimeout(300);
  truthy('ไม่ใส่จำนวนแล้วเตือน', /ยังไม่ได้ใส่จำนวน/.test(await page.textContent('#rt-msg')));
  await page.fill('#rt-q0', '2');
  await page.click('#rt-go');
  await page.waitForTimeout(300);
  truthy('ใส่จำนวนแล้วแต่ไม่บอกเหตุผล ก็ยังเตือน',
    /5 ตัวอักษร/.test(await page.textContent('#rt-msg')));
  truthy('ยังไม่ได้ยิงขึ้นชีทเลยสักครั้ง', await page.evaluate(function () {
    return (window.SENT || []).filter(function (x) { return x.fn === 'returnOrder' }).length === 0;
  }));
  await page.fill('#rt-q0', '9');
  await page.fill('#rt-why', 'ที่อยู่ผิด ส่งไม่ถึง');
  await page.click('#rt-go');
  await page.waitForTimeout(300);
  truthy('คืนมากกว่าที่ขายไป ต้องเตือนก่อนถึงชีท',
    /มากกว่าที่ขายไป/.test(await page.textContent('#rt-msg')));

  console.log('\n   คืนบางส่วน — ยอดเหลือเท่าที่ลูกค้าเก็บไว้');
  page.once('dialog', function (d) { d.accept() });
  await page.fill('#rt-q0', '2');
  await page.click('#rt-go');
  await page.waitForTimeout(700);
  truthy('บอกว่าคืนอะไรเข้าสต๊อกไปบ้าง',
    /SKU-141 x2/.test(await page.textContent('#rt-msg')));
  var after37 = await page.evaluate(function () {
    var o = MOCK_ORDERS.filter(function (x) { return x.no === 'AST-26-0090' })[0];
    return { qty: o.items[0].qty, net: o.net, ship: o.ship, status: o.status, note: o.note };
  });
  eq('บรรทัดสินค้าเหลือจำนวนที่ลูกค้าเก็บไว้', after37.qty, 4);
  eq('ค่าจัดส่งถูกล้าง', after37.ship, 0);
  eq('ยอดเหลือเท่าของที่ลูกค้าเก็บไว้', after37.net, 400);
  truthy('สถานะยังไม่ตาย เพราะลูกค้ายังเก็บของไว้', after37.status === 'ส่งแล้ว');
  truthy('หมายเหตุจดว่าคืนอะไรเพราะอะไร',
    /ตีกลับบางส่วน: SKU-141 x2/.test(after37.note) && /ที่อยู่ผิด/.test(after37.note));

  console.log('\n   ปุ่ม "คืนทั้งใบ" แล้วบันทึก — ยอดเป็นศูนย์ สถานะกลายเป็นตีกลับ');
  /* หน้าต่างค้างเปิดไว้โชว์ผลโดยตั้งใจ (เหมือนหน้ายกเลิก) ปิดเองก่อนเปิดใบต่อไป */
  await page.evaluate(function () { closeModal() });
  await page.waitForTimeout(300);
  await page.click('#list .row [data-rt]');
  await page.waitForTimeout(400);
  await page.click('#rt-all');
  await page.waitForTimeout(200);
  eq('ปุ่มคืนทั้งใบเติมจำนวนเต็มให้',
    await page.evaluate(function () { return $('#rt-q0').value }), '4');
  await page.fill('#rt-why', 'เก็บเงินปลายทางไม่ได้');
  page.once('dialog', function (d) { d.accept() });
  await page.click('#rt-go');
  await page.waitForTimeout(700);
  var whole37 = await page.evaluate(function () {
    var o = MOCK_ORDERS.filter(function (x) { return x.no === 'AST-26-0090' })[0];
    return { net: o.net, status: o.status, items: o.items.length, note: o.note };
  });
  eq('ยอดเป็นศูนย์', whole37.net, 0);
  eq('สถานะเป็น "ตีกลับ" ไม่ใช่ "ยกเลิก"', whole37.status, 'ตีกลับ');
  eq('รายการสินค้าถูกรื้อออกหมด', whole37.items, 0);
  truthy('หมายเหตุใช้คำว่าตีกลับ', /\[ตีกลับ: /.test(whole37.note));

  console.log('\n   ใบที่ตีกลับแล้วต้องไม่มีปุ่มอะไรให้กดต่อ');
  await page.evaluate(function () { closeModal(); ORDERS = []; SUM_CACHE = null; loadOrders() });
  await page.waitForTimeout(700);
  var deadRow = await page.evaluate(function () {
    var rows = $$('#list .row');
    for (var i = 0; i < rows.length; i++) {
      if (rows[i].textContent.indexOf('AST-26-0090') > -1) {
        return { btns: rows[i].querySelectorAll('.acts button').length,
                 txt: rows[i].textContent };
      }
    }
    return null;
  });
  truthy('ไม่มีปุ่มเหลือให้กดเลย', deadRow && deadRow.btns === 0);
  truthy('บอกว่าตีกลับแล้ว ไม่ใช่เขียนว่ายกเลิกแล้ว',
    deadRow && /ตีกลับแล้ว/.test(deadRow.txt) && !/ยกเลิกแล้ว/.test(deadRow.txt));
  truthy('ป้ายสถานะเป็นสีแดงเหมือนใบที่ยกเลิก',
    await page.evaluate(function () { return statusTag('ตีกลับ') }) === 'bad');
  truthy('ใบที่ตีกลับไม่ไปโผล่ในรายการค้างชำระ', await page.evaluate(function () {
    return !$$('#due-list .row').filter(function (r) {
      return r.textContent.indexOf('AST-26-0090') > -1;
    }).length;
  }));

  /* ---------- 36. ช่องทางขายที่มีตราของตัวเอง ต้องเด่นออกมาจากใบที่คีย์เอง ---------- */
  console.log('\n36. ช่องทางขาย Shopee กับ Facebook — โลโก้ + สีประจำแบรนด์');
  var chanFn = await page.evaluate(function () {
    return {
      shopee:  chanTag('Shopee'),
      thai:    chanTag('ช้อปปี้'),
      lower:   chanTag('shopee'),
      page:    chanTag('เพจ Facebook'),
      fbEn:    chanTag('Facebook'),
      fbTh:    chanTag('เฟซบุ๊ก'),
      shop:    chanTag('หน้าร้าน'),
      line:    chanTag('LINE OA'),
      blank:   chanTag(''),
      inject:  chanTag('<img onerror=alert(1)>')
    };
  });
  truthy('Shopee ได้คลาสสีส้ม', /chan-shopee/.test(chanFn.shopee));
  truthy('Shopee ได้โลโก้ติดมาด้วย', /<img /.test(chanFn.shopee));
  truthy('เขียนเป็นภาษาไทยว่า "ช้อปปี้" ก็จับได้', /chan-shopee/.test(chanFn.thai));
  truthy('พิมพ์เล็กก็จับได้', /chan-shopee/.test(chanFn.lower));
  /* ชื่อช่องทางมาจากชีท คนพิมพ์เองได้ ต้องจับได้ทุกแบบที่ร้านเขียนจริง */
  truthy('เพจ Facebook ได้คลาสสีน้ำเงิน', /chan-fb/.test(chanFn.page));
  truthy('เพจ Facebook ได้โลโก้ติดมาด้วย', /<img /.test(chanFn.fbEn));
  truthy('เขียนว่า Facebook เฉย ๆ ก็จับได้', /chan-fb/.test(chanFn.fbEn));
  truthy('เขียนเป็นภาษาไทยว่า "เฟซบุ๊ก" ก็จับได้', /chan-fb/.test(chanFn.fbTh));
  /* สองตราต้องไม่ปนกัน ใบ Shopee ห้ามได้คลาสของ Facebook */
  truthy('Shopee ไม่ได้คลาสของ Facebook', !/chan-fb/.test(chanFn.shopee));
  truthy('Facebook ไม่ได้คลาสของ Shopee', !/chan-shopee/.test(chanFn.page));
  eq('ช่องทางที่ไม่มีตรา เขียนเหมือนเดิมทุกอย่าง', chanFn.shop, 'หน้าร้าน');
  eq('LINE ก็เหมือนเดิม ยังไม่มีตรา', chanFn.line, 'LINE OA');
  eq('ไม่มีช่องทางขาย ขึ้นขีดเหมือนเดิม', chanFn.blank, '-');
  /* ชื่อช่องทางมาจากชีท ซึ่งคนพิมพ์เองได้ ห้ามให้แท็กหลุดเข้าไปในหน้าเว็บ */
  truthy('ชื่อช่องทางที่มีแท็ก html ต้องถูกกันไว้ ไม่หลุดเป็นแท็กจริง',
    chanFn.inject.indexOf('&lt;img') > -1 && chanFn.inject.indexOf('<img onerror') < 0);

  console.log('\n   ของจริงบนลิสต์ออเดอร์');
  await page.click('.tabs button[data-go="list"]');
  await page.waitForTimeout(400);
  /* หมวดก่อนหน้าโหลดลิสต์ค้างไว้แล้ว ต้องล้างแล้วโหลดใหม่ ไม่งั้นได้ของเก่าที่ยังไม่มี Shopee */
  await page.evaluate(function () {
    MOCK_ORDERS[0].channel = 'Shopee';
    MOCK_ORDERS[0].cust = 'ลูกค้า Shopee 260901UGWWV9E1';
    /* ใบที่สองเป็น Facebook — สองตราต้องอยู่ในลิสต์เดียวกันได้โดยไม่ปนกัน */
    MOCK_ORDERS[1].channel = 'เพจ Facebook';
    ORDERS = []; SUM_CACHE = null;
    loadOrders();
  });
  await page.waitForTimeout(700);
  var chanSeen = await page.evaluate(function () {
    var el = document.querySelector('#list .chan-shopee');
    if (!el) return null;
    var im = el.querySelector('img');
    return { color: getComputedStyle(el).color, w: im ? Math.round(im.getBoundingClientRect().width) : 0 };
  });
  truthy('บนลิสต์จริงเป็นสีส้มของ Shopee ไม่ใช่สีเทาเหมือนช่องทางอื่น',
    chanSeen && chanSeen.color === 'rgb(238, 77, 45)');
  truthy('โลโก้ขึ้นจริงและมีขนาดพอดีบรรทัด ไม่ดันบรรทัดให้สูงขึ้น',
    chanSeen && chanSeen.w > 8 && chanSeen.w < 20);

  var fbSeen = await page.evaluate(function () {
    var el = document.querySelector('#list .chan-fb');
    if (!el) return null;
    var im = el.querySelector('img');
    return { color: getComputedStyle(el).color,
             w: im ? Math.round(im.getBoundingClientRect().width) : 0,
             /* ทั้งสองตราต้องอยู่ในลิสต์พร้อมกันได้ ไม่ใช่มีได้ทีละอัน */
             both: !!document.querySelector('#list .chan-shopee') };
  });
  truthy('บนลิสต์จริงเป็นสีน้ำเงินของ Facebook',
    fbSeen && fbSeen.color === 'rgb(24, 119, 242)');
  truthy('โลโก้ Facebook ขึ้นจริงและขนาดเท่ากับของ Shopee',
    fbSeen && fbSeen.w > 8 && fbSeen.w < 20);
  truthy('สองช่องทางอยู่ในลิสต์เดียวกันได้ ไม่ทับกัน', fbSeen && fbSeen.both);

  /* ---------- 35. หน่วยที่ขึ้นต้นด้วยตัวเลข ---------- */
  console.log('\n35. จำนวนกับหน่วยต้องไม่อ่านติดกันเป็นเลขเดียว');
  var qu = await page.evaluate(function () {
    return {
      packNum:  qtyUnit(1, '10'),
      packWord: qtyUnit(1, '10pcs'),
      normal:   qtyUnit(3, 'ชิ้น'),
      blank:    qtyUnit(3, ''),
      spaces:   qtyUnit(3, '   '),
      decimal:  qtyUnit(2, '2.5'),
      comma:    qtyUnit(2, '1,000'),
      ml:       qtyUnit(1, '500ml'),
      dash:     qtyUnit(1, '-')
    };
  });
  eq('หน่วยเป็นตัวเลขล้วน = คนกรอกใส่ขนาดบรรจุมา ไม่ใช่หน่วย จึงไม่พิมพ์',
    qu.packNum, '1');
  eq('หน่วยขึ้นต้นด้วยตัวเลข ใส่วงเล็บคั่นให้เห็นว่าคนละตัวเลข',
    qu.packWord, '1 (10pcs)');
  eq('หน่วยปกติเขียนเหมือนเดิมทุกอย่าง', qu.normal, '3 ชิ้น');
  eq('ไม่มีหน่วย พิมพ์แต่จำนวน', qu.blank, '3');
  eq('หน่วยที่เป็นช่องว่างล้วน ถือว่าไม่มีหน่วย', qu.spaces, '3');
  eq('ทศนิยมก็เป็นตัวเลขล้วน', qu.decimal, '2');
  eq('ตัวเลขมีลูกน้ำก็ยังเป็นตัวเลขล้วน', qu.comma, '2');
  eq('หน่วยจริงที่ขึ้นต้นด้วยตัวเลข (500ml) ยังพิมพ์อยู่ แค่ใส่วงเล็บ',
    qu.ml, '1 (500ml)');
  eq('เครื่องหมายขีด (บรรทัดส่วนลด) ไม่ใช่ตัวเลข พิมพ์ตามเดิม', qu.dash, '1 -');

  console.log('\n   ของจริง: ใบเสนอราคาที่วาดออกมาต้องไม่มีคำว่า "1 10"');
  var drawn = await page.evaluate(async function () {
    var seen = [];
    var real = window.fitCenter;
    window.fitCenter = function (x, text) { seen.push(String(text)); return real.apply(null, arguments) };
    try {
      await buildDocPage({
        no: 'QO26-00006', type: 'ใบเสนอราคา', date: '2026-09-09',
        base: 2300, vat: 0, total: 2300,
        lines: [
          { name: 'Set Single Flute Endmill 1F 2.0*22*3.175*45L (10pcs)',
            po: '', qty: 1, unit: '10', price: 900, amount: 900 },
          { name: 'Set Single Flute 1F 3.175*22*3.175*45L',
            po: '', qty: 1, unit: '10pcs', price: 1400, amount: 1400 }
        ]
      }, { cust: { name: 'บริษัททดสอบ จำกัด' } }, CFG.doc || {}, 'ต้นฉบับ');
    } finally { window.fitCenter = real; }
    return seen;
  });
  truthy('ไม่มีช่องไหนพิมพ์ว่า "1 10" ให้ลูกค้าอ่านเป็น 110',
    drawn.indexOf('1 10') === -1);
  truthy('ยังพิมพ์จำนวน 1 อยู่ ไม่ได้หายไปทั้งช่อง', drawn.indexOf('1') > -1);
  truthy('บรรทัดที่หน่วยเป็น 10pcs ได้วงเล็บคั่นให้', drawn.indexOf('1 (10pcs)') > -1);

  /* ---------- 32. คู่มือใช้งาน ---------- */
  console.log('\n32. คู่มือใช้งาน');
  await page.click('.tabs button[data-go="recv"]');
  await page.waitForTimeout(300);
  await page.click('#fs-help');
  await page.waitForTimeout(300);
  truthy('เปิดคู่มือจากปุ่ม ? บนหัวจอได้',
    await page.evaluate(function () { return $('#pg-help').style.display !== 'none' }));
  truthy('มีหัวข้อครบทุกงานหลัก', await page.evaluate(function () {
    return $$('#pg-help details').length >= 11;
  }));
  truthy('มีเรื่องใบที่ตีกลับของ Shopee อยู่ในคู่มือ',
    /ตีกลับ/.test(await page.textContent('#pg-help')));
  truthy('มีกฎห้ามลบทั้งแถวในชีท',
    /ลบทั้งแถว/.test(await page.textContent('#pg-help')));
  truthy('คู่มือแยกให้ชัดว่ายกเลิกกับตีกลับไม่เหมือนกัน',
    /ยกเลิก กับ ตีกลับ ไม่เหมือนกัน/.test(await page.textContent('#pg-help')));
  truthy('คู่มือบอกว่าพิมพ์หมายเลขคำสั่งซื้อ Shopee ในช่องค้นหาได้',
    /หมายเลขคำสั่งซื้อ Shopee ในช่องค้นหา/.test(await page.textContent('#pg-help')));
  truthy('คู่มือบอกว่าลูกค้าตกลงตามใบเสนอราคาแล้วต้องกดตรงไหน',
    /ลูกค้าสั่งแล้ว → ทำเป็นออเดอร์/.test(await page.textContent('#pg-help')));
  truthy('คู่มือมีวิธีคีย์ออเดอร์ซ้ำให้ลูกค้าประจำ',
    /คีย์ออเดอร์ซ้ำ/.test(await page.textContent('#pg-help')));
  /* ใบที่คีย์ซ้ำเป็นใบใหม่ ไม่ใช่ใบเดิม — ถ้าเข้าใจผิดจะกลายเป็นส่งของสองรอบ */
  truthy('คู่มือเตือนว่าใบที่คีย์ซ้ำเป็นใบใหม่ ต้องกดบันทึกเอง',
    /ใบที่คีย์ซ้ำเป็นใบใหม่เสมอ/.test(await page.textContent('#pg-help')));
  await page.click('#hp-back');
  await page.waitForTimeout(300);
  truthy('กดกลับแล้วได้หน้าเดิมที่ยืนอยู่ก่อนเปิดคู่มือ',
    await page.evaluate(function () { return $('#pg-recv').style.display !== 'none' }));

  /* ---------- 40. แถวออเดอร์ — ปุ่มรูปจริง 8 อัน กับสามเหลี่ยมบอกงานถัดไป ---------- */
  console.log('\n40. แถวออเดอร์ — ไอคอนรูปจริงกับสามเหลี่ยมสี');
  await page.click('.tabs button[data-go="list"]');
  await page.waitForTimeout(300);
  var keep40 = await page.evaluate(function () { return JSON.stringify(MOCK_ORDERS) });
  await page.evaluate(function () {
    function mk(no, cust, status, acct) {
      return { no: no, date: '2026-09-01', channel: 'เพจ Facebook', cust: cust,
               tel: '', addr: '', carrier: 'Flash Express', track: '', vat: 'ไม่รับ VAT',
               discount: 0, ship: 0, status: status, acct: acct, staff: '', note: '',
               subtotal: 100, vatAmt: 0, net: 100, cost: 40, profit: 60, check: 'OK',
               items: [{ sku: 'SKU-141', name: 'ของทดสอบ', unit: 'ชิ้น',
                         qty: 1, price: 100, total: 100, lot: '' }] };
    }
    MOCK_ORDERS.length = 0;
    MOCK_ORDERS.push(
      mk('F-1', 'ใบยังไม่ได้เงิน',  'รอชำระ',   ''),
      mk('F-2', 'ได้เงินแล้ว',      'ชำระแล้ว', ''),
      mk('F-3', 'เอกสารครบ',        'ชำระแล้ว', 'พร้อมส่งบัญชี'),
      mk('F-4', 'จบงานแล้ว',        'ชำระแล้ว', 'ส่งบัญชีแล้ว'),
      mk('F-5', 'ใบที่ตีกลับ',      'ตีกลับ',   'ส่งบัญชีแล้ว')
    );
    ORDERS = []; SUM_CACHE = null;
    loadOrders();
  });
  await page.waitForTimeout(700);
  var seen40 = await page.evaluate(function () {
    var out = { legend: [], rows: [] };
    $$('#list .flagkey span').forEach(function (s) {
      var i = s.querySelector('i');
      out.legend.push({ text: s.textContent.trim(),
                        color: i ? getComputedStyle(i).borderBottomColor : '' });
    });
    $$('#list .row').forEach(function (r) {
      var b = r.querySelector('.i b');
      var f = b && b.querySelector('.flag');
      var q = function (sel) { return [].slice.call(r.querySelectorAll(sel)) };
      var btns = q('.acts .sq');
      var tops = {};
      btns.forEach(function (x) { tops[Math.round(x.getBoundingClientRect().top)] = 1 });
      out.rows.push({
        cust: b ? b.textContent.trim() : '',
        flags: q('.flag').length,
        key: f ? f.className.replace('flag', '').trim() : null,
        color: f ? getComputedStyle(f).borderBottomColor : '',
        /* สามเหลี่ยมต้องอยู่บรรทัดเดียวกับชื่อ ไม่ใช่ลอยอยู่บรรทัดของตัวเอง */
        inline: f ? Math.abs(f.getBoundingClientRect().top - b.getBoundingClientRect().top) < 20 : false,
        btns: btns.length,
        icons: q('.acts .sqic').length,
        lines: Object.keys(tops).length,
        srcs: q('.acts .sqic').map(function (im) { return im.getAttribute('src').slice(-40) }),
        iconW: btns.length ? Math.round(r.querySelector('.sqic').getBoundingClientRect().width) : 0
      });
    });
    return out;
  });

  eq('คำอธิบายสีขึ้นครั้งเดียวเหนือลิสต์ ครบสี่สถานะ', seen40.legend.length, 4);
  eq('เรียงตามลำดับความเร่งของงาน', seen40.legend.map(function (x) { return x.text }),
    ['รอชำระ', 'ยังไม่ส่งบัญชี', 'พร้อมส่งบัญชี', 'ส่งบัญชีแล้ว']);
  eq('สี่สีต้องไม่ซ้ำกันเลย ไม่งั้นแยกด้วยตาไม่ออก',
    seen40.legend.map(function (x) { return x.color }).filter(function (c, i, a) {
      return a.indexOf(c) === i;
    }).length, 4);

  eq('ทุกใบมีสามเหลี่ยมได้ไม่เกินอันเดียว',
    seen40.rows.map(function (r) { return r.flags }), [1, 1, 1, 1, 0]);
  eq('ยังไม่ได้เงิน = น้ำเงิน (เรื่องเร่งที่สุด)', seen40.rows[0].color, 'rgb(0, 71, 194)');
  eq('ได้เงินแล้วแต่บัญชียังไม่ได้เอกสาร = แดง', seen40.rows[1].color, 'rgb(196, 2, 21)');
  eq('เอกสารครบ รอกดส่ง = เขียว', seen40.rows[2].color, 'rgb(134, 215, 109)');
  eq('ส่งบัญชีแล้ว จบงาน = เหลือง', seen40.rows[3].color, 'rgb(254, 219, 4)');
  truthy('ใบที่ตีกลับไม่มีงานให้ทำต่อ จึงไม่มีสามเหลี่ยม', seen40.rows[4].key === null);
  truthy('สามเหลี่ยมอยู่หน้าชื่อลูกค้าในบรรทัดเดียวกัน',
    seen40.rows.slice(0, 4).every(function (r) { return r.inline }));

  eq('ใบที่ยังทำงานต่อได้มีปุ่มครบแปดอัน',
    seen40.rows.slice(0, 4).map(function (r) { return r.btns }), [8, 8, 8, 8]);
  eq('ทุกปุ่มเป็นรูปจริง ไม่มีปุ่มไหนตกกลับไปเป็นตัวอักษร',
    seen40.rows.slice(0, 4).map(function (r) { return r.icons }), [8, 8, 8, 8]);
  /* แปดปุ่มตกบรรทัด = ปุ่มสุดท้ายลอยเดี่ยวใต้แถว ดูเหมือนปุ่มแปลกที่ไม่เข้าพวก */
  eq('ปุ่มทั้งแปดอยู่บรรทัดเดียวกันบนจอมือถือ',
    seen40.rows.slice(0, 4).map(function (r) { return r.lines }), [1, 1, 1, 1]);
  eq('รูปแปดอันต้องเป็นคนละรูปกันทั้งหมด ไม่มีปุ่มไหนใช้รูปซ้ำ',
    seen40.rows[0].srcs.filter(function (s, i, a) { return a.indexOf(s) === i }).length, 8);
  truthy('ไอคอนใหญ่พอให้เห็นว่าเป็นรูปอะไร ไม่ใช่จุดเล็ก ๆ',
    seen40.rows[0].iconW >= 14);
  eq('ใบที่ตีกลับไม่มีปุ่มให้กดเลย ของคืนสต๊อกไปแล้ว', seen40.rows[4].btns, 0);

  await page.evaluate(function (raw) {
    MOCK_ORDERS.length = 0;
    JSON.parse(raw).forEach(function (o) { MOCK_ORDERS.push(o) });
    ORDERS = []; SUM_CACHE = null;
    loadOrders();
  }, keep40);
  await page.waitForTimeout(500);

  /* ---------- 41. หน้าลูกค้า + คีย์ออเดอร์ซ้ำ ---------- */
  console.log('\n41. หน้าลูกค้า — ใครซื้อเท่าไร ค้างเท่าไร และคีย์ซ้ำจากใบเก่า');
  await page.click('.tabs button[data-go="list"]');
  await page.waitForTimeout(300);
  await page.evaluate(function () {
    /* ตั้งข้อมูลลูกค้าให้ครบสามแบบ: ซื้อเยอะ · ซื้อน้อยแต่จ่ายแล้ว · สั่งแล้วยกเลิก */
    function mk(no, cust, tel, date, net, status) {
      return { no: no, date: date, channel: 'เพจ Facebook', cust: cust, tel: tel,
               addr: 'ที่อยู่ ' + cust, carrier: 'Flash Express', track: '', vat: 'ไม่รับ VAT',
               discount: 0, ship: 50, status: status, acct: '', staff: '', note: '',
               subtotal: net - 50, vatAmt: 0, net: net, cost: 0, profit: net / 2, check: 'OK',
               items: [{ sku: 'SKU-141', name: 'ของทดสอบ', unit: 'ชิ้น',
                         qty: 2, price: (net - 50) / 2, total: net - 50, lot: '' }] };
    }
    MOCK_ORDERS.length = 0;
    MOCK_ORDERS.push(
      mk('CU-1', 'ลูกค้าประจำ',  '0811111111', '2026-09-05', 5050, 'ส่งแล้ว'),
      mk('CU-2', 'ลูกค้าประจำ',  '0811111111', '2026-09-06', 3050, 'ชำระแล้ว'),
      mk('CU-3', 'ลูกค้าขาจร',   '0822222222', '2026-09-07',  550, 'ชำระแล้ว'),
      mk('CU-4', 'ลูกค้ายกเลิก', '0833333333', '2026-09-08', 9050, 'ยกเลิก')
    );
    /* หมวดก่อนหน้าออกเอกสารไว้ ซึ่งของจริงก็นับเป็นลูกค้าเหมือนกัน
       หมวดนี้จะวัดเฉพาะลูกค้าที่ตั้งไว้เอง จึงล้างทะเบียนเอกสารด้วย */
    MOCK_DOCS.length = 0;
    CUSTS = null;              /* รายชื่อที่ cache ไว้ต้องโหลดใหม่ ไม่ใช่ใช้ของเก่า */
    ORDERS = []; SUM_CACHE = null;
  });
  await page.click('#btn-cust');
  await page.waitForTimeout(900);

  var cu41 = await page.evaluate(function () {
    var rows = [].slice.call(document.querySelectorAll('#cu-list .cu-row'));
    return {
      shown: $('#pg-cust').style.display !== 'none',
      /* เข้ามาจากหน้าออเดอร์ แท็บออเดอร์จึงต้องยังติดไฟอยู่ ไม่ใช่ดับทั้งแถบ */
      tab: (document.querySelector('.tabs button.on') || {}).dataset.go,
      n: rows.length,
      names: rows.map(function (r) { return r.querySelector('b').textContent }),
      first: rows[0].innerText.replace(/\n/g, ' | ')
    };
  });
  truthy('เปิดหน้าลูกค้าจากปุ่มบนหน้าออเดอร์ได้', cu41.shown);
  eq('แท็บออเดอร์ยังติดไฟไว้ ไม่ใช่ดับทั้งแถบจนไม่รู้ว่าอยู่ตรงไหน', cu41.tab, 'list');
  eq('รวมใบของคนเดียวกันเป็นบรรทัดเดียว', cu41.n, 3);
  eq('เรียงคนที่ซื้อล่าสุดขึ้นก่อน',
    cu41.names, ['ลูกค้ายกเลิก', 'ลูกค้าขาจร', 'ลูกค้าประจำ']);

  var sort41 = await page.evaluate(function () {
    function names() {
      return [].slice.call(document.querySelectorAll('#cu-list .cu-row b'))
        .map(function (b) { return b.textContent });
    }
    function tap(k) {
      document.querySelector('#cu-list .sorts button[data-cs="' + k + '"]').click();
      return names();
    }
    return { total: tap('total'), due: tap('due'), last: tap('last') };
  });
  /* คนที่สั่งแล้วยกเลิกทุกใบ ต้องไม่ขึ้นเป็นลูกค้าอันดับหนึ่งของร้าน */
  eq('เรียงตามยอดซื้อ ใบที่ยกเลิกไม่ถูกนับ',
    sort41.total, ['ลูกค้าประจำ', 'ลูกค้าขาจร', 'ลูกค้ายกเลิก']);
  eq('เรียงตามยอดค้าง คนที่ยังไม่จ่ายขึ้นก่อน', sort41.due[0], 'ลูกค้าประจำ');
  eq('กดกลับมาเรียงตามล่าสุดได้เหมือนเดิม', sort41.last[0], 'ลูกค้ายกเลิก');

  var find41 = await page.evaluate(function () {
    var q = $('#cu-q');
    function type(v) {
      q.value = v; q.oninput();
      return [].slice.call(document.querySelectorAll('#cu-list .cu-row b'))
        .map(function (b) { return b.textContent });
    }
    var byName = type('ขาจร');
    var byTel  = type('0811111111');
    var none   = type('ไม่มีคนนี้');
    var back   = type('');
    return { byName: byName, byTel: byTel, none: none, back: back.length };
  });
  eq('ค้นด้วยชื่อบางส่วน', find41.byName, ['ลูกค้าขาจร']);
  eq('ค้นด้วยเบอร์โทรก็ได้', find41.byTel, ['ลูกค้าประจำ']);
  eq('ไม่เจอก็บอกตรง ๆ ไม่ใช่โชว์ทุกคน', find41.none, []);
  eq('ล้างคำค้นแล้วกลับมาครบ', find41.back, 3);

  console.log('\n   กดชื่อลูกค้าแล้วได้ประวัติทุกใบ');
  await page.evaluate(function () { $('#cu-q').value = ''; $('#cu-q').oninput(); });
  /* เลือกจากชื่อ ไม่ใช่ลำดับที่เท่าไร ข้อสอบจะได้ไม่พังตอนเพิ่มบรรทัดหัวตาราง */
  await page.evaluate(function () {
    [].slice.call(document.querySelectorAll('#cu-list .cu-row')).filter(function (r) {
      return r.querySelector('b').textContent === 'ลูกค้าประจำ';
    })[0].click();
  });
  await page.waitForTimeout(800);
  var his41 = await page.evaluate(function () {
    var kpi = {};
    $$('#cu-body .kpi').forEach(function (k) {
      kpi[k.querySelector('span').textContent] = k.querySelector('b').textContent;
    });
    return { title: $('#m-head') ? $('#m-head').textContent : document.title,
             kpi: kpi, rows: $$('#cu-body .row').length,
             repeats: $$('#cu-body [data-rp]').length };
  });
  eq('ซื้อไปแล้วสองใบ', his41.kpi['ซื้อไปแล้ว'], '2 ใบ');
  eq('ยอดรวมสองใบ', his41.kpi['ยอดรวม'], '฿8,100.00');
  eq('กำไรจากลูกค้ารายนี้', his41.kpi['กำไรจากลูกค้ารายนี้'], '฿4,050.00');
  eq('เฉลี่ยต่อใบ', his41.kpi['เฉลี่ยต่อใบ'], '฿4,050.00');
  eq('ค้างใบเดียว เพราะอีกใบเก็บเงินแล้ว', his41.kpi['ค้างชำระ'], '1 ใบ');
  eq('ยอดที่ค้าง', his41.kpi['ยอดที่ค้าง'], '฿5,050.00');
  eq('ขึ้นทุกใบของลูกค้ารายนี้', his41.rows, 2);
  eq('ทุกใบมีปุ่มคีย์ออเดอร์ซ้ำ', his41.repeats, 2);

  console.log('\n   คีย์ออเดอร์ซ้ำจากใบเก่า');
  await page.click('#cu-body [data-rp="CU-1"]');
  await page.waitForTimeout(600);
  var rp41 = await page.evaluate(function () {
    return {
      page: $('#pg-new').style.display !== 'none',
      closed: !$('#modal').classList.contains('on'),
      cust: $('#f-cust').value, tel: $('#f-tel').value, addr: $('#f-addr').value,
      date: $('#f-date').value, track: $('#f-track').value, note: $('#f-note').value,
      ship: $('#f-ship').value,
      items: $$('#items .it').map(function (it) {
        return [it.querySelector('.i-sku').value, it.querySelector('.i-qty').value,
                it.querySelector('.i-price').value];
      })
    };
  });
  truthy('เด้งไปหน้าคีย์ออเดอร์ให้เลย', rp41.page);
  truthy('ปิดหน้าประวัติให้ด้วย ไม่ค้างทับฟอร์ม', rp41.closed);
  eq('ชื่อลูกค้ามาให้', rp41.cust, 'ลูกค้าประจำ');
  eq('เบอร์มาให้', rp41.tel, '0811111111');
  eq('ที่อยู่สามบรรทัดมาให้ ไม่ต้องพิมพ์ใหม่', rp41.addr, 'ที่อยู่ ลูกค้าประจำ');
  eq('ค่าส่งเดิมมาให้', rp41.ship, '50');
  eq('รายการสินค้ามาครบ พร้อมราคาที่เคยขายจริง',
    rp41.items, [['SKU-141', '2', '2500']]);
  /* เลขพัสดุกับหมายเหตุของใบเก่าติดมาด้วยไม่ได้เด็ดขาด — ใบใหม่ยังไม่ได้ส่ง
     ถ้าติดมา จะมีวันที่พิมพ์ใบปะหน้าออกมาด้วยเลขพัสดุของใบเมื่อเดือนก่อน */
  eq('เลขพัสดุของใบเก่าไม่ติดมา', rp41.track, '');
  eq('หมายเหตุของใบเก่าไม่ติดมา', rp41.note, '');
  var today41 = await page.evaluate(function () { return todayISO() });
  eq('วันที่เป็นวันนี้ ไม่ใช่วันของใบเก่า', rp41.date, today41);

  /* ---------- 42. เปิดหน้าอื่นก่อนสินค้าโหลดเสร็จ ---------- */
  console.log('\n42. กดเข้าหน้าอื่นก่อนรายการสินค้าจะโหลดเสร็จ');
  /* ของจริงที่เจ้าของร้านเจอ: เปิดแอปบนแท็บเล็ตแล้วกด "ใบเสนอราคา" ทันที
     ช่องเลือกสินค้าขึ้นแต่ "— เลือกสินค้า —" ว่างเปล่าค้างอยู่อย่างนั้นตลอด
     เพราะหน้านั้นสร้างแถวแรกครั้งเดียว แล้วสินค้ามาถึงทีหลัง */
  var slow42 = await page.evaluate(function () {
    var real = CFG.products;
    var out = {};
    CFG.products = [];                      /* จำลองว่าชีทยังตอบไม่ถึง */

    out.empty = prodOptions("");
    /* หน้าใบเสนอราคาถูกเปิดตอนนี้ — แถวแรกจึงเกิดตอนที่ยังไม่มีสินค้าสักตัว */
    $("#q-items").innerHTML = "";
    qAdd();
    var sel = $("#q-items .q-sku");
    out.before = sel.options.length;

    CFG.products = real;                    /* ชีทตอบกลับมาแล้ว */
    refreshProdOptions();
    out.after = sel.options.length;
    out.first = sel.options[0].value;
    return out;
  });
  truthy('ตอนยังโหลดไม่เสร็จ ต้องบอกว่ากำลังโหลด ไม่ใช่ปล่อยว่างให้เข้าใจว่าไม่มีสินค้า',
    /ยังโหลดรายการสินค้าไม่เสร็จ/.test(slow42.empty));
  eq('ช่องที่สร้างตอนนั้นมีแต่บรรทัดบอกสถานะ', slow42.before, 1);
  truthy('พอสินค้ามาถึง ช่องที่เปิดค้างไว้ต้องได้รายการครบ ไม่ใช่ค้างว่าง',
    slow42.after > 1);
  eq('บรรทัดแรกกลับมาเป็น “เลือกสินค้า” ตามปกติ', slow42.first, '');

  console.log('\n   ของที่เลือกค้างไว้ต้องไม่หายตอนเติมรายการให้');
  var keep42 = await page.evaluate(function () {
    var sku = CFG.products[0].sku;
    $("#q-items").innerHTML = "";
    qAdd();
    var sel = $("#q-items .q-sku");
    sel.value = sku;
    refreshProdOptions();
    return { want: sku, got: sel.value };
  });
  eq('สินค้าที่เลือกไว้ยังอยู่', keep42.got, keep42.want);

  console.log('\n   ช่องรับเข้าสินค้ากับหน้าคีย์ออเดอร์ก็ต้องได้ครบเหมือนกัน');
  var all42 = await page.evaluate(function () {
    var real = CFG.products;
    CFG.products = [];
    $("#r-sku").innerHTML = prodOptions("");
    $("#items").innerHTML = ""; addItem();
    var r = $("#r-sku"), i = $("#items .i-sku");
    var before = [r.options.length, i.options.length];
    CFG.products = real;
    refreshProdOptions();
    return { before: before, after: [r.options.length, i.options.length] };
  });
  eq('ก่อนโหลดเสร็จ ทั้งสองช่องมีแต่บรรทัดบอกสถานะ', all42.before, [1, 1]);
  truthy('โหลดเสร็จแล้วได้รายการครบทั้งสองช่อง',
    all42.after[0] > 1 && all42.after[1] > 1);

  /* ---------- 43. ประวัติใบเสนอราคา ---------- */
  console.log('\n43. ประวัติใบเสนอราคาที่เคยออก');
  await page.click('.tabs button[data-go="quote"]');
  await page.waitForTimeout(300);
  /* ยังไม่เคยออกใบสักใบ — กล่องว่างเปล่าอ่านได้ทั้ง "ไม่มีใบ" และ "แอปพัง"
     ซึ่งเป็นคนละเรื่องกัน ต้องเขียนออกมาให้ชัดว่าเป็นอันไหน */
  var keep43 = await page.evaluate(function () { return JSON.stringify(MOCK_DOCS) });
  await page.evaluate(function () { MOCK_DOCS.length = 0; drawOldDocs('', '#q-old') });
  await page.waitForTimeout(700);
  var none43 = await page.evaluate(function () {
    var b = $('#q-old');
    return { head: b.querySelector('.subhd') ? b.querySelector('.subhd').textContent : '',
             txt: b.innerText, again: b.querySelectorAll('button').length };
  });
  eq('ยังมีหัวข้อบอกว่านี่คือประวัติใบเสนอราคา', none43.head, 'ใบเสนอราคาที่เคยออก');
  truthy('บอกตรง ๆ ว่ายังไม่มีใบ ไม่ใช่กล่องเปล่า',
    /ยังไม่มีใบเสนอราคาที่เคยออก/.test(none43.txt));
  eq('มีปุ่มโหลดรายการใหม่ให้กดเองได้', none43.again, 1);

  console.log('\n   ออกใบแล้วต้องขึ้นในประวัติ พร้อมชื่อลูกค้า');
  await page.evaluate(function (raw) {
    MOCK_DOCS.length = 0;
    JSON.parse(raw).forEach(function (d) { MOCK_DOCS.push(d) });
  }, keep43);
  await page.evaluate(function () {
    /* ใบเสนอราคาสองใบของคนละบริษัท — ประวัติต้องแยกออกว่าใบไหนของใคร */
    MOCK_DOCS.push({
      no: 'QO26-09001', type: 'ใบเสนอราคา', date: '2026-09-09',
      cust: { name: 'บริษัท กอไก่ จำกัด' }, doc: { total: 1200 }, voidWhy: '', sentAt: ''
    });
    MOCK_DOCS.push({
      no: 'QO26-09002', type: 'ใบเสนอราคา', date: '2026-09-10',
      cust: { name: 'บริษัท ขอไข่ จำกัด' }, doc: { total: 3400 }, voidWhy: '', sentAt: ''
    });
    drawOldDocs('', '#q-old');
  });
  await page.waitForTimeout(700);
  var his43 = await page.evaluate(function () {
    var rows = [].slice.call(document.querySelectorAll('#q-old .row'));
    return { head: document.querySelector('#q-old .subhd').textContent,
             n: rows.length,
             top: rows[0].innerText.replace(/\n+/g, ' | '),
             names: rows.map(function (r) { return r.innerText }).join(' '),
             q2o: document.querySelectorAll('#q-old [data-q2o]').length };
  });
  truthy('หัวข้อบอกจำนวนใบด้วย', /ใบเสนอราคาที่เคยออก \(\d+ ใบ\)/.test(his43.head));
  truthy('ใบล่าสุดอยู่บนสุด', his43.top.indexOf('QO26-09002') === 0);
  /* เลขใบอย่างเดียวไม่มีใครจำได้ว่าใบไหนของใคร */
  truthy('มีชื่อลูกค้าทุกใบ',
    /กอไก่/.test(his43.names) && /ขอไข่/.test(his43.names));
  truthy('ทุกใบมีปุ่มทำเป็นออเดอร์', his43.q2o >= 2);

  console.log('\n   โหลดใบเก่าไม่ได้ ต้องบอกว่าไม่ได้ ไม่ใช่ขึ้นกล่องว่าง');
  var err43 = await page.evaluate(async function () {
    var real = google.script.run.listDocs;
    google.script.run.listDocs = function () { throw new Error('ชีทตอบไม่ได้') };
    try { drawOldDocs('', '#q-old') } catch (e) {}
    await new Promise(function (r) { setTimeout(r, 400) });
    var t = $('#q-old').innerText;
    google.script.run.listDocs = real;
    return t;
  });
  truthy('ขึ้นข้อความว่าดูใบเก่าไม่ได้', /ดูใบเก่าไม่ได้|ชีทตอบไม่ได้/.test(err43));
  await page.evaluate(function () { drawOldDocs('', '#q-old') });
  await page.waitForTimeout(500);

  /* ---------- 44. หน้าจอต้องไม่รอฟอนต์จาก Google ก่อนวาด ---------- */
  console.log('\n44. เปิดแอปแล้วต้องไม่รอไฟล์จากเน็ตก่อนวาดหน้าจอ');
  /* ของจริงที่เจ้าของร้านเจอ: เปิดแอปแล้วรู้สึกว่าโหลดช้า
     เหตุคือ <link> ฟอนต์ Sarabun ในหัวไฟล์เป็นแบบบล็อก เบราว์เซอร์จึงรอไฟล์
     จาก fonts.googleapis.com ให้เสร็จก่อนถึงจะวาดอะไรเลย — ทั้งที่หน้าจอแอป
     ใช้ฟอนต์ในเครื่อง ไม่ได้ใช้ Sarabun เลย (ใช้เฉพาะตอนวาดเอกสารลงกระดาษ) */
  var font44 = await page.evaluate(function () {
    var l = document.getElementById("fontcss");
    if (!l) return null;
    return { media: l.media, href: l.href, rel: l.rel,
             /* หน้าจอแอปต้องไม่พึ่ง Sarabun — ถ้าพึ่ง ตัวหนังสือจะกระโดดตอนฟอนต์มาถึง */
             bodyFont: getComputedStyle(document.body).fontFamily };
  });
  truthy('มี <link> ฟอนต์เอกสารอยู่ในหน้า', !!font44);
  truthy('ชี้ไปที่ Sarabun เหมือนเดิม', /fonts\.googleapis\.com/.test(font44.href));
  /* พอหน้าจอขึ้นแล้ว fontSwap สลับกลับเป็น all เอกสารจึงยังได้ฟอนต์ถูกตัว */
  eq('หน้าจอขึ้นแล้วสลับฟอนต์เป็นใช้งานจริง', font44.media, 'all');
  truthy('หน้าจอแอปใช้ฟอนต์ในเครื่อง ไม่ได้ใช้ Sarabun',
    font44.bodyFont.indexOf('Sarabun') < 0);

  /* ข้อสำคัญที่สุดของหมวดนี้ — วัดจากไฟล์จริงที่เสิร์ฟ ไม่ใช่จากหน้าที่โหลดเสร็จแล้ว
     ถ้าวันไหนมีคนลบ media="print" ออก อาการช้าจะกลับมาเงียบ ๆ โดยไม่มีอะไรฟ้อง */
  var raw44 = fs.readFileSync(FILE.replace('file://', ''), 'utf8');
  var tag44 = /<link[^>]*id="fontcss"[^>]*>/.exec(raw44);
  truthy('ในไฟล์ที่เสิร์ฟจริง แท็กฟอนต์ตั้ง media="print" ไว้ (ไม่บล็อกการวาดหน้าจอ)',
    tag44 && /media="print"/.test(tag44[0]));
  /* ไม่มีอะไรอื่นในหัวไฟล์ที่ต้องรอเน็ตอีก */
  var head44 = raw44.slice(0, raw44.indexOf('</head>'));
  var block44 = (head44.match(/<link[^>]*rel="stylesheet"[^>]*>/g) || []).filter(function (t) {
    return !/media="print"/.test(t);
  });
  eq('ไม่เหลือ stylesheet จากเน็ตที่บล็อกการวาดหน้าจออีก', block44, []);
  var ext44 = (head44.match(/<script[^>]*src=/g) || []);
  eq('หัวไฟล์ไม่มีสคริปต์จากเน็ตให้รอ', ext44, []);

  /* ---------- 45. แฟ้มเอกสาร + สรุปรายเดือน ---------- */
  console.log('\n45. แฟ้มเอกสาร & สรุปรายเดือน');
  await page.click('.tabs button[data-go="quote"]');
  await page.waitForTimeout(400);
  await page.click('#btn-file');
  await page.waitForTimeout(900);
  var fl45 = await page.evaluate(function () {
    return {
      shown: $('#pg-file').style.display !== 'none',
      /* เข้ามาจากหน้าใบเสนอราคา แท็บนั้นจึงต้องยังติดไฟอยู่ */
      tab: (document.querySelector('.tabs button.on') || {}).dataset.go,
      docCard: $('#fl-doc-card').style.display !== 'none',
      monthCard: $('#fl-month-card').style.display !== 'none'
    };
  });
  truthy('เปิดแฟ้มเอกสารจากหน้าใบเสนอราคาได้', fl45.shown);
  eq('แท็บใบเสนอราคายังติดไฟไว้', fl45.tab, 'quote');
  truthy('เปิดมาเจอเอกสารที่ออกแล้วก่อน', fl45.docCard && !fl45.monthCard);

  console.log('\n   แฟ้มเอกสาร — ใบคนละชนิดอยู่คนละแฟ้ม');
  /* ของเดิมหน้านี้เรียก listDocs ซึ่งคืนเฉพาะใบที่ไม่มีเลขออเดอร์
     ใบเสร็จ/ใบกำกับภาษีออกจากออเดอร์เสมอ จึงมีเลขออเดอร์ทุกใบ และไม่เคยโผล่ที่นี่เลยสักใบ
     ทั้งที่อยู่ในชีทครบ — เจ้าของร้านถามตรง ๆ ว่า "ใบกำกับภาษีที่ออกแล้วอยู่ไหน" */
  /* ข้อสอบก่อนหน้าล้างทะเบียนเอกสารทิ้งไปแล้ว ออกใบใหม่หนึ่งใบก่อน
     ออกจากออเดอร์จริงตามทางเดินปกติ ไม่ยัดแถวเข้าทะเบียนเอง
     ไม่งั้นที่ทดสอบคือทะเบียนที่เราปั้นเอง ไม่ใช่ใบที่ระบบออกจริง */
  await page.evaluate(function () { go('list') });
  await page.waitForTimeout(500);
  await page.evaluate(function () { openDoc((ORDERS || [])[0], 'rec') });
  await page.waitForTimeout(400);
  await page.click('#dc-make');
  /* หน้านี้มีปุ่ม #dc-copy อยู่สองที่ (ในกล่องออกเอกสาร กับในหน้าใบเสนอราคา)
     จึงรอที่ทะเบียนเอกสารแทน ชัดกว่าและไม่ขึ้นกับว่าปุ่มไหนโผล่ก่อน */
  await page.waitForFunction(function () { return MOCK_DOCS.length > 0 }, { timeout: 20000 });
  await page.evaluate(function () { closeModal() });
  await page.waitForTimeout(300);
  await page.evaluate(function () { go('quote') });
  await page.waitForTimeout(300);
  await page.click('#btn-file');
  await page.waitForTimeout(900);
  var fd45 = await page.evaluate(function () {
    return {
      folders: $$('#fl-docs .fold').map(function (f) {
        return f.querySelector('b').textContent;
      }),
      counts: $$('#fl-docs .fold').map(function (f) {
        return f.querySelector('.fold-n').textContent;
      }),
      icons: $$('#fl-docs .fold img.fold-ic').map(function (im) { return im.src }),
      rows: $$('#fl-docs .row').length
    };
  });
  eq('มีสี่แฟ้ม ชนิดละแฟ้ม', fd45.folders.length, 4);
  /* emoji ของเอกสารมีอยู่ไม่กี่ตัวและหน้าตาใกล้กันหมด 📃 กับ 📄 กับ 📝 แยกไม่ออกบนมือถือ
     ซึ่งพังตรงจุดที่ตั้งใจให้แยก จึงใช้รูปที่เจ้าของร้านทำมาเอง */
  eq('ทุกแฟ้มมีรูปของตัวเอง', fd45.icons.length, 4);
  truthy('เป็นรูปจริง ไม่ใช่ช่องว่าง', fd45.icons.every(function (s) {
    return /^data:image\//.test(s);
  }));
  eq('สี่แฟ้มใช้คนละรูป ไม่ซ้ำกัน',
    fd45.icons.filter(function (s, i) { return fd45.icons.indexOf(s) === i }).length, 4);
  truthy('แฟ้มใบเสร็จ/ใบกำกับภาษีมาก่อน เพราะเป็นใบที่ต้องใช้ยื่นภาษี',
    fd45.folders[0].indexOf('ใบกำกับภาษี') > -1);
  truthy('แฟ้มใบเสนอราคาแยกออกไปต่างหาก', fd45.folders.indexOf('ใบเสนอราคา') > -1);
  eq('หน้าแรกของแฟ้มยังไม่โชว์ใบสักใบ ต้องกดเข้าไปก่อน', fd45.rows, 0);
  truthy('แฟ้มใบกำกับภาษีมีใบอยู่จริง (ใบที่ออกไปตอนต้นข้อสอบ)',
    /\d+ ใบ/.test(fd45.counts[0]));

  var open45 = await page.evaluate(async function () {
    $('#fl-docs [data-fk="ใบเสร็จรับเงิน"]').click();
    await new Promise(function (r) { setTimeout(r, 700) });
    var rows = $$('#fl-docs .row');
    return {
      rows: rows.length,
      /* ในบรรทัดมีหลาย span (ชื่อลูกค้า / ชนิด·วันที่·ยอด) จึงต่อทั้งบรรทัดแล้วค่อยดู
         ชนิดใบอื่นต้องไม่โผล่ในแฟ้มนี้เลยแม้แต่คำเดียว */
      onlyThisKind: rows.map(function (r) {
        var t = r.querySelector('.i').textContent;
        return /ใบเสร็จรับเงิน/.test(t) && !/ใบเสนอราคา|ใบแจ้งหนี้|ใบรับเงินมัดจำ/.test(t);
      }),
      hasBack: !!$('#fl-docs .fold-back'),
      hasPrint: !!$('#fl-docs [data-rp]'),
      folders: $$('#fl-docs .fold').length
    };
  });
  truthy('กดแฟ้มแล้วเจอใบข้างใน', open45.rows > 0);
  truthy('ข้างในมีแต่ใบชนิดนั้นชนิดเดียว',
    open45.onlyThisKind.length > 0 && open45.onlyThisKind.every(Boolean));
  eq('ไม่มีแฟ้มอื่นปนอยู่ในนั้น', open45.folders, 0);
  truthy('ใบข้างในกดพิมพ์ซ้ำได้', open45.hasPrint);
  truthy('มีปุ่มกลับไปหน้าแฟ้ม', open45.hasBack);

  var back45 = await page.evaluate(async function () {
    $('#fl-docs .fold-back').click();
    await new Promise(function (r) { setTimeout(r, 600) });
    return { folders: $$('#fl-docs .fold').length, rows: $$('#fl-docs .row').length };
  });
  eq('กดกลับแล้วได้หน้าแฟ้มเหมือนเดิม', back45.folders, 4);
  eq('และไม่เหลือใบค้างอยู่', back45.rows, 0);

  console.log('\n   ค้นหาต้องเจอใบกำกับภาษี ทั้งที่ใบพวกนี้ผูกกับออเดอร์');
  var find45 = await page.evaluate(async function () {
    /* หาเลขใบจริงจากในแฟ้มก่อน แล้วค่อยเอาไปค้น จะได้ไม่ผูกกับเลขที่ตายตัว */
    $('#fl-docs [data-fk="ใบเสร็จรับเงิน"]').click();
    await new Promise(function (r) { setTimeout(r, 700) });
    var no = $('#fl-docs .row .i b').textContent.trim();
    $('#fl-docs .fold-back').click();
    await new Promise(function (r) { setTimeout(r, 500) });
    $('#fl-q').value = no;
    $('#fl-q').dispatchEvent(new Event('input'));
    await new Promise(function (r) { setTimeout(r, 800) });
    var out = {
      no: no, rows: $$('#fl-docs .row').length,
      first: ($('#fl-docs .row .i b') || {}).textContent,
      heads: $$('#fl-docs .subhd').map(function (h) { return h.textContent }),
      folders: $$('#fl-docs .fold').length
    };
    $('#fl-q').value = '';
    $('#fl-q').dispatchEvent(new Event('input'));
    await new Promise(function (r) { setTimeout(r, 700) });
    return out;
  });
  eq('ค้นด้วยเลขใบกำกับภาษีแล้วเจอ', find45.rows, 1);
  eq('และเป็นใบที่ค้นจริง ๆ', String(find45.first || '').trim(), find45.no);
  eq('ผลค้นหาข้ามแฟ้ม ไม่ต้องเดาก่อนว่าใบชนิดไหน', find45.folders, 0);
  truthy('ผลค้นหายังแยกหัวข้อตามชนิดใบ ไม่เทรวมกัน',
    find45.heads.length === 1 && find45.heads[0].indexOf('ใบกำกับภาษี') > -1);

  console.log('\n   ใบที่แก้ไขและใบที่ยกเลิก ต้องแยกกองออกจากใบปกติ');
  /* สามอย่างนี้หน้าตาเหมือนกันหมด ต่างกันแค่ตัวหนังสือเล็ก ๆ ท้ายบรรทัด
     ปนกันเมื่อไร วันหนึ่งจะมีคนหยิบใบที่ยกเลิกแล้วไปส่งลูกค้าหรือส่งบัญชี */
  await page.evaluate(function () { go('list') });
  await page.waitForTimeout(500);
  await page.evaluate(function () { openDoc((ORDERS || [])[1], 'rec') });
  await page.waitForTimeout(400);
  await page.click('#dc-make');
  var before45 = await page.evaluate(function () { return MOCK_DOCS.length });
  await page.waitForFunction(function (n) { return MOCK_DOCS.length > n }, before45,
    { timeout: 20000 });
  await page.evaluate(function () { closeModal() });
  await page.waitForTimeout(300);
  /* ใบหนึ่งแก้ อีกใบยกเลิก — ยิงผ่านทางเดินปกติของแอป ไม่แก้ทะเบียนเอง
     เลือกใบด้วยเลขจริงที่หยิบมาจากทะเบียน ไม่ใช่ตำแหน่งที่ 0 กับ 1
     เพราะข้อสอบข้อก่อน ๆ ทิ้งใบไว้ในทะเบียนไม่เท่ากันทุกรอบ */
  var made = await page.evaluate(async function () {
    var use = MOCK_DOCS.filter(function (d) {
      return d.type === 'ใบเสร็จรับเงิน' && !d.voidWhy && !d.sentAt;
    });
    var live = use[use.length - 2], gone = use[use.length - 1];
    if (!live || !gone) return { skip: true, have: use.length };
    var r1 = await new Promise(function (r) {
      google.script.run.withSuccessHandler(r).withFailureHandler(function (e) { r('ERR ' + e) })
        .reviseDoc({ no: live.no, why: 'ลูกค้าขอแก้ที่อยู่บนใบ', by: 'test' });
    });
    var r2 = await new Promise(function (r) {
      google.script.run.withSuccessHandler(r).withFailureHandler(function (e) { r('ERR ' + e) })
        .voidDoc(gone.no, 'ออกผิดออเดอร์ ต้องออกใหม่', 'test');
    });
    return { revised: live.no, dead: gone.no,
             ok1: !!(r1 && r1.ok), ok2: !!(r2 && r2.ok), r1: String(r1), r2: String(r2) };
  });
  truthy('มีใบให้ทดสอบสองใบ', !made.skip);
  truthy('แก้ใบผ่าน', made.ok1);
  truthy('ยกเลิกใบผ่าน', made.ok2);
  await page.evaluate(function () { go('quote') });
  await page.waitForTimeout(300);
  await page.click('#btn-file');
  await page.waitForTimeout(900);

  var grp45 = await page.evaluate(async function () {
    var f = $('#fl-docs [data-fk="ใบเสร็จรับเงิน"]');
    return {
      /* จำนวนบนหน้าแฟ้มต้องไม่นับใบที่ยกเลิกแล้ว */
      n: f.querySelector('.fold-n').textContent,
      side: f.querySelector('em').textContent
    };
  });
  truthy('จำนวนบนแฟ้มไม่นับใบที่ยกเลิกแล้ว', grp45.n.indexOf('1 ใบ') > -1);
  truthy('แต่บอกไว้ว่าข้างในมีใบแก้ไขกี่ใบ ใบยกเลิกกี่ใบ',
    /แก้ไข 1/.test(grp45.side) && /ยกเลิก 1/.test(grp45.side));

  var in45 = await page.evaluate(async function (made) {
    $('#fl-docs [data-fk="ใบเสร็จรับเงิน"]').click();
    await new Promise(function (r) { setTimeout(r, 800) });
    var heads = $$('#fl-docs .subhd').map(function (h) { return h.className });
    /* ใบแต่ละใบต้องอยู่ใต้หัวข้อของกองตัวเอง ไม่ใช่แค่มีหัวข้อครบ */
    function groupOf(no){
      var cur = '', found = '';
      [].slice.call($('#fl-docs').children).forEach(function (el) {
        if(el.classList.contains('subhd')) cur = el.className;
        if(el.classList.contains('row') && el.textContent.indexOf(no) > -1) found = cur;
      });
      return found;
    }
    return {
      heads: heads,
      revisedIn: groupOf(made.revised),
      deadIn: groupOf(made.dead),
      revisedTxt: ($$('#fl-docs .row').filter(function (r) {
        return r.textContent.indexOf(made.revised) > -1;
      })[0] || {}).textContent || ''
    };
  }, made);
  truthy('มีหัวข้อกอง "เคยแก้ไข"', in45.heads.join('|').indexOf('grp-revised') > -1);
  truthy('มีหัวข้อกอง "ยกเลิกแล้ว"', in45.heads.join('|').indexOf('grp-dead') > -1);
  truthy('ใบที่แก้ไปอยู่ในกองเคยแก้ไข', in45.revisedIn.indexOf('grp-revised') > -1);
  truthy('ใบที่ยกเลิกไปอยู่ในกองยกเลิกแล้ว', in45.deadIn.indexOf('grp-dead') > -1);
  truthy('บรรทัดของใบที่แก้บอกว่าแก้ไปกี่ครั้ง',
    /แก้ไขแล้ว 1 ครั้ง/.test(in45.revisedTxt));
  truthy('และบอกเหตุผลที่แก้ ไม่ใช่แค่บอกว่าเคยแก้',
    in45.revisedTxt.indexOf('ลูกค้าขอแก้ที่อยู่บนใบ') > -1);
  truthy('ใบที่ยกเลิกแล้วไม่มีปุ่มยกเลิกซ้ำ', await page.evaluate(function () {
    var rows = $$('#fl-docs .row').filter(function (r) {
      return r.textContent.indexOf('ยกเลิกแล้ว') > -1;
    });
    return rows.length > 0 && rows.every(function (r) { return !r.querySelector('[data-vd]') });
  }));

  await page.evaluate(function () { $('#fl-docs .fold-back').click() });
  await page.waitForTimeout(500);

  console.log('\n   สลับไปดูสรุปรายเดือน');
  await page.click('#fl-tabs button[data-fl="month"]');
  await page.waitForTimeout(1000);
  var mn45 = await page.evaluate(function () {
    return {
      rows: $$('#fl-months .mrow').length,
      kpis: $$('#fl-months .kpi').map(function (k) { return k.querySelector('span').textContent }),
      hasAds: !!$('#fl-months .m-ads'),
      docHidden: $('#fl-doc-card').style.display === 'none'
    };
  });
  truthy('ซ่อนการ์ดเอกสาร โชว์การ์ดเดือนแทน', mn45.docHidden);
  eq('ขึ้นย้อนหลัง 12 เดือน แม้เดือนที่ยังไม่มีข้อมูล', mn45.rows, 12);
  truthy('มีช่องกรอกค่าแอด', mn45.hasAds);
  truthy('สรุปหัวตารางมีทั้งยอดขาย ต้นทุน ค่าแอด และกำไรสุทธิ',
    mn45.kpis.join('|').indexOf('ค่าแอดรวม') > -1 &&
    mn45.kpis.join('|').indexOf('กำไรสุทธิรวม') > -1);

  console.log('\n   ยอดของเดือนต้องแยกตามช่องทางขาย');
  /* ไฟล์รายเดือนที่ร้านมีเป็นยอดของ Shopee ล้วน ถ้าการ์ดเดือนโชว์ยอดเดียวโดยไม่บอกช่องทาง
     คนอ่านจะเข้าใจว่าเป็นยอดทั้งร้านทันที — ผิดตั้งแต่ตัวเลขแรก */
  var ch45 = await page.evaluate(function () {
    function money(t, label) {
      var m = new RegExp(label + '\\s*฿([\\d,]+\\.\\d\\d)').exec(t.replace(/\n/g, ' '));
      return m ? Number(m[1].replace(/,/g, '')) : null;
    }
    var rows = $$('#fl-months .mrow');
    var el = null;
    for (var i = 0; i < rows.length; i++)
      if (rows[i].innerText.indexOf('ใบในระบบ') > -1) { el = rows[i]; break }
    if (!el) return { skip: true };
    var cards = [].slice.call(el.querySelectorAll('.mchan'));
    var head = el.querySelector('.mgrid').innerText;
    return {
      chans: cards.map(function (c) { return c.querySelector('.mchd b').textContent }),
      chanSales: cards.map(function (c) { return money(c.innerText, 'ยอดขาย') }),
      monthSales: money(head, 'ยอดขาย'),
      headSaysChan: el.querySelector('.mhd span').textContent.indexOf('ช่องทาง') > -1,
      fields: cards.length
        ? [].slice.call(cards[0].querySelectorAll('.mfld span')).map(function (s) { return s.textContent })
        : [],
      canAdd: !!el.querySelector('.m-add')
    };
  });
  truthy('มีเดือนที่มีออเดอร์ให้ทดสอบ', !ch45.skip);
  truthy('เดือนที่มีออเดอร์แตกเป็นการ์ดช่องทาง', ch45.chans.length >= 1);
  truthy('การ์ดช่องทางบอกชื่อช่องทางจริง', ch45.chans.indexOf('เพจ Facebook') > -1);
  truthy('หัวเดือนบอกว่ามีกี่ช่องทาง', ch45.headSaysChan);
  eq('ยอดของเดือนเท่ากับผลรวมของทุกช่องทาง', ch45.monthSales,
    ch45.chanSales.reduce(function (a, b) { return a + (b || 0) }, 0));
  truthy('กรอกได้ทั้งยอดขาย ต้นทุน และค่าแอด ไม่ใช่แค่ค่าแอด',
    ch45.fields.join('|') === 'ยอดขาย|ต้นทุน|ค่าแอด');
  truthy('เพิ่มช่องทางที่ยังไม่มีในเดือนนั้นได้', ch45.canAdd);

  console.log('\n   กรอกค่าแอดแล้วกำไรสุทธิต้องลดลงตามทันที');
  /* ค่าแอดคือเหตุผลเดียวที่ต้องมีหน้านี้ — กำไรที่ไม่หักค่าแอดไม่ใช่กำไรจริง */
  var ads45 = await page.evaluate(async function () {
    function money(t, label) {
      var m = new RegExp(label + '\\s*฿([\\d,]+\\.\\d\\d)').exec(t.replace(/\n/g, ' '));
      return m ? Number(m[1].replace(/,/g, '')) : null;
    }
    /* เลือกเดือนที่มีออเดอร์อยู่จริง จะได้เห็นว่ายอดขายมาจากระบบ ไม่ใช่ที่กรอก */
    var rows = $$('#fl-months .mrow');
    var idx = -1;
    for (var i = 0; i < rows.length; i++)
      if (rows[i].innerText.indexOf('ใบในระบบ') > -1) { idx = i; break; }
    if (idx < 0) return { skip: true };
    var card = rows[idx].querySelector('.mchan');
    var before = card.innerText, monthBefore = rows[idx].querySelector('.mgrid').innerText;
    card.querySelector('.m-ads').value = '250';
    card.querySelector('.m-save').click();
    await new Promise(function (r) { setTimeout(r, 900) });
    var row2 = $$('#fl-months .mrow')[idx];
    var after = row2.querySelector('.mchan').innerText;
    return {
      salesBefore: money(before, 'ยอดขาย'), salesAfter: money(after, 'ยอดขาย'),
      netBefore: money(before, 'กำไรสุทธิ'), netAfter: money(after, 'กำไรสุทธิ'),
      adsAfter: money(after, 'ค่าแอด'),
      monthNetBefore: money(monthBefore, 'กำไรสุทธิ'),
      monthNetAfter: money(row2.querySelector('.mgrid').innerText, 'กำไรสุทธิ'),
      typed: after.indexOf('กรอกเอง') > -1
    };
  });
  truthy('มีเดือนที่มีออเดอร์ให้ทดสอบ', !ads45.skip);
  eq('ค่าแอดถูกบันทึกที่ช่องทางนั้น', ads45.adsAfter, 250);
  eq('กำไรสุทธิของช่องทางลดลงเท่ากับค่าแอดที่กรอก', ads45.netBefore - ads45.netAfter, 250);
  eq('กำไรสุทธิของเดือนลดลงตามด้วย', ads45.monthNetBefore - ads45.monthNetAfter, 250);
  eq('ยอดขายยังเป็นตัวเลขจากระบบ ไม่ถูกแตะ', ads45.salesAfter, ads45.salesBefore);
  truthy('ยอดขายไม่ถูกติดป้ายว่ากรอกเอง เพราะไม่ได้กรอก', !ads45.typed);

  console.log('\n   เดือนเก่าที่ไม่มีออเดอร์ — เปิดช่องทาง Shopee แล้วกรอกยอดจากไฟล์');
  /* เดือน ม.ค.–มี.ค. ไม่มีออเดอร์ในระบบเลย ยอดมาจากไฟล์ของ Shopee อย่างเดียว
     ถ้ากรอกไม่ได้เพราะยังไม่มีช่องทาง หน้านี้ก็ไม่มีประโยชน์กับเดือนที่ต้องใช้จริง */
  var old45 = await page.evaluate(async function () {
    function money(t, label) {
      var m = new RegExp(label + '\\s*฿([\\d,]+\\.\\d\\d)').exec(t.replace(/\n/g, ' '));
      return m ? Number(m[1].replace(/,/g, '')) : null;
    }
    var rows = $$('#fl-months .mrow');
    var idx = -1;
    for (var i = 0; i < rows.length; i++)
      if (rows[i].innerText.indexOf('ยังไม่มีช่องทาง') > -1) { idx = i; break }
    if (idx < 0) return { skip: true };
    var ym = rows[idx].querySelector('.mhd b').textContent;
    var sel = rows[idx].querySelector('.m-newchan');
    sel.value = 'Shopee';
    rows[idx].querySelector('.m-add').click();
    await new Promise(function (r) { setTimeout(r, 200) });
    var card = $$('#fl-months .mrow')[idx].querySelector('.mchan');
    if (!card) return { added: false };
    card.querySelector('.m-sales').value = '12000';
    card.querySelector('.m-cost').value = '7000';
    card.querySelector('.m-ads').value = '1500';
    card.querySelector('.m-save').click();
    await new Promise(function (r) { setTimeout(r, 900) });
    var row2 = $$('#fl-months .mrow')[idx];
    var c2 = row2.querySelector('.mchan');
    /* เดือนที่มีออเดอร์อยู่แล้วต้องไม่ถูกยอดจากไฟล์ไปปน */
    var other = null;
    $$('#fl-months .mrow').forEach(function (r) {
      if (r.innerText.indexOf('ใบในระบบ') > -1 && other === null)
        other = money(r.querySelector('.mgrid').innerText, 'ยอดขาย');
    });
    return {
      added: true, ym: ym, sameMonth: row2.querySelector('.mhd b').textContent === ym,
      chan: c2 ? c2.querySelector('.mchd b').textContent : '',
      sales: c2 ? money(c2.innerText, 'ยอดขาย') : null,
      net: c2 ? money(c2.innerText, 'กำไรสุทธิ') : null,
      monthSales: money(row2.querySelector('.mgrid').innerText, 'ยอดขาย'),
      typed: c2 ? (c2.innerText.match(/กรอกเอง/g) || []).length : 0,
      otherMonthSales: other
    };
  });
  truthy('มีเดือนเปล่าให้ทดสอบ', !old45.skip);
  truthy('กดเพิ่มช่องทางแล้วได้การ์ดใหม่', old45.added);
  eq('การ์ดใหม่เป็นช่องทางที่เลือก', old45.chan, 'Shopee');
  truthy('ยังเป็นเดือนเดิม ไม่เด้งไปเดือนอื่น', old45.sameMonth);
  eq('ยอดขายที่กรอกจากไฟล์ถูกเก็บ', old45.sales, 12000);
  eq('กำไรสุทธิ = ขาย − ทุน − ค่าแอด', old45.net, 12000 - 7000 - 1500);
  eq('ยอดของเดือนเท่ากับช่องทางเดียวที่มี', old45.monthSales, 12000);
  eq('ทั้งยอดขายและต้นทุนติดป้ายว่ากรอกเอง', old45.typed, 2);
  eq('ยอดของเดือนที่มีออเดอร์จริงไม่ถูกยอดจากไฟล์ไปปน',
    old45.otherMonthSales, ads45.salesBefore);

  console.log('\n   วางตารางจาก Excel แล้วคิดยอด Shopee ให้');
  /* ไฟล์จริงของร้านเดือน มิ.ย. ไม่มีคอลัมน์ราคา เดือน ส.ค. ไม่มีคอลัมน์จำนวน
     ทั้งสองแผ่นคิดยอดไม่ได้จริง ๆ และต้องบอกให้ตรงว่าขาดอะไร ไม่ใช่คิดเลขมั่วให้ */
  var TSV_HEAD = ['หมายเลขคำสั่งซื้อ', 'ชื่อสินค้า', 'ชื่อผู้ใช้ (ผู้ซื้อ)',
    'วันที่ทำการสั่งซื้อ', 'ชื่อตัวเลือก', 'ราคาขาย', 'สถานะการสั่งซื้อ', 'จำนวน'];
  function tsv46(rows) {
    return rows.map(function (r) { return r.join('\t') }).join('\n');
  }
  var NOQTY46 = tsv46([TSV_HEAD.slice(0, 7),
    ['260601AA1', 'IPA 1000ml', 'somchai', '2026-06-03 10:00', '1000ml', '120.00', 'สำเร็จแล้ว']]);
  var OK46 = tsv46([TSV_HEAD,
    ['260601AA1', 'IPA 1000ml', 'somchai', '2026-06-03 10:00', '1000ml', '120.00', 'สำเร็จแล้ว', '2'],
    ['260601AA1', 'อะซิโตน 1L', 'somchai', '2026-06-03 10:00', '1000ml', '149.00', 'สำเร็จแล้ว', '1'],
    ['260620BB2', 'IPA 1000ml', 'malee', '2026-06-20 09:00', '1000ml', '120.00', 'สำเร็จแล้ว', '3'],
    ['260620BB3', 'IPA 1000ml', 'nok', '2026-06-20 11:00', '1000ml', '120.00', 'ยกเลิกแล้ว', '5'],
    ['260705CC4', 'ดอกกัด 3.175', 'wit', '2026-07-05 08:00', '3.175*22', '169.00',
     'ผู้ซื้อได้รับสินค้าแล้ว โปรดทราบว่าผู้ซื้อสามารถยื่นคำขอคืนเงิน/คืนสินค้าได้จนถึง 2026-09-10', '1'],
    ['', '', '', '', '', '99999', '', '']]);

  await page.click('#fl-paste-open');
  await page.waitForTimeout(250);
  var op46 = await page.evaluate(function () {
    return {
      open: $('#fl-paste').style.display !== 'none',
      hasBox: !!$('#fl-text'), hasBtn: !!$('#fl-read')
    };
  });
  truthy('กดปุ่มแล้วกล่องวางตารางเปิดออกมา', op46.open && op46.hasBox && op46.hasBtn);

  var miss46 = await page.evaluate(async function (t) {
    $('#fl-text').value = t;
    $('#fl-read').click();
    await new Promise(function (r) { setTimeout(r, 500) });
    var box = $('#fl-paste-out');
    return {
      txt: box.innerText,
      err: !!box.querySelector('.msg.err'),
      months: $$('#fl-paste-out .mchan').length
    };
  }, NOQTY46);
  truthy('ตารางที่ขาดคอลัมน์จำนวน ต้องขึ้นว่าอ่านไม่ได้', miss46.err);
  truthy('และบอกชื่อคอลัมน์ที่ขาด', miss46.txt.indexOf('จำนวน') > -1);
  eq('ไม่คิดยอดให้สักเดือนทั้งที่ข้อมูลไม่ครบ', miss46.months, 0);

  var ok46 = await page.evaluate(async function (t) {
    $('#fl-text').value = t;
    $('#fl-read').click();
    await new Promise(function (r) { setTimeout(r, 500) });
    function money(s) {
      var m = /฿([\d,]+\.\d\d)/.exec(s.replace(/\n/g, ' '));
      return m ? Number(m[1].replace(/,/g, '')) : null;
    }
    var cards = [].slice.call($$('#fl-paste-out .mchan'));
    return {
      txt: $('#fl-paste-out').innerText,
      months: cards.map(function (c) { return c.querySelector('.mchd b').textContent }),
      sales: cards.map(function (c) { return money(c.querySelector('.mgrid').innerText) }),
      hasAll: !!$('#fl-all')
    };
  }, OK46);
  eq('แยกได้สองเดือน', ok46.months.length, 2);
  eq('ยอดเดือน มิ.ย. = ราคาคูณจำนวน ไม่นับใบที่ยกเลิก',
    ok46.sales[0], 120 * 2 + 149 + 120 * 3);
  eq('ใบที่ส่งถึงลูกค้าแล้วยังนับเป็นยอดขาย แม้สถานะจะมีคำว่าคืนเงิน', ok46.sales[1], 169);
  truthy('บอกยอดที่ตัดออกเพราะยกเลิก', ok46.txt.indexOf('600') > -1);
  truthy('บอกว่ามีแถวที่ไม่มีวันที่ (แถวรวมยอดท้ายแผ่น)',
    ok46.txt.indexOf('ไม่มีวันที่') > -1);
  truthy('บอกว่ายอดจะลงช่องทาง Shopee', ok46.txt.indexOf('Shopee') > -1);
  truthy('มีปุ่มกรอกทั้งหมด', ok46.hasAll);

  console.log('\n   กดกรอกทั้งหมด แล้วยอดต้องไปอยู่ที่ช่องทาง Shopee ของเดือนนั้น');
  var saved46 = await page.evaluate(async function () {
    $('#fl-all').click();
    await new Promise(function (r) { setTimeout(r, 1800) });
    function money(t, label) {
      var m = new RegExp(label + '\\s*฿([\\d,]+\\.\\d\\d)').exec(t.replace(/\n/g, ' '));
      return m ? Number(m[1].replace(/,/g, '')) : null;
    }
    var row = null;
    $$('#fl-months .mrow').forEach(function (r) {
      if (r.querySelector('.mhd b').textContent.indexOf('มิ.ย.') > -1) row = r;
    });
    if (!row) return { found: false };
    var cards = [].slice.call(row.querySelectorAll('.mchan'));
    var shop = cards.filter(function (c) {
      return c.querySelector('.mchd b').textContent === 'Shopee';
    })[0];
    return {
      found: true,
      chans: cards.map(function (c) { return c.querySelector('.mchd b').textContent }),
      shopSales: shop ? money(shop.innerText, 'ยอดขาย') : null,
      typed: shop ? shop.innerText.indexOf('กรอกเอง') > -1 : false,
      monthSales: money(row.querySelector('.mgrid').innerText, 'ยอดขาย')
    };
  });
  truthy('เจอเดือน มิ.ย. ในตารางสรุป', saved46.found);
  truthy('เดือนนั้นมีช่องทาง Shopee แล้ว', saved46.chans.indexOf('Shopee') > -1);
  eq('ยอดที่กรอกตรงกับที่คิดได้', saved46.shopSales, 120 * 2 + 149 + 120 * 3);
  truthy('ติดป้ายว่ากรอกเอง เพราะมาจากไฟล์ ไม่ใช่จากออเดอร์ในระบบ', saved46.typed);
  eq('ยอดของเดือนเท่ากับผลรวมของช่องทาง', saved46.monthSales, saved46.shopSales);

  await page.evaluate(function () { $('#fl-paste-close').click() });
  await page.waitForTimeout(200);

  console.log('\n   กลับไปหน้าใบเสนอราคาได้');
  await page.click('#fl-back');
  await page.waitForTimeout(500);
  truthy('กดกลับแล้วได้หน้าใบเสนอราคา',
    await page.evaluate(function () { return $('#pg-quote').style.display !== 'none' }));

  /* ---------- 21. ไม่มี error หลุดใน console ---------- */
  console.log('\n21. ความสะอาดของหน้าเว็บ');
  eq('ไม่มี javascript error เลย', errors, []);

  await browser.close();
  console.log('\n' + (fails ? 'ตก ' + fails + ' ข้อ' : 'ผ่านทั้งหมด'));
  process.exit(fails ? 1 : 0);
})().catch(function (e) {
  console.error('\nพังกลางทาง: ' + e.message);
  process.exit(1);
});
