/*
 * หน้าลูกค้าในเบราว์เซอร์จริง
 *
 *   node tools/t_pub_ui.js
 *   PV=pub_bundle.html node tools/t_pub_ui.js     สอบไฟล์ที่รวมแล้ว
 *
 * หน้านี้เป็นหน้าเดียวของระบบที่คนนอกบริษัทเห็น และเป็นหน้าที่คนกำลังจะ
 * โอนเงินจริงอ่านอยู่ ตัวเลขผิดหนึ่งตัวคือเงินผิดจำนวนหนึ่งครั้ง
 */
'use strict';
var path = require('path');
var { chromium } = require('/opt/node22/lib/node_modules/playwright');

var PAGE = process.env.PV || 'pub.html';
var FILE = 'file://' + path.join(__dirname, '..', 'out', PAGE);

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

/** เปิดหน้าใหม่ โดยแก้ก้อน PUB ก่อนสคริปต์ของหน้าทำงาน */
async function open(browser, tweak) {
  var p = await browser.newPage({ viewport: { width: 390, height: 900 } });
  var errs = [];
  p.on('pageerror', function (e) { errs.push(e.message) });
  if (tweak) {
    await p.addInitScript(function (src) {
      window.__TWEAK = src;
      /* ดักตัวแปร PUB ตอนที่หน้ากำหนดค่าให้มัน แล้วแก้ก่อนสคริปต์ที่เหลือจะอ่าน
         วิธีนี้สอบได้ทุกทางโดยไม่ต้องมีไฟล์ preview คนละใบต่อหนึ่งกรณี */
      Object.defineProperty(window, 'PUB', {
        configurable: true,
        set: function (v) {
          var f = new Function('d', window.__TWEAK);
          f(v);
          Object.defineProperty(window, 'PUB', { value: v, writable: true, configurable: true });
        },
        get: function () { return undefined; }
      });
    }, tweak);
  }
  await p.goto(FILE);
  await p.waitForTimeout(250);
  p.__errs = errs;
  return p;
}

(async function () {
  var b = await chromium.launch();

  /* ------------------------------------------------------------------ */
  console.log('\n1. หน้าปกติ — ลูกค้าเห็นยอดกับบัญชีที่ต้องโอน');
  var p1 = await open(b, null);
  var v1 = await p1.evaluate(function () {
    var t = function (s) { var e = document.querySelector(s); return e ? e.textContent.trim() : null };
    return {
      shop: t('.shop b'),
      no: t('.card .no'),
      items: document.querySelectorAll('.it').length,
      net: t('.sum.big .v'),
      bank: t('.bank .b'),
      acct: t('#acct-no'),
      hasSend: !!document.getElementById('send'),
      steps: document.querySelectorAll('.step').length,
      body: document.body.textContent
    };
  });
  eq('ชื่อร้านขึ้นหัวหน้า', v1.shop, 'บริษัท ทดสอบ เคมีคอล จำกัด');
  truthy('เห็นเลขออเดอร์', v1.no.indexOf('AST-26-0042') > -1);
  eq('รายการสินค้าครบหกบรรทัด', v1.items, 6);
  eq('ยอดรวมตรงกับที่ฝั่งชีทส่งมา', v1.net, '1,970.65 บาท');
  eq('บอกธนาคาร', v1.bank, 'ไทยพาณิชย์ (SCB)');
  eq('บอกเลขบัญชี', v1.acct, '431-039435-5');
  truthy('มีปุ่มแจ้งชำระเงิน', v1.hasSend);
  eq('แถบสถานะสามขั้น', v1.steps, 3);

  console.log('\n   ของที่ต้องไม่โผล่บนหน้าลูกค้าเลย');
  truthy('ไม่มีคำว่าต้นทุน', v1.body.indexOf('ต้นทุน') < 0);
  truthy('ไม่มีคำว่ากำไร', v1.body.indexOf('กำไร') < 0);
  var src1 = await p1.content();
  /* หน้านี้ต้องไม่ใช่หลังร้านที่ซ่อนปุ่มไว้ — ถ้าโค้ดหลังร้านติดมาในไฟล์
     ต่อให้ไม่มีปุ่มให้กด ก็อ่านได้หมดจาก View Source */
  truthy('ไม่มีโค้ดหน้าคีย์ออเดอร์ติดมาในไฟล์', src1.indexOf('createOrder') < 0);
  truthy('ไม่มีรายชื่อลูกค้าอื่นติดมา', src1.indexOf('getCustomers') < 0);
  eq('ไม่มี javascript error', p1.__errs, []);

  /* ------------------------------------------------------------------ */
  console.log('\n2. กดคัดลอกเลขบัญชี — ต้องได้ตัวเลขล้วน ไม่ติดขีด');
  var p2 = await open(b, null);
  await p2.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await p2.click('#copy');
  await p2.waitForTimeout(150);
  var v2 = await p2.evaluate(function () {
    return {
      label: document.getElementById('copy').textContent.trim(),
      clip: navigator.clipboard ? null : 'no-clipboard'
    };
  });
  eq('ปุ่มบอกว่าคัดลอกแล้ว ไม่ใช่กดแล้วเงียบ', v2.label, 'คัดลอกแล้ว');
  var clip = await p2.evaluate(function () { return navigator.clipboard.readText() });
  eq('สิ่งที่คัดลอกคือตัวเลขล้วน วางในแอปธนาคารได้เลย', clip, '4310394355');

  /* ------------------------------------------------------------------ */
  console.log('\n3. แนบสลิปแล้วกดแจ้งชำระเงิน');
  var p3 = await open(b, null);
  await p3.setInputFiles('#f', {
    name: 'slip.png', mimeType: 'image/png',
    buffer: Buffer.from('89504e470d0a1a0a', 'hex')
  });
  await p3.click('#send');
  await p3.waitForTimeout(400);
  var v3 = await p3.evaluate(function () {
    return {
      sent: window.PUB_SENT.length,
      key: window.PUB_SENT[0] && window.PUB_SENT[0].key,
      amount: window.PUB_SENT[0] && window.PUB_SENT[0].amount,
      paidAt: window.PUB_SENT[0] && window.PUB_SENT[0].paidAt,
      say: document.getElementById('say').textContent,
      cls: document.getElementById('say').className,
      btn: document.getElementById('send').textContent,
      dot: document.querySelector('#st-told .dot').className,
      at: document.getElementById('told-at').textContent
    };
  });
  eq('ส่งขึ้นชีทครั้งเดียว', v3.sent, 1);
  eq('ส่งกุญแจของลิงก์นี้ไปด้วย', v3.key, '0123456789abcdef0123456789abcdef');
  eq('ยอดที่ส่งเท่ากับยอดที่ต้องชำระ', v3.amount, 1970.65);
  truthy('มีวันที่โอนติดไปด้วย', /^\d{4}-\d{2}-\d{2}$/.test(v3.paidAt));
  truthy('บอกลูกค้าว่าได้รับแล้ว', v3.say.indexOf('ได้รับสลิปแล้ว') > -1);
  eq('เป็นข้อความแบบสำเร็จ', v3.cls, 'say ok');
  truthy('ปุ่มเปลี่ยนเป็นแจ้งแล้ว กันกดซ้ำ', v3.btn.indexOf('แจ้งแล้ว') > -1);
  truthy('แถบสถานะขยับเป็นรอตรวจ', v3.dot.indexOf('wait') > -1);
  truthy('และบอกว่าเพิ่งแจ้งไป', v3.at.indexOf('เมื่อครู่') > -1);
  eq('ไม่มี javascript error', p3.__errs, []);

  console.log('\n   ยังไม่เลือกไฟล์แล้วกดส่ง ต้องเตือน ไม่ใช่ส่งของว่างขึ้นไป');
  var p3b = await open(b, null);
  await p3b.click('#send');
  await p3b.waitForTimeout(200);
  var v3b = await p3b.evaluate(function () {
    return { sent: window.PUB_SENT.length, say: document.getElementById('say').textContent };
  });
  eq('ไม่ได้ยิงขึ้นชีทเลย', v3b.sent, 0);
  truthy('บอกว่ายังไม่ได้เลือกรูป', v3b.say.indexOf('ยังไม่ได้เลือก') > -1);

  console.log('\n   ส่งไม่สำเร็จ ต้องกดใหม่ได้ทันที');
  var p3c = await open(b, null);
  await p3c.evaluate(function () { window.PUB_FAIL = 'เน็ตหลุดระหว่างส่ง'; });
  await p3c.setInputFiles('#f', {
    name: 'slip.png', mimeType: 'image/png', buffer: Buffer.from('89504e47', 'hex')
  });
  await p3c.click('#send');
  await p3c.waitForTimeout(400);
  var v3c = await p3c.evaluate(function () {
    return {
      dis: document.getElementById('send').disabled,
      btn: document.getElementById('send').textContent,
      say: document.getElementById('say').textContent
    };
  });
  /* ลูกค้าที่โอนเงินไปแล้วแต่แจ้งไม่สำเร็จ คือคนที่กำลังกังวลว่าเงินหายไปไหน
     ปุ่มที่ค้างเป็น "กำลังส่ง…" ตลอดไปคือการทิ้งเขาไว้ตรงนั้น */
  eq('ปุ่มกลับมากดได้', v3c.dis, false);
  eq('และกลับเป็นข้อความเดิม', v3c.btn, 'แจ้งชำระเงิน');
  truthy('บอกเหตุผลที่ส่งไม่ผ่าน', v3c.say.indexOf('เน็ตหลุด') > -1);

  /* ------------------------------------------------------------------ */
  console.log('\n4. ลิงก์ผิดหรือถูกปิด — ต้องเป็นหน้าไทยที่บอกว่าให้ทำอะไรต่อ');
  var p4 = await open(b, "d.err='ลิงก์นี้ถูกปิดไปแล้ว — รบกวนทักร้านขอลิงก์ใหม่นะคะ'; d.data=null;");
  var v4 = await p4.evaluate(function () {
    return {
      body: document.body.textContent,
      shop: !!document.querySelector('.shop b'),
      send: !!document.getElementById('send'),
      acct: !!document.getElementById('acct-no')
    };
  });
  truthy('ยังมีหัวร้าน ลูกค้าจะได้รู้ว่าไม่ได้กดลิงก์ปลอม', v4.shop);
  truthy('บอกเหตุผลเป็นภาษาไทย', v4.body.indexOf('ถูกปิดไปแล้ว') > -1);
  eq('ไม่มีฟอร์มให้แนบสลิป', v4.send, false);
  eq('และไม่มีเลขบัญชีให้โอน', v4.acct, false);
  eq('ไม่มี javascript error', p4.__errs, []);

  /* ------------------------------------------------------------------ */
  console.log('\n5. ออเดอร์ที่ยกเลิกแล้ว — ห้ามมีทางให้จ่ายเงิน');
  var p5 = await open(b, 'd.data.dead=true;');
  var v5 = await p5.evaluate(function () {
    return {
      body: document.body.textContent,
      send: !!document.getElementById('send'),
      acct: !!document.getElementById('acct-no')
    };
  });
  truthy('บอกว่าใบนี้ถูกยกเลิก', v5.body.indexOf('ถูกยกเลิกแล้ว') > -1);
  /* เงินที่โอนเข้ามาหลังใบถูกยกเลิก คือเงินที่ร้านต้องตามคืน */
  eq('ไม่มีปุ่มแจ้งชำระ', v5.send, false);
  eq('ไม่มีเลขบัญชี', v5.acct, false);

  /* ------------------------------------------------------------------ */
  console.log('\n6. ยังไม่ได้กรอกบัญชีในชีท — บอกให้ทักร้าน ไม่ใช่โชว์ช่องว่าง');
  var p6 = await open(b, 'd.data.acct=null;');
  var v6 = await p6.evaluate(function () {
    return {
      body: document.body.textContent,
      acct: !!document.getElementById('acct-no'),
      net: document.querySelector('.sum.big .v').textContent
    };
  });
  truthy('บอกให้ทักร้านขอเลขบัญชี', v6.body.indexOf('ทักร้านขอเลขบัญชี') > -1);
  eq('ไม่มีเลขบัญชีมั่ว ๆ โผล่มา', v6.acct, false);
  eq('แต่ยังเห็นยอดของตัวเอง', v6.net, '1,970.65 บาท');

  /* ------------------------------------------------------------------ */
  console.log('\n7. ข้อความจากลูกค้าต้องไม่กลายเป็นโค้ด');
  /* ชื่อสินค้าในชีทเป็นของที่คนพิมพ์เอง ถ้าเอามาต่อสตริงลงหน้าเว็บดื้อ ๆ
     วันที่มีใครพิมพ์แท็กลงไป หน้าลูกค้าจะรันสิ่งนั้นให้ */
  var p7 = await open(b,
    "d.data.ord.items[0].name='<img src=x onerror=\"window.__X=1\">';" +
    "d.data.ord.cust='<b>ตัวหนา</b>';");
  await p7.waitForTimeout(200);
  var v7 = await p7.evaluate(function () {
    return {
      x: window.__X || 0,
      imgs: document.querySelectorAll('.it img').length,
      bold: document.querySelectorAll('.card .no b').length,
      shown: document.querySelector('.it .nm b').textContent
    };
  });
  eq('สคริปต์ที่แฝงมาไม่ถูกรัน', v7.x, 0);
  eq('ไม่มีรูปแปลกปลอมถูกสร้าง', v7.imgs, 0);
  eq('แท็กในชื่อลูกค้าไม่กลายเป็นตัวหนา', v7.bold, 0);
  truthy('แสดงเป็นตัวหนังสือตามที่พิมพ์มาจริง', v7.shown.indexOf('<img') === 0);

  await b.close();
  console.log(fails ? '\nตก ' + fails + ' ข้อ' : '\nผ่านทั้งหมด');
  process.exit(fails ? 1 : 0);
})();
