const { chromium } = require('/opt/node22/lib/node_modules/playwright');
var OUT = '/tmp/claude-0/-home-user-ast-shop/0f0ff42b-d95c-5e5d-befd-c9cffcf7c2ff/scratchpad';
var fails = 0, errs = [];
function ok(l, v, x) { if (!v) { fails++; errs.push(l) } console.log((v?'  ok   ':'  FAIL ')+l+(v?'':'  '+(x||''))) }
(async () => {
  const b = await chromium.launch();
  const pg = await b.newPage({ viewport: { width: 430, height: 950 }, deviceScaleFactor: 2 });
  /* รูปตัวอย่างในข้อมูลจำลองชี้ไป drive.google.com ซึ่งเครื่องที่รันข้อสอบเปิดไม่ได้
     โหลดรูปจากข้างนอกไม่ติดไม่ใช่ความผิดของโค้ด นับเฉพาะ error ที่โค้ดเราทำเอง */
  var EXT = /fonts\.googleapis|fonts\.gstatic|drive\.google|ERR_CERT|ERR_NAME|Failed to load resource/;
  var jsErr = [];
  pg.on('pageerror', e => { if (!EXT.test(e.message)) jsErr.push(e.message) });
  pg.on('console', m => {
    var where = (m.location() && m.location().url) || '';
    if (m.type() === 'error' && !EXT.test(m.text()) && !EXT.test(where)) jsErr.push(m.text());
  });
  await pg.goto('file:///home/user/ast-shop/out/preview.html');
  await pg.waitForSelector('#form', { timeout: 20000 });
  await pg.waitForTimeout(500);

  console.log('1. เข้าโหมดแก้ไข');
  await pg.locator('#fs-edit').click();
  await pg.waitForTimeout(400);
  ok('หน้าโหมดแก้ไขเปิด', await pg.locator('#pg-edit').isVisible());
  ok('มีเมนู 7 อัน', (await pg.locator('.edmenu button').count()) === 7);
  await pg.screenshot({ path: OUT + '/E1-hub.png', fullPage: true });

  console.log('\n2. ข้อมูลร้าน — แก้รูปและราคา');
  await pg.locator('[data-edgo="eprod"]').click();
  await pg.waitForTimeout(600);
  ok('เข้าหน้าข้อมูลร้าน', await pg.locator('#pg-eprod').isVisible());
  ok('โหลดรายการสินค้ามา 3 ตัว', (await pg.locator('[data-eprod]').count()) === 3);
  ok('ตัวที่ซ่อนติดป้ายบอก',
     (await pg.locator('[data-eprod="SKU-181"] .off').innerText()).indexOf('ซ่อน') > -1);
  await pg.screenshot({ path: OUT + '/E2-prod.png', fullPage: true });

  await pg.locator('[data-eprod="SKU-Chem-102"]').click();
  await pg.waitForTimeout(350);
  ok('กล่องแก้เปิด', await pg.locator('#modal.on').isVisible());
  ok('ราคาเดิมขึ้นในช่อง', (await pg.locator('#epm-price').inputValue()) === '120');
  await pg.locator('#epm-price').fill('135');
  await pg.locator('#epm-img').fill('https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUv/view');
  await pg.locator('#epm-tags button', { hasText: 'แนะนำ' }).click();
  ok('ป้ายติดแล้ว',
     (await pg.locator('#epm-tags button', { hasText: 'แนะนำ' }).getAttribute('class')) === 'on');
  await pg.locator('#epm-save').click();
  await pg.waitForTimeout(800);
  ok('กล่องปิดหลังบันทึก', !(await pg.locator('#modal.on').isVisible()));
  ok('ขึ้นข้อความว่าบันทึกแล้ว', await pg.locator('#ep-ok').isVisible());
  ok('รายการอัปเดตราคาใหม่',
     (await pg.locator('[data-eprod="SKU-Chem-102"] .sub').innerText()).indexOf('135') > -1);
  ok('ส่งค่าไปครบ', await pg.evaluate(() => {
    var s = SENT.filter(x => x.fn === 'saveShopProduct').pop();
    return s && s.p.sku === 'SKU-Chem-102' && s.p.price === '135' && s.p.tag === 'แนะนำ';
  }));

  console.log('\n3. สินค้าแนะนำ — โชว์แต่ตัวที่ติดป้าย');
  await pg.locator('#ep-back').click();
  await pg.waitForTimeout(300);
  await pg.locator('[data-edgo="etag"]').click();
  await pg.waitForTimeout(600);
  ok('หัวข้อเปลี่ยนเป็นสินค้าแนะนำ',
     (await pg.locator('#ep-title').innerText()).trim() === 'สินค้าแนะนำ');
  ok('โชว์แต่สองตัวที่ติดป้าย', (await pg.locator('[data-eprod]').count()) === 2);
  await pg.locator('#ep-q').fill('Square');
  await pg.waitForTimeout(300);
  ok('พิมพ์ค้นหาแล้วหาตัวที่ยังไม่ติดป้ายได้', (await pg.locator('[data-eprod]').count()) === 1);

  console.log('\n4. แบนเนอร์');
  await pg.locator('#ep-back').click();
  await pg.waitForTimeout(300);
  await pg.locator('[data-edgo="eban"]').click();
  await pg.waitForTimeout(600);
  ok('มีแบนเนอร์เดิมหนึ่งอัน', (await pg.locator('[data-eban]').count()) === 1);
  await pg.screenshot({ path: OUT + '/E3-ban.png', fullPage: true });

  await pg.locator('#eb-add').click();
  await pg.waitForTimeout(350);
  await pg.locator('#ebm-save').click();
  await pg.waitForTimeout(600);
  ok('ไม่ใส่รูปแล้วฟ้อง ไม่ใช่บันทึกเงียบ', await pg.locator('#ebm-err').isVisible());
  ok('และกล่องยังเปิดอยู่ให้แก้', await pg.locator('#modal.on').isVisible());

  await pg.locator('#ebm-img').fill('https://drive.google.com/file/d/2ZyXwVuTsRqPoNmLkJiHgF/view');
  await pg.locator('#ebm-title').fill('โปรตุลา');
  await pg.locator('#ebm-slot button', { hasText: 'โปรโมชั่นประจำเดือน' }).click();
  await pg.locator('#ebm-save').click();
  await pg.waitForTimeout(800);
  ok('เพิ่มแบนเนอร์ได้', (await pg.locator('[data-eban]').count()) === 2);
  ok('ไปอยู่ในแถบที่เลือก',
     (await pg.locator('.card', { hasText: 'โปรโมชั่นประจำเดือน' })
        .locator('[data-eban]').count()) === 1);

  console.log('\n5. ลบแบนเนอร์ต้องถามซ้ำ');
  await pg.locator('[data-eban]').last().click();
  await pg.waitForTimeout(350);
  await pg.locator('#ebm-del').click();
  await pg.waitForTimeout(250);
  ok('กดลบครั้งแรกยังไม่ลบ ถามซ้ำก่อน',
     (await pg.locator('#ebm-del').innerText()).indexOf('ยืนยัน') > -1);
  ok('ยังไม่ได้ยิงคำสั่งลบ',
     await pg.evaluate(() => SENT.filter(x => x.fn === 'deleteShopBanner').length === 0));
  await pg.locator('#ebm-del').click();
  await pg.waitForTimeout(800);
  ok('กดซ้ำแล้วลบจริง', (await pg.locator('[data-eban]').count()) === 1);

  console.log('\n6. หมวดหมู่');
  await pg.locator('#eb-back').click();
  await pg.waitForTimeout(300);
  await pg.locator('[data-edgo="ecat"]').click();
  await pg.waitForTimeout(600);
  ok('มีหมวดสองหมวด', (await pg.locator('[data-ecat]').count()) === 2);
  await pg.locator('[data-ecat="ดอกกัดคาร์ไบด์"]').click();
  await pg.waitForTimeout(350);
  await pg.locator('#ecm-label').fill('เครื่องมือตัด');
  await pg.locator('#ecm-home button', { hasText: 'ซ่อน' }).click();
  await pg.locator('#ecm-save').click();
  await pg.waitForTimeout(800);
  ok('ชื่อที่โชว์เปลี่ยนแล้ว',
     (await pg.locator('[data-ecat="ดอกกัดคาร์ไบด์"] b').innerText()).trim() === 'เครื่องมือตัด');
  ok('ติดป้ายว่าซ่อนจากหน้าแรก',
     (await pg.locator('[data-ecat="ดอกกัดคาร์ไบด์"] .off').count()) === 1);
  await pg.screenshot({ path: OUT + '/E4-cat.png', fullPage: true });

  console.log('\n7. หน้าตาหัวร้าน');
  await pg.locator('#ec-back').click();
  await pg.waitForTimeout(300);
  await pg.locator('[data-edgo="elook"]').click();
  await pg.waitForTimeout(600);
  ok('ฟอร์มขึ้น', await pg.locator('#elm-logo').isVisible());
  await pg.locator('#elm-map').fill('https://maps.app.goo.gl/abc');
  await pg.locator('#elm-save').click();
  await pg.waitForTimeout(800);
  ok('บันทึกแล้วขึ้นข้อความ', await pg.locator('#el-ok').isVisible());
  ok('ส่งลิงก์แผนที่ไป', await pg.evaluate(() =>
     (SENT.filter(x => x.fn === 'saveShopLook').pop() || {}).v.map === 'https://maps.app.goo.gl/abc'));

  console.log('\n8. กลับออกมาแล้วแอปเดิมยังทำงาน');
  await pg.locator('#el-back').click();
  await pg.waitForTimeout(300);
  await pg.locator('.tabs button[data-go="new"]').click();
  await pg.waitForTimeout(400);
  ok('กลับหน้าคีย์ออเดอร์ได้', await pg.locator('#pg-new').isVisible());
  ok('ฟอร์มออเดอร์ยังอยู่', await pg.locator('#form').isVisible());

  console.log('\n9. ปุ่มเลือกรูปจากเครื่อง — ไม่ต้องไปหาลิงก์เอง');
  await pg.locator('#fs-edit').click();
  await pg.waitForTimeout(350);
  await pg.locator('[data-edgo="eprod"]').click();
  await pg.waitForTimeout(600);
  await pg.locator('[data-eprod="SKU-181"]').click();
  await pg.waitForTimeout(400);
  ok('ช่องรูปที่ 1 มีปุ่มเลือกรูป',
     (await pg.locator('[data-pick="epm-img"]').count()) === 1);
  ok('ช่องรูปที่ 2 ก็มี',
     (await pg.locator('[data-pick="epm-img2"]').count()) === 1);
  ok('บอกขนาดรูปที่ควรใช้ไว้ใต้ช่อง',
     /1000×1000/.test(await pg.locator('#epm-img-msg').innerText()));
  ok('บอกขนาดไฟล์สูงสุดด้วย',
     /8 MB/.test(await pg.locator('#epm-img-msg').innerText()));
  ok('ยังไม่มีรูป ตัวอย่างต้องซ่อนอยู่',
     !(await pg.locator('#epm-img-prev').isVisible()));
  ok('ช่องลิงก์ยังว่าง', (await pg.locator('#epm-img').inputValue()) === '');

  /* เลือกไฟล์จริงจากเครื่อง แล้วดูว่าลิงก์ถูกเติมให้เอง */
  await pg.locator('#epm-img-file').setInputFiles({
    name: 'endmill.png', mimeType: 'image/png',
    buffer: Buffer.from(
      '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a'
      + '49444154789c6300010000050001od7ad40000000049454e44ae426082'.replace(/[^0-9a-f]/g,''),
      'hex')
  });
  await pg.waitForTimeout(900);
  ok('เลือกรูปแล้วลิงก์ถูกเติมให้เอง ไม่ต้องไปหาเอง',
     /drive\.google\.com/.test(await pg.locator('#epm-img').inputValue()));
  ok('รูปตัวอย่างโผล่ขึ้นมา', await pg.locator('#epm-img-prev').isVisible());
  ok('บอกให้กดบันทึกต่อ ไม่ปล่อยให้คิดว่าจบแล้ว',
     /บันทึก/.test(await pg.locator('#epm-img-msg').innerText()));
  ok('ส่งชนิดรูปไปบอกฝั่งเซิร์ฟเวอร์ด้วย', await pg.evaluate(() => {
    var u = SENT.filter(x => x.fn === 'uploadShopImage').pop();
    return u && u.kind === 'prod' && u.tag === 'SKU-181';
  }));
  await pg.screenshot({ path: OUT + '/E5-upload.png', fullPage: true });

  await pg.locator('#epm-save').click();
  await pg.waitForTimeout(900);
  ok('กดบันทึกแล้วลิงก์ลงไปถึงชีท', await pg.evaluate(() => {
    var s = SENT.filter(x => x.fn === 'saveShopProduct').pop();
    return s && /drive\.google\.com/.test(s.p.img);
  }));

  console.log('\n10. ช่องรูปที่เหลือก็ต้องมีปุ่มเหมือนกัน');
  await pg.locator('#ep-back').click();
  await pg.waitForTimeout(300);
  await pg.locator('[data-edgo="eban"]').click();
  await pg.waitForTimeout(600);
  await pg.locator('#eb-add').click();
  await pg.waitForTimeout(400);
  ok('แบนเนอร์มีปุ่มเลือกรูป', (await pg.locator('[data-pick="ebm-img"]').count()) === 1);
  ok('และบอกว่าควรใช้รูปแนวนอน',
     /1200×600/.test(await pg.locator('#ebm-img-msg').innerText()));
  await pg.locator('#m-close').click();
  await pg.waitForTimeout(250);

  await pg.locator('#eb-back').click();
  await pg.waitForTimeout(300);
  await pg.locator('[data-edgo="ecat"]').click();
  await pg.waitForTimeout(600);
  await pg.locator('[data-ecat="เคมีภัณฑ์"]').click();
  await pg.waitForTimeout(400);
  ok('หมวดมีปุ่มเลือกรูปไอคอน', (await pg.locator('[data-pick="ecm-icon"]').count()) === 1);
  ok('และปุ่มเลือกรูปปก', (await pg.locator('[data-pick="ecm-cover"]').count()) === 1);
  await pg.locator('#m-close').click();
  await pg.waitForTimeout(250);

  await pg.locator('#ec-back').click();
  await pg.waitForTimeout(300);
  await pg.locator('[data-edgo="elook"]').click();
  await pg.waitForTimeout(600);
  ok('โลโก้มีปุ่มเลือกรูป', (await pg.locator('[data-pick="elm-logo"]').count()) === 1);
  ok('ภาพหัวร้านมีปุ่มเลือกรูป', (await pg.locator('[data-pick="elm-cover"]').count()) === 1);
  ok('โลโก้บอกว่าจะถูกตัดเป็นวงกลม',
     /วงกลม/.test(await pg.locator('#elm-logo-msg').innerText()));

  ok('ไม่มี error ตลอดการทดสอบ', jsErr.length === 0, jsErr.join(' | '));
  await b.close();
  console.log(fails ? '\nตก ' + fails + ' ข้อ' : '\nผ่านทั้งหมด');
  process.exit(fails ? 1 : 0);
})();
