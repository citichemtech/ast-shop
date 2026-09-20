/*
 * หน้าร้านที่ลูกค้าเปิด — สอบในเบราว์เซอร์จริง
 *
 *   python3 tools/make_shop_preview.py && node tools/t_shop_ui.js
 */
'use strict';
var { chromium } = require('/opt/node22/lib/node_modules/playwright');
var OUT = '/tmp/claude-0/-home-user-ast-shop/0f0ff42b-d95c-5e5d-befd-c9cffcf7c2ff/scratchpad';
var fails = 0;
function ok(label, cond, extra) {
  if (!cond) fails++;
  console.log((cond ? '  ok   ' : '  FAIL ') + label + (cond ? '' : '  ' + (extra || '')));
}

(async () => {
  var b = await chromium.launch();
  var pg = await b.newPage({ viewport: { width: 430, height: 950 }, deviceScaleFactor: 2 });
  var errs = [];
  pg.on('pageerror', e => errs.push(String(e)));
  pg.on('console', m => {
    if (m.type() === 'error' && !/ERR_CERT_AUTHORITY_INVALID|fonts.googleapis/.test(m.text()))
      errs.push('console: ' + m.text());
  });
  await pg.goto('file:///home/user/ast-shop/out/shop.html');
  await pg.waitForTimeout(900);

  console.log('\n1. โหลดหน้าและวาดสินค้า');
  ok('เปิดหน้าไม่มี error', errs.length === 0, errs.join(' | '));
  ok('ขึ้นชื่อร้านจากชีท', (await pg.locator('#shop-name').innerText()) === 'AST CHEM-TOOLING SHOP');
  var n = await pg.locator('.card').count();
  ok('วาดการ์ดสินค้าครบ 6 ตัว', n === 6, 'ได้ ' + n);
  ok('มีหมวดสินค้าให้เลือก', (await pg.locator('.cats button').count()) === 4);
  await pg.screenshot({ path: OUT + '/S1-shop.png' });

  console.log('\n2. ของหมดต้องกดสั่งไม่ได้');
  ok('มีป้ายสินค้าหมด', (await pg.locator('.out-tag').count()) === 1);
  ok('ปุ่มของตัวที่หมดถูกปิด', await pg.locator('.card.is-out .ask').isDisabled());

  console.log('\n3. กรองตามหมวด');
  await pg.locator('.cats button', { hasText: 'เคมีภัณฑ์' }).click();
  await pg.waitForTimeout(200);
  ok('เหลือแต่เคมีภัณฑ์ 2 ตัว', (await pg.locator('.card').count()) === 2);
  await pg.locator('.cats button', { hasText: 'ทั้งหมด' }).click();
  await pg.waitForTimeout(200);
  ok('กดทั้งหมดแล้วกลับมาครบ', (await pg.locator('.card').count()) === 6);

  console.log('\n4. ค้นหา');
  await pg.locator('#q').fill('Acetone');
  await pg.waitForTimeout(250);
  ok('ค้นด้วยชื่อสินค้าเจอ', (await pg.locator('.card').count()) === 1);
  await pg.locator('#q').fill('SKU-181');
  await pg.waitForTimeout(250);
  ok('ค้นด้วยรหัส SKU ก็เจอ', (await pg.locator('.card').count()) === 1);
  await pg.locator('#q').fill('ไม่มีของนี้แน่นอน');
  await pg.waitForTimeout(250);
  ok('ไม่เจอแล้วขึ้นข้อความบอก', (await pg.locator('.state').count()) === 1);
  await pg.locator('#q').fill('');
  await pg.waitForTimeout(250);

  console.log('\n5. ใส่ตะกร้า');
  await pg.locator('.card:not(.is-out) .ask').first().click();
  await pg.waitForTimeout(250);
  ok('แถบล่างโผล่ขึ้นมา', await pg.locator('#bar').isVisible());
  ok('ปุ่มเปลี่ยนเป็นบอกจำนวนในตะกร้า',
     /ในตะกร้า 1 ชิ้น/.test(await pg.locator('.card:not(.is-out) .ask').first().innerText()));
  /* 89 + ค่าส่ง 50 = 139 */
  ok('ยอดบนแถบรวมค่าส่งแล้ว', (await pg.locator('#bar-total').innerText()) === '฿139.00',
     await pg.locator('#bar-total').innerText());
  await pg.screenshot({ path: OUT + '/S3-bar.png' });

  console.log('\n6. หน้าตะกร้า');
  await pg.locator('#btn-cart').click();
  await pg.waitForTimeout(250);
  ok('เข้าหน้าตะกร้าได้', await pg.locator('#pg-cart').isVisible());
  ok('มีสินค้าหนึ่งบรรทัด', (await pg.locator('#cart-body .line').count()) === 1);
  await pg.locator('[data-inc]').first().click();
  await pg.waitForTimeout(200);
  ok('กดบวกแล้วเป็น 2', (await pg.locator('.qty b').first().innerText()) === '2');
  ok('ยอดรวมขยับตาม', (await pg.locator('.srow.total b').innerText()) === '฿228.00',
     await pg.locator('.srow.total b').innerText());
  await pg.screenshot({ path: OUT + '/S4-cart.png' });
  await pg.locator('[data-dec]').first().click();
  await pg.waitForTimeout(200);
  await pg.locator('[data-dec]').first().click();
  await pg.waitForTimeout(250);
  ok('ลบออกหมดแล้วขึ้นว่าตะกร้าว่าง',
     /ตะกร้ายังว่างอยู่/.test(await pg.locator('#cart-body').innerText()));

  console.log('\n6.5 ส่งฟรีเมื่อยอดถึง');
  await pg.locator('#cart-body button').click();     // ไปเลือกสินค้า
  await pg.waitForTimeout(200);
  for (var i = 0; i < 12; i++) await pg.locator('.card:not(.is-out) .ask').first().click();
  await pg.waitForTimeout(250);
  await pg.locator('#btn-cart').click();
  await pg.waitForTimeout(250);
  /* 89 x 12 = 1,068 เกิน 1,000 จึงส่งฟรี */
  ok('ยอดถึงแล้วค่าส่งเป็นฟรี',
     /ฟรี/.test(await pg.locator('#cart-body .srow').nth(1).innerText()));
  ok('ยอดรวมไม่บวกค่าส่ง', (await pg.locator('.srow.total b').innerText()) === '฿1,068.00',
     await pg.locator('.srow.total b').innerText());

  console.log('\n6.6 กรอกที่อยู่แล้วสั่งซื้อ');
  await pg.locator('[data-go="pay"]').click();
  await pg.waitForTimeout(250);
  ok('เข้าหน้ากรอกที่อยู่', await pg.locator('#pg-pay').isVisible());
  await pg.locator('#btn-send').click();
  await pg.waitForTimeout(250);
  ok('กรอกไม่ครบแล้วช่องขึ้นแดง', (await pg.locator('.fld.bad').count()) === 3);
  await pg.locator('#i-name').fill('มานี ใจดี');
  await pg.locator('#i-tel').fill('081-234-5678');
  await pg.locator('#i-addr').fill('99/9 ถ.ตัวอย่าง ต.เนินพระ อ.เมือง จ.ระยอง 21000');
  await pg.locator('#i-note').fill('ขอใบกำกับภาษี');
  await pg.screenshot({ path: OUT + '/S5-pay.png' });
  await pg.locator('#btn-send').click();
  await pg.waitForTimeout(700);
  ok('ขึ้นหน้าสั่งซื้อสำเร็จ', await pg.locator('#pg-done').isVisible());
  ok('โชว์เลขออเดอร์', /AST-26-0042/.test(await pg.locator('#done-body').innerText()));
  ok('โชว์ยอดที่ต้องโอน', /฿1,068.00/.test(await pg.locator('#done-body').innerText()));
  var sent = await pg.evaluate(() => window.SHOP_SENT);
  ok('ส่งเบอร์ไปแบบตัดขีดออกแล้ว', sent.tel === '0812345678', sent.tel);
  ok('ส่งเฉพาะรหัสกับจำนวน ไม่ส่งราคาไปด้วย',
     Object.keys(sent.items[0]).sort().join(',') === 'qty,sku',
     JSON.stringify(sent.items[0]));
  ok('ส่งข้อความถึงร้านไปด้วย', sent.note === 'ขอใบกำกับภาษี');
  await pg.screenshot({ path: OUT + '/S6-done.png' });

  console.log('\n6.7 สั่งเสร็จแล้วตะกร้าต้องว่าง');
  await pg.locator('#done-body [data-go="shop"]').click();
  await pg.waitForTimeout(250);
  ok('แถบล่างหายไป', !(await pg.locator('#bar').isVisible()));
  var stored = await pg.evaluate(() => localStorage.getItem('ast-shop-cart'));
  ok('ตะกร้าในเครื่องถูกล้างด้วย', stored === '{}' || stored === null, stored);

  console.log('\n6.8 ส่งไม่สำเร็จต้องบอกเหตุผล');
  await pg.locator('.card:not(.is-out) .ask').first().click();
  await pg.locator('#btn-cart').click();
  await pg.waitForTimeout(200);
  await pg.locator('[data-go="pay"]').click();
  await pg.waitForTimeout(200);
  await pg.locator('#i-name').fill('มานี ใจดี');
  await pg.locator('#i-tel').fill('0812345678');
  await pg.locator('#i-addr').fill('99/9 ถ.ตัวอย่าง ต.เนินพระ อ.เมือง จ.ระยอง 21000');
  await pg.evaluate(() => { window.SHOP_FAIL = 'สินค้าบางรายการไม่มีขายแล้ว' });
  await pg.locator('#btn-send').click();
  await pg.waitForTimeout(600);
  ok('ขึ้นกล่องแดงบอกเหตุผล', await pg.locator('#send-err').isVisible());
  ok('และยังอยู่หน้าเดิม ของในตะกร้าไม่หาย', await pg.locator('#pg-pay').isVisible());
  ok('ปุ่มกลับมากดได้อีก', !(await pg.locator('#btn-send').isDisabled()));
  await pg.evaluate(() => { window.SHOP_FAIL = null });

  console.log('\n7. ร้านปิดรับออเดอร์');
  /* reload จะโหลดข้อมูลปลอมชุดเดิมกลับมา ต้องแก้ค่าแล้วสั่งโหลดใหม่ในหน้าเดิม */
  await pg.evaluate(() => { SHOP_DATA.open = false; CART = {}; cartSave(); go('shop'); load(); });
  await pg.waitForTimeout(700);
  ok('ขึ้นแถบบอกว่าปิดรับออเดอร์', await pg.locator('#closed').isVisible());
  ok('แต่ยังดูสินค้าได้', (await pg.locator('.card').count()) === 6);
  ok('ปุ่มเปลี่ยนเป็นสอบถามทางไลน์',
     /สอบถามทางไลน์/.test(await pg.locator('.card:not(.is-out) .ask').first().innerText()));
  ok('และไม่มีแถบตะกร้าให้กด', !(await pg.locator('#bar').isVisible()));
  await pg.screenshot({ path: OUT + '/S2-closed.png' });

  ok('ไม่มี error สะสมตลอดการทดสอบ', errs.length === 0, errs.join(' | '));
  await b.close();
  console.log(fails ? '\nตก ' + fails + ' ข้อ' : '\nผ่านทั้งหมด');
  process.exit(fails ? 1 : 0);
})();
