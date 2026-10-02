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
  ok('บอกว่าถ่ายมาได้เลย แอปย่อให้เอง',
     /ย่อให้เอง/.test(await pg.locator('#epm-img-msg').innerText()));
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

  /* รูปจากกล้องมือถือใบหนึ่ง 4–8 MB พอแปลงเป็นข้อความเพื่อส่งจะบวมอีกหนึ่งในสาม
     เจ้าของร้านรออัปรูปเดียวเป็นนาที และไม่มีอะไรบอกว่ามันยังทำงานอยู่หรือค้างไปแล้ว
     ข้อสอบนี้จึงวัดจำนวนไบต์ที่ส่งจริง ไม่ใช่วัดว่ามีการเรียกฟังก์ชันไหม */
  console.log('\n9ข. รูปใหญ่ต้องถูกย่อในเครื่องก่อนส่ง');
  var big = await pg.evaluate(async () => {
    var c = document.createElement('canvas');
    c.width = 2400; c.height = 1600;
    var g = c.getContext('2d');
    /* ภาพรบกวนแบบสุ่ม เลียนแบบรูปถ่ายจริงที่บีบแล้วยังใหญ่
       ถ้าใช้พื้นสีเดียว JPEG จะบีบเหลือไม่กี่ KB แล้วข้อสอบจะผ่านแบบหลอกตัวเอง */
    var im = g.createImageData(c.width, c.height);
    for (var i = 0; i < im.data.length; i += 4) {
      im.data[i] = Math.random() * 255; im.data[i+1] = Math.random() * 255;
      im.data[i+2] = Math.random() * 255; im.data[i+3] = 255;
    }
    g.putImageData(im, 0, 0);
    var blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.95));
    var f = new File([blob], 'photo.jpg', { type: 'image/jpeg' });
    var dt = new DataTransfer(); dt.items.add(f);
    var el = document.querySelector('#epm-img2-file');
    el.files = dt.files;
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return f.size;
  });
  ok('สร้างรูปทดสอบที่ใหญ่พอจะเห็นผล (' + Math.round(big/1024) + ' KB)', big > 700 * 1024);

  await pg.waitForTimeout(2500);
  var up = await pg.evaluate(() => SENT.filter(x => x.fn === 'uploadShopImage').pop());
  ok('ส่งขึ้นไปจริง', !!up && /^data:image\//.test(up.data || ''));
  ok('ที่ส่งไปเล็กกว่าไฟล์ต้นฉบับมาก (' + Math.round(big/1024) + ' KB → ' +
     Math.round((up ? up.bytes : 0)/1024) + ' KB)',
     !!up && up.bytes < big / 4);
  ok('แปลงเป็น JPEG ไม่ใช่ส่งของเดิม', !!up && /^data:image\/jpeg/.test(up.data || ''));

  var dim = await pg.evaluate(async () => {
    var u = SENT.filter(x => x.fn === 'uploadShopImage').pop();
    var im = new Image();
    await new Promise(r => { im.onload = r; im.onerror = r; im.src = u.data });
    return { w: im.naturalWidth, h: im.naturalHeight };
  });
  ok('ด้านยาวสุดไม่เกิน 1000px ตามที่การ์ดสินค้าใช้จริง (' + dim.w + '×' + dim.h + ')',
     Math.max(dim.w, dim.h) <= 1000 && dim.w > 0);
  ok('สัดส่วนภาพไม่เพี้ยน รูปแนวนอนยังเป็นแนวนอน',
     Math.abs((dim.w / dim.h) - (2400 / 1600)) < 0.02);
  ok('บอกให้เห็นว่าย่อจากเท่าไรเหลือเท่าไร ไม่ใช่ขึ้นว่ากำลังอัปเฉย ๆ',
     /ย่อจาก/.test(await pg.locator('#epm-img2-msg').innerText()));

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
     /แนวนอน/.test(await pg.locator('#ebm-img-msg').innerText()));
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

  console.log('\n11. หมวดหมู่ — เปลี่ยนทีละตัว และย้ายทั้งชุด');
  await pg.locator('#el-back').click();
  await pg.waitForTimeout(300);
  await pg.locator('[data-edgo="eprod"]').click();
  await pg.waitForTimeout(700);
  ok('การ์ดสินค้าบอกหมวดด้วย',
     /ดอกกัดคาร์ไบด์/.test(await pg.locator('[data-eprod="SKU-148"] .sub').innerText()));

  await pg.locator('[data-eprod="SKU-148"]').click();
  await pg.waitForTimeout(400);
  ok('กล่องแก้มีช่องเลือกหมวด', (await pg.locator('#epm-grp').count()) === 1);
  ok('มีชิปหมวดที่มีอยู่ให้เลือก',
     (await pg.locator('#epm-grp button[data-grp]').count()) >= 2);
  ok('และมีปุ่มพิมพ์หมวดใหม่',
     (await pg.locator('#epm-grp button[data-grpnew]').count()) === 1);
  ok('ช่องพิมพ์หมวดใหม่ซ่อนอยู่ก่อน', !(await pg.locator('#epm-grp-new').isVisible()));
  await pg.locator('#epm-grp button[data-grpnew]').click();
  await pg.waitForTimeout(250);
  ok('กดแล้วช่องพิมพ์โผล่', await pg.locator('#epm-grp-new').isVisible());
  await pg.locator('#epm-grp-new').fill('Router Bit');
  await pg.locator('#epm-save').click();
  await pg.waitForTimeout(900);
  ok('บันทึกแล้วหมวดเปลี่ยน',
     /Router Bit/.test(await pg.locator('[data-eprod="SKU-148"] .sub').innerText()));
  ok('ส่งหมวดใหม่ไปให้ฝั่งเซิร์ฟเวอร์', await pg.evaluate(() => {
    var s = SENT.filter(x => x.fn === 'saveShopProduct').pop();
    return s && s.p.group === 'Router Bit';
  }));

  console.log('\n12. ย้ายทั้งชุดที่ค้นเจอ');
  ok('มีปุ่มย้ายทั้งชุด', await pg.locator('#ep-move').isVisible());
  await pg.locator('#ep-q').fill('Endmill');
  await pg.waitForTimeout(350);
  var nHit = await pg.locator('[data-eprod]').count();
  ok('ค้นแล้วปุ่มบอกจำนวนที่จะย้ายตามผลค้น',
     (await pg.locator('#ep-move').innerText()).indexOf(String(nHit)) > -1);
  await pg.locator('#ep-move').click();
  await pg.waitForTimeout(400);
  ok('กล่องย้ายเปิด', await pg.locator('#modal.on').isVisible());
  await pg.locator('#emv-go').click();
  await pg.waitForTimeout(500);
  ok('ยังไม่เลือกหมวดแล้วกดย้าย ต้องฟ้อง ไม่ใช่ย้ายไปหมวดว่าง',
     await pg.locator('#emv-err').isVisible());
  await pg.locator('#emv-grp button[data-grpnew]').click();
  await pg.locator('#emv-grp-new').fill('Endmill Corn');
  await pg.locator('#emv-go').click();
  await pg.waitForTimeout(1000);
  ok('ย้ายแล้วกล่องปิด', !(await pg.locator('#modal.on').isVisible()));
  ok('ขึ้นข้อความบอกว่าย้ายไปกี่ตัว',
     /ย้ายไปหมวด Endmill Corn/.test(await pg.locator('#ep-ok').innerText()));
  ok('ส่งรายชื่อสินค้าไปครบ', await pg.evaluate(() => {
    var s = SENT.filter(x => x.fn === 'moveShopCategory').pop();
    return s && s.p.group === 'Endmill Corn' && s.p.skus.length > 0;
  }));

  console.log('\n13. หน้ารวมเมนูตามแบบที่ส่งมา');
  await pg.locator('#ep-back').click();
  await pg.waitForTimeout(350);
  ok('มีแถบหัวโหมดแก้ไข', await pg.locator('.edhero').isVisible());
  ok('สองเมนูหลักเด่นกว่าเพื่อน', (await pg.locator('.edmenu button.lead').count()) === 2);
  ok('เมนูรองอยู่ในกล่องรวม', (await pg.locator('.edgroup .edmenu button').count()) === 4);
  ok('ทุกเมนูมีไอคอน', (await pg.locator('.edmenu .ic').count()) === 7);
  ok('มีท้ายหน้าตามแบบ', await pg.locator('.edfoot').isVisible());

  console.log('\n14. เพิ่มหมวดหมู่จากหน้าหมวดได้เลย');
  await pg.locator('[data-edgo="ecat"]').click();
  await pg.waitForTimeout(700);
  var nCat = await pg.locator('[data-ecat]').count();
  ok('มีปุ่มเพิ่มหมวดหมู่', await pg.locator('#ec-add').isVisible());
  ok('การ์ดหมวดบอกจำนวนสินค้า',
     /สินค้า \d+ ตัว/.test(await pg.locator('[data-ecat="เคมีภัณฑ์"] .sub').innerText()));

  await pg.locator('#ec-add').click();
  await pg.waitForTimeout(350);
  await pg.locator('#ecn-go').click();
  await pg.waitForTimeout(400);
  ok('ไม่ใส่ชื่อแล้วกดสร้าง ต้องฟ้อง', await pg.locator('#ecn-err').isVisible());

  await pg.locator('#ecn-name').fill('เคมีภัณฑ์');
  await pg.locator('#ecn-go').click();
  await pg.waitForTimeout(400);
  ok('ชื่อซ้ำกับหมวดที่มีอยู่ ต้องฟ้อง',
     /มีหมวดชื่อนี้อยู่แล้ว/.test(await pg.locator('#ecn-err').innerText()));

  await pg.locator('#ecn-name').fill('Router Bit');
  await pg.locator('#ecn-label').fill('ดอกเราเตอร์');
  await pg.locator('#ecn-go').click();
  await pg.waitForTimeout(900);
  ok('สร้างหมวดใหม่ได้', (await pg.locator('[data-ecat]').count()) === nCat + 1);
  ok('ขึ้นข้อความบอกให้ไปใส่สินค้าต่อ',
     /ย้ายสินค้าเข้าหมวดนี้/.test(await pg.locator('#ec-ok').innerText()));
  ok('หมวดใหม่ติดป้ายว่ายังไม่มีสินค้า',
     /ยังไม่มีสินค้า/.test(await pg.locator('[data-ecat="Router Bit"] .pills').innerText()));

  await pg.locator('[data-ecat="Router Bit"]').click();
  await pg.waitForTimeout(400);
  ok('เปิดแล้วเตือนว่าลูกค้ายังไม่เห็นหมวดนี้',
     /ลูกค้าจึงไม่เห็นบนหน้าร้าน/.test(await pg.locator('#m-body').innerText()));
  await pg.locator('#m-close').click();
  await pg.waitForTimeout(250);
  await pg.screenshot({ path: OUT + '/E6-cat.png', fullPage: true });

  console.log('\n15. ลิงก์หน้าร้านอยู่บนหน้ารวมเมนู');
  await pg.locator('#ec-back').click();
  await pg.waitForTimeout(700);
  ok('มีกล่องลิงก์หน้าร้าน', await pg.locator('#ed-links').isVisible());
  ok('มีลิงก์สองตัว', (await pg.locator('.edlink').count()) === 2);
  ok('ตัวดูเองใช้ลิงก์ที่เปิดอยู่ + ?shop=1',
     /STAFF\/exec\?shop=1/.test(await pg.locator('.edlink').first().innerText()));
  ok('ตัวลูกค้าใช้ลิงก์จากชีท ไม่ใช่ลิงก์พนักงาน',
     /PUBLIC\/exec\?shop=1/.test(await pg.locator('.edlink').nth(1).innerText()));
  ok('ตัวลูกค้ามีปุ่มคัดลอก', (await pg.locator('.edlink [data-copy]').count()) === 1);
  ok('เตือนว่าสองลิงก์เป็นคนละตัวกัน',
     /คนละตัวกัน/.test(await pg.locator('#ed-links-bd').innerText()));
  await pg.screenshot({ path: OUT + '/E7-links.png', fullPage: true });

  /* ยังไม่ได้กรอกลิงก์ลูกค้า ต้องบอกให้ชัดว่าต้องทำอะไรต่อ ไม่ใช่โชว์ลิงก์พนักงานแทน */
  await pg.evaluate(() => {
    MOCK_ED.look.links = { preview: "https://script.google.com/macros/s/STAFF/exec?shop=1",
      customer: "", why: 'ยังไม่ได้กรอก "ลิงก์เว็บแอปสำหรับลูกค้า" ในชีท ตั้งค่าแอป' };
    EDGOT.look = false;
    edLoad("look", true, edLinksDraw);
  });
  await pg.waitForTimeout(700);
  ok('ยังไม่มีลิงก์ลูกค้า ขึ้นกล่องแดงบอกเหตุผล',
     await pg.locator('#ed-links-bd .msg.err').isVisible());
  ok('และไม่เอาลิงก์พนักงานมาโชว์เป็นลิงก์ลูกค้า',
     (await pg.locator('.edlink').count()) === 1);

  /* เดิมกล่องแดงบอกแค่ "ไปกรอกในชีท ตั้งค่าแอป" ซึ่งแปลว่าคนที่เพิ่งสร้าง deploy เสร็จ
     และมีลิงก์อยู่ในมือ ต้องไปเปิดชีทบนมือถือแล้วไล่หาแถว งานค้างอยู่ตรงนั้นทุกครั้ง */
  console.log('\n15ข. วางลิงก์ลูกค้าได้ตรงที่เตือน ไม่ต้องเปิดชีท');
  ok('มีช่องให้วางลิงก์อยู่ในกล่องเตือน', await pg.locator('#ed-paylink').isVisible());
  ok('มีปุ่มบันทึกลิงก์', await pg.locator('#ed-paysave').isVisible());
  await pg.screenshot({ path: OUT + '/E7b-paste.png', fullPage: true });

  /* วางลิงก์พนักงานผิดตัว = ลูกค้าเจอหน้าล็อกอิน ต้องฟ้องตรงนั้น ไม่ใช่เงียบแล้วบันทึก */
  await pg.locator('#ed-paylink').fill('https://script.google.com/macros/s/STAFF/exec?shop=1');
  await pg.locator('#ed-paysave').click();
  await pg.waitForTimeout(700);
  ok('วางลิงก์พนักงานมา ขึ้นคำเตือนตรงนั้น',
     /ลิงก์เดียวกับที่คุณเปิดอยู่/.test(await pg.locator('#ed-paymsg').innerText()));
  ok('ไม่โชว์รหัสภายใน SAME_AS_STAFF ให้คนอ่าน',
     !/SAME_AS_STAFF/.test(await pg.locator('#ed-paymsg').innerText()));
  ok('ยังไม่มีลิงก์ลูกค้าเพิ่มขึ้นมา', (await pg.locator('.edlink').count()) === 1);
  ok('กดใหม่ได้ ปุ่มไม่ค้างอยู่ที่ "กำลังบันทึก"',
     !(await pg.locator('#ed-paysave').isDisabled()));

  /* deploy ตัวเดียวที่ตั้ง "ทุกคน" ใช้ได้จริงทั้งสองหน้า จึงต้องมีทางไปต่อ
     ไม่ใช่ตันอยู่แค่คำเตือน แต่ต้องเป็นการกดยืนยันเอง ไม่ใช่ผ่านไปเงียบ ๆ */
  var confirmBtn = pg.locator('#ed-paymsg button');
  ok('มีปุ่มให้ยืนยันหลังไปทดสอบมาแล้ว', (await confirmBtn.count()) === 1);
  ok('ปุ่มบอกชัดว่าต้องทดสอบก่อนถึงกด',
     /ทดสอบแล้ว/.test(await confirmBtn.innerText()));
  await confirmBtn.click();
  await pg.waitForTimeout(900);
  ok('ยืนยันแล้วบันทึกได้จริง',
     (await pg.locator('.edlink').count()) === 2);
  var sentSure = await pg.evaluate(() =>
    (SENT.filter(x => x.fn === 'saveShopLook').pop() || {}).v);
  ok('ส่งธงยืนยันขึ้นไปด้วย', !!sentSure && sentSure.payLinkSure === true);

  /* กลับไปสถานะไม่มีลิงก์ เพื่อสอบทางปกติต่อ */
  await pg.evaluate(() => {
    MOCK_ED.look.payLink = "";
    MOCK_ED.look.links = { preview: "https://script.google.com/macros/s/STAFF/exec?shop=1",
      customer: "", why: 'ยังไม่ได้กรอก "ลิงก์เว็บแอปสำหรับลูกค้า"' };
    EDGOT.look = false;
    edLoad("look", true, edLinksDraw);
  });
  await pg.waitForTimeout(700);

  await pg.locator('#ed-paylink').fill(
    'https://script.google.com/macros/s/PUBLIC9/exec?shop=1');
  await pg.locator('#ed-paysave').click();
  await pg.waitForTimeout(900);
  var sent15 = await pg.evaluate(() =>
    (SENT.filter(x => x.fn === 'saveShopLook').pop() || {}).v);
  ok('ส่งลิงก์ที่วางขึ้นชีทจริง',
     sent15 && /PUBLIC9\/exec/.test(sent15.payLink || ''), JSON.stringify(sent15));
  ok('บันทึกแล้วกล่องแดงหายไป',
     (await pg.locator('#ed-links-bd .msg.err').count()) === 0);
  ok('และขึ้นเป็นลิงก์ลูกค้าพร้อมปุ่มคัดลอกทันที',
     (await pg.locator('.edlink').count()) === 2 &&
     (await pg.locator('.edlink [data-copy]').count()) === 1);
  ok('ลิงก์ที่ได้ต่อ ?shop=1 ให้ชั้นเดียว ไม่ซ้อนกันสองชั้น',
     /PUBLIC9\/exec\?shop=1$/.test(
       (await pg.locator('.edlink').nth(1).locator('.u').innerText()).trim()));
  await pg.screenshot({ path: OUT + '/E7c-saved.png', fullPage: true });

  ok('ไม่มี error ตลอดการทดสอบ', jsErr.length === 0, jsErr.join(' | '));
  await b.close();
  console.log(fails ? '\nตก ' + fails + ' ข้อ' : '\nผ่านทั้งหมด');
  process.exit(fails ? 1 : 0);
})();
