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
  var n = await pg.locator('#pg-shop .grid .card').count();
  ok('วาดการ์ดสินค้าครบ 6 ตัว', n === 6, 'ได้ ' + n);
  ok('มีการ์ดหมวดให้กด', (await pg.locator('.catrow button').count()) === 3);
  await pg.locator('#btn-filt').click();
  await pg.waitForTimeout(250);
  ok('กดปุ่มกรองแล้วมีชิปหมวดให้เลือก', (await pg.locator('.cats button').count()) === 4);
  await pg.screenshot({ path: OUT + '/S1-shop.png' });

  console.log('\n2. ของหมดต้องกดสั่งไม่ได้');
  ok('มีป้ายสินค้าหมด', (await pg.locator('.out-tag').count()) === 1);
  ok('ปุ่มของตัวที่หมดถูกปิด',
     await pg.locator('#pg-shop .grid .card.is-out .plus').first().isDisabled());

  console.log('\n3. กรองตามหมวด');
  await pg.locator('.cats button', { hasText: 'เคมีภัณฑ์' }).click();
  await pg.waitForTimeout(200);
  ok('เหลือแต่เคมีภัณฑ์ 2 ตัว', (await pg.locator('#pg-shop .grid .card').count()) === 2);
  await pg.locator('.cats button', { hasText: 'ทั้งหมด' }).click();
  await pg.waitForTimeout(200);
  ok('กดทั้งหมดแล้วกลับมาครบ', (await pg.locator('#pg-shop .grid .card').count()) === 6);

  console.log('\n4. ค้นหา');
  await pg.locator('#q').fill('Acetone');
  await pg.waitForTimeout(250);
  ok('ค้นด้วยชื่อสินค้าเจอ', (await pg.locator('#pg-shop .grid .card').count()) === 1);
  await pg.locator('#q').fill('SKU-181');
  await pg.waitForTimeout(250);
  ok('ค้นด้วยรหัส SKU ก็เจอ', (await pg.locator('#pg-shop .grid .card').count()) === 1);
  await pg.locator('#q').fill('ไม่มีของนี้แน่นอน');
  await pg.waitForTimeout(250);
  ok('ไม่เจอแล้วขึ้นข้อความบอก', (await pg.locator('.state').count()) === 1);
  await pg.locator('#q').fill('');
  await pg.waitForTimeout(250);

  console.log('\n5. ใส่ตะกร้า');
  await pg.locator('#pg-shop .grid .card:not(.is-out) .plus').first().click();
  await pg.waitForTimeout(250);
  ok('แถบล่างโผล่ขึ้นมา', await pg.locator('#bar').isVisible());
  ok('ปุ่มเปลี่ยนเป็นบอกจำนวนในตะกร้า',
     (await pg.locator('#pg-shop .grid .card:not(.is-out) .plus').first().innerText()).trim() === '1');
  /* 89 + ค่าส่ง 50 = 139 */
  ok('ยอดบนแถบรวมค่าส่งแล้ว', (await pg.locator('#bar-total').innerText()) === '฿139.00',
     await pg.locator('#bar-total').innerText());
  await pg.screenshot({ path: OUT + '/S3-bar.png' });

  console.log('\n6. หน้าตะกร้า');
  await pg.locator('#nav-cart').click();
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
  for (var i = 0; i < 12; i++) await pg.locator('#pg-shop .grid .card:not(.is-out) .plus').first().click();
  await pg.waitForTimeout(250);
  await pg.locator('#nav-cart').click();
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
  await pg.locator('#pg-shop .grid .card:not(.is-out) .plus').first().click();
  await pg.locator('#nav-cart').click();
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
  ok('แต่ยังดูสินค้าได้', (await pg.locator('#pg-shop .grid .card').count()) === 6);
  ok('ปุ่มเปลี่ยนเป็นสอบถามทางไลน์',
     (await pg.locator('#pg-shop .grid .card:not(.is-out) .plus').first()
        .getAttribute('data-ask')) !== null);
  ok('และไม่มีแถบตะกร้าให้กด', !(await pg.locator('#bar').isVisible()));
  await pg.screenshot({ path: OUT + '/S2-closed.png' });

  console.log('\n8. กดที่รูปแล้วดูรูปเต็มจอ เลื่อนได้สองรูป');
  await pg.evaluate(() => { SHOP_DATA.open = true; CART = {}; cartSave(); go('shop'); load(); });
  await pg.waitForTimeout(700);
  ok('การ์ดที่มีสองรูปติดป้ายบอกจำนวน',
     (await pg.locator('#pg-shop .grid [data-pic="SKU-141"] .npic').innerText()).indexOf('2 รูป') > -1);
  ok('การ์ดที่มีรูปเดียวไม่ติดป้าย',
     (await pg.locator('#pg-shop .grid [data-pic="SKU-148"] .npic').count()) === 0);
  ok('การ์ดที่ไม่มีรูปกดไม่ได้', (await pg.locator('#pg-shop .grid [data-pic="SKU-210"]').count()) === 0);

  ok('ยังไม่กด กล่องดูรูปต้องปิดอยู่', !(await pg.locator('#lb').isVisible()));
  await pg.locator('#pg-shop .grid [data-pic="SKU-141"]').click();
  await pg.waitForTimeout(350);
  ok('กดแล้วกล่องดูรูปเปิด', await pg.locator('#lb').isVisible());
  ok('ใส่รูปมาครบสองรูป', (await pg.locator('#lb-track img').count()) === 2);
  ok('มีจุดบอกตำแหน่งสองจุด', (await pg.locator('#lb-dots i').count()) === 2);
  ok('จุดแรกสว่างอยู่', (await pg.locator('#lb-dots i').first().getAttribute('class')) === 'on');
  ok('ขึ้นชื่อสินค้ากับราคา',
     /Single Flute/.test(await pg.locator('#lb-name').innerText()) &&
     /89/.test(await pg.locator('#lb-name').innerText()));
  await pg.screenshot({ path: OUT + '/S3-pics.png' });

  /* จอมือถือไม่มีลูกศร ใช้นิ้วปัดอย่างเดียว — จำลองด้วยการเลื่อนแถบรูป */
  ok('จอมือถือซ่อนลูกศรไว้ ใช้ปัดนิ้วแทน', !(await pg.locator('#lb-next').isVisible()));
  await pg.evaluate(() => {
    var tr = document.querySelector('#lb-track');
    tr.scrollLeft = tr.clientWidth;
    tr.dispatchEvent(new Event('scroll'));
  });
  await pg.waitForTimeout(300);
  ok('ปัดไปรูปที่สองแล้วจุดที่สองสว่างแทน',
     (await pg.locator('#lb-dots i').nth(1).getAttribute('class')) === 'on');
  ok('และจุดแรกดับลง',
     (await pg.locator('#lb-dots i').first().getAttribute('class')) === '');

  await pg.keyboard.press('Escape');
  await pg.waitForTimeout(300);
  ok('กด Escape แล้วปิด', !(await pg.locator('#lb').isVisible()));
  ok('ปิดแล้วเลื่อนหน้าร้านต่อได้',
     (await pg.evaluate(() => document.body.style.overflow)) === '');

  await pg.locator('#pg-shop .grid [data-pic="SKU-148"]').click();
  await pg.waitForTimeout(350);
  ok('สินค้ารูปเดียวก็เปิดดูได้', await pg.locator('#lb').isVisible());
  ok('แต่ไม่มีจุดให้เลื่อน', (await pg.locator('#lb-dots i').count()) === 0);
  ok('และไม่มีลูกศร', !(await pg.locator('#lb-next').isVisible()));
  await pg.locator('#lb-close').click();
  await pg.waitForTimeout(300);
  ok('กดกากบาทแล้วปิด', !(await pg.locator('#lb').isVisible()));

  ok('กดที่รูปไม่ทำให้ของลงตะกร้าเอง',
     (await pg.evaluate(() => Object.keys(CART).length)) === 0);

  console.log('\n9. หน้าแรกแบบใหม่ — แบนเนอร์ หมวดมีรูป แถบแนะนำ');
  await pg.evaluate(() => { SHOWFILT = false; curCat = ''; curQ = ''; go('shop'); draw(); });
  await pg.waitForTimeout(400);
  ok('มีแบนเนอร์ครบสามแถบ', (await pg.locator('.bans').count()) === 3);
  ok('แถบที่มีสองรูปมีจุดให้ดู', (await pg.locator('.bdots').count()) === 1);
  ok('แบนเนอร์ที่ใส่ข้อความปุ่มไว้มีปุ่ม', (await pg.locator('.bbtn').count()) === 2);
  ok('มีแถบสินค้าแนะนำ',
     (await pg.locator('.sec-hd h2', { hasText: 'สินค้าแนะนำ' }).count()) === 1);
  ok('มีแถบขายดี',
     (await pg.locator('.sec-hd h2', { hasText: 'ขายดีประจำร้าน' }).count()) === 1);
  ok('ป้ายบนการ์ดขึ้นตามที่ติดไว้ในชีท',
     (await pg.locator('#pg-shop .grid [data-pic="SKU-141"]')
        .locator('xpath=../..').locator('.tagrow span').count()) === 2);
  await pg.screenshot({ path: OUT + '/S4-home.png', fullPage: true });

  console.log('\n10. กดการ์ดหมวดแล้วเข้าหน้าหมวด');
  await pg.locator('.catrow button', { hasText: 'Chemical' }).click();
  await pg.waitForTimeout(400);
  ok('เข้าหน้าหมวดแล้ว', await pg.locator('#pg-cat').isVisible());
  ok('มีรูปปกหมวด', (await pg.locator('#cat-hero img').count()) === 1);
  ok('ขึ้นชื่อที่ตั้งให้โชว์ ไม่ใช่ชื่อในชีท',
     (await pg.locator('#cat-body h2').innerText()).trim() === 'Chemical');
  ok('โชว์แต่สินค้าในหมวดนั้น', (await pg.locator('#cat-body .card').count()) === 2);
  ok('หัวฟ้าของหน้าแรกถูกซ่อน', !(await pg.locator('.hdr').isVisible()));
  ok('แถบล่างชี้ที่หมวดหมู่',
     (await pg.locator('#nav-cats').getAttribute('class')).indexOf('on') > -1);
  await pg.screenshot({ path: OUT + '/S5-cat.png', fullPage: true });

  await pg.locator('#pg-cat [data-go="shop"]').click();
  await pg.waitForTimeout(350);
  ok('กดย้อนกลับแล้วกลับหน้าแรก', await pg.locator('#pg-shop').isVisible());
  ok('และหัวฟ้ากลับมา', await pg.locator('.hdr').isVisible());

  console.log('\n11. ปุ่มบนแบนเนอร์พาไปหน้าหมวดในร้าน ไม่เด้งออกนอก');
  await pg.locator('.bbtn', { hasText: 'Buy Now' }).click();
  await pg.waitForTimeout(400);
  ok('กด Buy Now แล้วเข้าหน้าหมวดที่ผูกไว้', await pg.locator('#pg-cat').isVisible());
  ok('เข้าหมวดถูกตัว',
     (await pg.locator('#cat-body h2').innerText()).trim() === 'Chemical');
  await pg.locator('#pg-cat [data-go="shop"]').click();
  await pg.waitForTimeout(350);

  console.log('\n12. หัวใจถูกใจ — เก็บในเครื่องลูกค้าเท่านั้น');
  ok('ยังไม่มีแถบถูกใจ',
     (await pg.locator('.sec-hd h2', { hasText: 'ถูกใจไว้' }).count()) === 0);
  var sentBefore = await pg.evaluate(() => SENT_ORDERS.length);
  await pg.locator('#pg-shop .grid [data-fav="SKU-210"]').click();
  await pg.waitForTimeout(350);
  ok('กดหัวใจแล้วติดสีแดง',
     (await pg.locator('#pg-shop .grid [data-fav="SKU-210"]').getAttribute('class'))
       .indexOf('on') > -1);
  ok('แถบถูกใจโผล่ขึ้นมา',
     (await pg.locator('.sec-hd h2', { hasText: 'ถูกใจไว้' }).count()) === 1);
  ok('กดหัวใจไม่ทำให้ของลงตะกร้า',
     (await pg.evaluate(() => Object.keys(CART).length)) === 0);
  /* ก่อนหน้านี้มีการสั่งซื้อจริงไปแล้ว จึงเทียบกับจำนวนก่อนกดหัวใจ ไม่ใช่ศูนย์ */
  ok('ถูกใจไม่ถูกส่งกลับไปที่ร้าน',
     (await pg.evaluate(() => SENT_ORDERS.length)) === sentBefore);
  await pg.locator('#pg-shop .grid [data-fav="SKU-210"]').click();
  await pg.waitForTimeout(300);
  ok('กดซ้ำแล้วเอาออก',
     (await pg.locator('.sec-hd h2', { hasText: 'ถูกใจไว้' }).count()) === 0);

  console.log('\n13. แถบแผนที่');
  ok('มีแถบแผนที่ให้กด', await pg.locator('#btn-map').isVisible());
  ok('ขึ้นที่อยู่แบบสั้น',
     (await pg.locator('#map-txt').innerText()).trim() === '2/1 ซ.ตัวอย่าง');

  /* ---------------------------------------- หน้ากรอกที่อยู่ ต้องไม่มีอะไรโดนตัด

     ของจริง: แถบล่างลอยทับปุ่ม "ยืนยันการสั่งซื้อ" บนมือถือของเจ้าของร้าน
     ทั้งที่ในเบราว์เซอร์ทดสอบยังเหลือที่ว่างใต้ปุ่ม 31px — ความสูงของช่องมองเห็น
     บนมือถือจริงเปลี่ยนตามแถบที่อยู่เว็บที่ยุบ-ยืด และหน้านี้อยู่ใน iframe
     ของ Apps Script อีกชั้น กะระยะเผื่อเป็นพิกเซลให้พอดีทุกเครื่องไม่ได้
     ทางที่แน่นอนคือหน้านี้ไม่มีแถบล่างเลย                                    */
  console.log('\n' + (fails ? '' : '') + 'x. หน้ากรอกที่อยู่ — ปุ่มยืนยันต้องไม่โดนแถบล่างทับ');
  for (var vp of [{ w: 390, h: 844 }, { w: 390, h: 700 }, { w: 430, h: 932 }]) {
    var cp = await b.newPage({ viewport: { width: vp.w, height: vp.h } });
    await cp.goto('file:///home/user/ast-shop/out/shop.html');
    await cp.waitForTimeout(900);
    await cp.locator('#pg-shop .grid .plus').first().click();
    await cp.waitForTimeout(200);
    await cp.locator('#nav-cart').click();
    await cp.waitForTimeout(350);
    await cp.locator('[data-go="pay"]').first().click();
    await cp.waitForTimeout(350);
    await cp.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await cp.waitForTimeout(250);
    var m = await cp.evaluate(() => {
      var nav = document.querySelector('.nav');
      var navOn = getComputedStyle(nav).display !== 'none';
      var foot = document.querySelector('.ckfoot').getBoundingClientRect();
      var btn = document.querySelector('#btn-send').getBoundingClientRect();
      return { navOn: navOn, navTop: navOn ? nav.getBoundingClientRect().top : 1e9,
               footBottom: foot.bottom, btnBottom: btn.bottom,
               btnW: btn.width, vh: window.innerHeight };
    });
    var lim = Math.min(m.navTop, m.vh);
    ok('จอ ' + vp.w + 'x' + vp.h + ' — ไม่มีแถบล่างมาทับหน้านี้', !m.navOn);
    ok('จอ ' + vp.w + 'x' + vp.h + ' — ปุ่มกับข้อความท้ายอยู่ครบในจอ (' +
       Math.round(m.footBottom) + ' ไม่เกิน ' + Math.round(lim) + ')',
       m.footBottom <= lim + 1);
    ok('จอ ' + vp.w + 'x' + vp.h + ' — ปุ่มยืนยันกว้างเต็มแถว กดพลาดยาก (' +
       Math.round(m.btnW) + 'px)', m.btnW > vp.w * 0.7);
    await cp.close();
  }

  ok('ไม่มี error สะสมตลอดการทดสอบ', errs.length === 0, errs.join(' | '));
  await b.close();
  console.log(fails ? '\nตก ' + fails + ' ข้อ' : '\nผ่านทั้งหมด');
  process.exit(fails ? 1 : 0);
})();
