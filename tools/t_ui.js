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

var FILE = 'file://' + path.join(__dirname, '..', 'out', 'preview.html');
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
  page.on('console', function (m) { if (m.type() === 'error') errors.push('console: ' + m.text()); });

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
  truthy('มีหัวข้อสรุปคำสั่งซื้อ', ord.indexOf('🧾 สรุปคำสั่งซื้อ') === 0);
  truthy('มียอดชำระทั้งหมด', /✅ ยอดชำระทั้งหมด : ฿800.00/.test(ord));
  var shp = await page.inputValue('#mg-shp');
  truthy('ข้อความแจ้งพัสดุขึ้นต้นเหมือนเดิม', shp.indexOf('📦 จัดส่งสินค้าเรียบร้อยแล้ว') === 0);
  truthy('มีเลขพัสดุ', /🔎 เลขพัสดุ: TH0000000001/.test(shp));
  truthy('มีลิงก์ติดตามของ Flash', /flashexpress\.com/.test(shp));
  truthy('ปิดท้ายเหมือนเดิม', /ขอบคุณที่อุดหนุนสินค้าของเราค่ะ 🙏$/.test(shp));
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
  var sum = await page.textContent('#summary');
  truthy('มีภาพรวม', /ภาพรวม/.test(sum));
  truthy('มียอดชำระสุทธิ', /฿800.00/.test(sum));
  truthy('แยกตามช่องทางขาย', /เพจ Facebook/.test(sum));
  truthy('บอกว่าดูกำไรได้ที่ชีท', /สรุปยอดขาย/.test(sum));
  await page.screenshot({ path: 'out/ui-summary.png' });

  await page.click('.tabs button[data-go="new"]');
  await page.waitForTimeout(200);
  await page.screenshot({ path: 'out/ui-form.png' });

  /* ---------- 14. ไม่มี error หลุดใน console ---------- */
  console.log('\n14. ความสะอาดของหน้าเว็บ');
  eq('ไม่มี javascript error เลย', errors, []);

  await browser.close();
  console.log('\n' + (fails ? 'ตก ' + fails + ' ข้อ' : 'ผ่านทั้งหมด'));
  process.exit(fails ? 1 : 0);
})().catch(function (e) {
  console.error('\nพังกลางทาง: ' + e.message);
  process.exit(1);
});
