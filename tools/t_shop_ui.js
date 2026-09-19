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

  console.log('\n5. ปุ่มสอบถามทางไลน์');
  await pg.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await pg.locator('.card:not(.is-out) .ask').first().click();
  await pg.waitForTimeout(300);
  var t = await pg.locator('#toast').innerText();
  ok('ขึ้นข้อความว่าคัดลอกให้แล้ว', /คัดลอก/.test(t), t);

  console.log('\n6. ราคาต้องมีสตางค์สองหลักเสมอ');
  var price = await pg.locator('.card .price').first().innerText();
  ok('ราคาแสดงเป็นเงินบาทเต็มรูป', /^฿[\d,]+\.\d{2}$/.test(price), price);

  console.log('\n7. ร้านปิดรับออเดอร์');
  /* reload จะโหลดข้อมูลปลอมชุดเดิมกลับมา ต้องแก้ค่าแล้วสั่งโหลดใหม่ในหน้าเดิม */
  await pg.evaluate(() => { SHOP_DATA.open = false; load(); });
  await pg.waitForTimeout(700);
  ok('ขึ้นแถบบอกว่าปิดรับออเดอร์', await pg.locator('#closed').isVisible());
  ok('แต่ยังดูสินค้าได้', (await pg.locator('.card').count()) === 6);
  await pg.screenshot({ path: OUT + '/S2-closed.png' });

  ok('ไม่มี error สะสมตลอดการทดสอบ', errs.length === 0, errs.join(' | '));
  await b.close();
  console.log(fails ? '\nตก ' + fails + ' ข้อ' : '\nผ่านทั้งหมด');
  process.exit(fails ? 1 : 0);
})();
