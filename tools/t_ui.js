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
  truthy('นับจำนวนออเดอร์', /1 ใบ/.test(sum));
  truthy('มียอดชำระสุทธิ', /฿800.00/.test(sum));
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

  /* ---------- 18. ไม่มี error หลุดใน console ---------- */
  console.log('\n18. ความสะอาดของหน้าเว็บ');
  eq('ไม่มี javascript error เลย', errors, []);

  await browser.close();
  console.log('\n' + (fails ? 'ตก ' + fails + ' ข้อ' : 'ผ่านทั้งหมด'));
  process.exit(fails ? 1 : 0);
})().catch(function (e) {
  console.error('\nพังกลางทาง: ' + e.message);
  process.exit(1);
});
