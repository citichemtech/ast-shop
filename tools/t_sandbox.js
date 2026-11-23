/*
 * เอาไฟล์ออกจากแอปได้จริง ทั้งที่แอปถูกขังอยู่ใน iframe ของ Apps Script
 *
 *   python3 tools/make_preview.py && node tools/t_sandbox.js
 *
 * ทำไมต้องมีข้อสอบชุดนี้แยกออกมา
 *
 *   6 พ.ย. 69 เจ้าของร้านแจ้งว่า "กดแชร์หรือส่งอะไรไม่ได้เลย" — กดปุ่มบันทึก
 *   กดปุ่มแชร์ แล้วไม่มีอะไรเกิดขึ้น ไม่มีไฟล์ ไม่มีข้อความ ไม่มี error
 *   ข้อสอบทุกชุดที่มีอยู่ตอนนั้นผ่านหมด เพราะทุกชุดเปิด out/preview.html ตรง ๆ
 *   ซึ่งเป็นหน้าบนสุด ไม่ได้อยู่ในกรอบอะไรเลย
 *
 *   ของจริงไม่ใช่แบบนั้น Apps Script เอาหน้าเว็บของเราไปใส่ iframe ที่ sandbox
 *   ไม่มี allow-downloads อยู่ในลิสต์ พอสั่งดาวน์โหลด เบราว์เซอร์จะทิ้งคำสั่ง
 *   ทิ้งไปเงียบ ๆ ไม่แจ้งอะไรกลับมาให้โค้ดรู้ด้วยซ้ำ เหมือนปุ่มเสีย
 *   navigator.share ก็ถูกปิดด้วยเหตุผลเดียวกัน (web-share ให้เฉพาะหน้าบนสุด)
 *
 *   ชุดนี้จึงเอา out/preview.html ไปใส่ใน iframe ที่มี sandbox ชุดเดียวกับของจริง
 *   แล้ววัดสองเรื่อง
 *     ข้อ 1  กรอบนี้กันดาวน์โหลดจริง (ถ้าข้อนี้ผ่านง่าย ๆ แปลว่าจำลองผิด
 *            ทั้งชุดก็เชื่อไม่ได้ ต้องมีไว้เป็นหลักฐานว่ากรอบยังบีบอยู่)
 *     ข้อ 2  แต่ปุ่มของเรายังเอาไฟล์ออกมาได้ เพราะเปิดหน้าต่างใหม่ก่อน
 *            (sandbox มี allow-popups-to-escape-sandbox หน้าต่างใหม่จึงหลุดกรอบ)
 */
'use strict';
var { chromium } = require('/opt/node22/lib/node_modules/playwright');
var fs = require('fs');
var path = require('path');

var fails = 0;
function ok(label, cond, extra) {
  if (!cond) fails++;
  console.log((cond ? '  ok   ' : '  FAIL ') + label + (cond ? '' : '  ' + (extra || '')));
}
function eq(label, got, want) {
  ok(label + '  ได้ ' + JSON.stringify(got), got === want, 'ควรเป็น ' + JSON.stringify(want));
}

var ROOT = path.dirname(__dirname);
var OUT = path.join(ROOT, 'out');

/* sandbox ชุดเดียวกับที่ Apps Script ครอบหน้าเว็บของเราไว้ (โหมด IFRAME)
   จุดสำคัญคือ "ไม่มี" allow-downloads และ "มี" allow-popups-to-escape-sandbox */
var SANDBOX = [
  'allow-forms', 'allow-modals', 'allow-orientation-lock', 'allow-pointer-lock',
  'allow-popups', 'allow-popups-to-escape-sandbox', 'allow-presentation',
  'allow-same-origin', 'allow-scripts', 'allow-top-navigation-by-user-activation'
].join(' ');

(async () => {
  if (!fs.existsSync(path.join(OUT, 'preview.html'))) {
    console.log('ไม่พบ out/preview.html — สั่ง python3 tools/make_preview.py ก่อน');
    process.exit(1);
  }
  /* หน้าห่อ วางไว้ข้าง preview.html จะได้อ้าง src แบบสั้น ๆ และอยู่โดเมนเดียวกัน */
  var wrap = path.join(OUT, 'sandboxed.html');
  fs.writeFileSync(wrap,
    '<!DOCTYPE html><html lang="th"><head><meta charset="utf-8">'
    + '<title>จำลองกรอบของ Apps Script</title>'
    + '<style>html,body{margin:0;height:100%}iframe{border:0;width:100%;height:100%}</style>'
    + '</head><body><iframe id="userHtmlFrame" sandbox="' + SANDBOX + '"'
    + ' src="preview.html"></iframe></body></html>', 'utf-8');

  var browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--no-sandbox']
  });
  var ctx = await browser.newContext({
    viewport: { width: 390, height: 820 }, acceptDownloads: true
  });

  /* ไฟล์ที่ลงเครื่อง ไม่ว่าจะมาจากหน้าไหนในหน้าต่างไหน */
  var got = [];
  function watch(pg) { pg.on('download', function (d) { got.push(d.suggestedFilename()) }) }
  ctx.on('page', watch);

  var page = await ctx.newPage();
  watch(page);
  await page.goto('file://' + wrap);
  var app = page.frameLocator('#userHtmlFrame');
  await app.locator('.tabs').waitFor({ timeout: 30000 });

  console.log('\n1. กรอบนี้กันดาวน์โหลดจริง — ถ้าข้อนี้ไม่ผ่าน แปลว่าจำลองผิด');
  /* ยิงดาวน์โหลดตรง ๆ จากในกรอบ แบบที่โค้ดเดิมทำ แล้วต้องไม่มีไฟล์ลงมา */
  got = [];
  await app.locator('body').evaluate(function () {
    var b = new Blob(['x'], { type: 'image/jpeg' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(b);
    a.download = 'ทางตรง.jpg';
    document.body.appendChild(a); a.click(); a.remove();
  });
  await page.waitForTimeout(2500);
  eq('สั่งดาวน์โหลดตรง ๆ ในกรอบแล้วเงียบ ไม่มีไฟล์ลงมา', got.length, 0);

  console.log('\n2. แต่ปุ่มบันทึกสำเนาในแฟ้มเอกสาร ยังเอาไฟล์ออกมาได้');
  /* ออกใบให้มีของในแฟ้มก่อน — ใช้ทางเดียวกับที่คนใช้จริง */
  await app.locator('.tabs button[data-go="list"]').click();
  await page.waitForTimeout(800);
  var made = await app.locator('body').evaluate(async function () {
    var o = (window.ORDERS || [])[0];
    if (!o) return { ok: false, why: 'ไม่มีออเดอร์ในข้อมูลจำลอง' };
    openDoc(o, 'rec');
    await new Promise(function (r) { setTimeout(r, 500) });
    document.querySelector('#dc-make').click();
    await new Promise(function (r) { setTimeout(r, 1800) });
    closeModal();
    await new Promise(function (r) { setTimeout(r, 300) });
    return { ok: true };
  });
  ok('ออกใบไว้หนึ่งใบสำหรับทดสอบ', made.ok, JSON.stringify(made));

  await app.locator('.tabs button[data-go="sum"]').click();
  await page.waitForTimeout(400);
  await app.locator('.tabs button[data-go="list"]').click();
  await page.waitForTimeout(600);

  var row = await app.locator('body').evaluate(async function () {
    go('file');
    await new Promise(function (r) { setTimeout(r, 900) });
    var f = document.querySelector('#fl-docs [data-fk]');
    if (!f) return { ok: false, why: 'ไม่เจอแฟ้มเอกสาร' };
    f.click();
    await new Promise(function (r) { setTimeout(r, 900) });
    var b = document.querySelector('#fl-docs [data-dl]');
    if (!b) return { ok: false, why: 'ไม่เจอปุ่มบันทึกสำเนา' };
    return { ok: true, no: document.querySelector('#fl-docs .row .i b').textContent.trim() };
  });
  ok('เปิดแฟ้มแล้วเจอปุ่มบันทึกสำเนา', row.ok, JSON.stringify(row));

  if (row.ok) {
    got = [];
    var tabWait = ctx.waitForEvent('page', { timeout: 25000 });
    await app.locator('#fl-docs [data-dl]').first().click();
    var tab = await tabWait;
    ok('กดแล้วมีแท็บใหม่เปิดออกมา (ทางหลุดออกจากกรอบ)', !!tab);

    /* รอไฟล์ — ลงมาจากแท็บใหม่ ไม่ใช่จากในกรอบ */
    for (var i = 0; i < 60 && !got.length; i++) await page.waitForTimeout(500);
    eq('และได้ไฟล์ลงเครื่องจริง ทั้งที่กรอบกันดาวน์โหลดอยู่', got.length, 1);
    eq('ชื่อไฟล์ถูกต้อง', got[0] || '', row.no + '-copy.jpg');

    var ui = await tab.evaluate(function () {
      return { save: !!document.getElementById('b-save'),
               share: !!document.getElementById('b-share'),
               print: !!document.getElementById('b-print') };
    });
    ok('แท็บนั้นมีปุ่มบันทึก แชร์ และสั่งพิมพ์ ครบทั้งสามอย่างที่ในกรอบทำไม่ได้',
       ui.save && ui.share && ui.print, JSON.stringify(ui));
    await tab.close();
  }

  console.log('\n3. กดแชร์ใบปะหน้า ตอนที่เบราว์เซอร์บอกว่าแชร์ได้แต่พอเรียกจริงกลับปฏิเสธ');
  /* 23 พ.ย. 69 เจ้าของร้านแจ้งว่า "แชร์ใบปะหน้าไม่ได้" ทั้งที่เพิ่งลงรุ่นที่แก้
     เรื่องนี้ไปแล้ว — สาเหตุอยู่ในโค้ดที่ผมเขียนเอง

     navigator.canShare ตอบว่า "ได้" เพราะมันดูแค่ว่าเบราว์เซอร์แชร์ไฟล์เป็นไหม
     ไม่ได้ดูว่าหน้านี้มีสิทธิ์หรือเปล่า · ตัวที่ปฏิเสธจริงคือ share() ตอนถูกเรียก
     (ในกรอบ iframe ของ Apps Script สิทธิ์ web-share ถูกปิดอยู่)

     ของเดิมปิดหน้าต่างที่เปิดเตรียมไว้ทิ้ง "ก่อน" จะเรียก share() พอถูกปฏิเสธ
     ก็ไม่เหลืออะไรให้ถอยไปใช้ กดปุ่มแล้วไม่มีอะไรเกิดขึ้นเลย
     ข้อนี้จำลองอาการนั้นเป๊ะ ๆ แล้ววัดว่ายังมีทางเอาไฟล์ออกอยู่ไหม */
  var tabBefore = ctx.pages().length;
  var shared = await app.locator('body').evaluate(async function () {
    /* เบราว์เซอร์ที่บอกว่าแชร์ได้ แต่ปฏิเสธตอนเรียกจริง */
    var tried = 0;
    navigator.canShare = function () { return true };
    navigator.share = function () {
      tried++;
      var err = new Error('Permission denied');
      err.name = 'NotAllowedError';
      return Promise.reject(err);
    };
    /* เปิดใบปะหน้าของออเดอร์ใบแรก */
    var o = (window.ORDERS || [])[0];
    if (!o) return { ok: false, why: 'ไม่มีออเดอร์ในข้อมูลจำลอง' };
    openLabel(o);
    await new Promise(function (r) { setTimeout(r, 700) });
    if (!document.querySelector('#lb-make')) return { ok: false, why: 'ไม่เจอปุ่มสร้างใบปะหน้า' };
    document.querySelector('#lb-make').click();
    await new Promise(function (r) { setTimeout(r, 2500) });
    if (!document.querySelector('#lb-share')) return { ok: false, why: 'ไม่เจอปุ่มแชร์' };
    document.querySelector('#lb-share').click();
    await new Promise(function (r) { setTimeout(r, 2500) });
    return { ok: true, tried: tried,
             said: ((document.querySelector('#toast') || {}).textContent || '') };
  });
  ok('เปิดใบปะหน้าแล้วกดแชร์ได้', shared.ok, JSON.stringify(shared));

  if (shared.ok) {
    eq('เรียกแชร์ตรงไปหนึ่งครั้ง (ยังพยายามทางที่ดีที่สุดก่อนเสมอ)', shared.tried, 1);
    var tabAfter = ctx.pages().length;
    ok('ถูกปฏิเสธแล้วยังเหลือแท็บไฟล์ให้ใช้ ไม่ใช่กดแล้วเงียบ',
       tabAfter > tabBefore, 'แท็บก่อน ' + tabBefore + ' หลัง ' + tabAfter);
    /* ต้องดูคำที่บอกว่า "สำเร็จแล้วไปทำต่อที่นั่น" ไม่ใช่แค่คำว่าแท็บ
       เพราะข้อความตอนล้มเหลว ("เบราว์เซอร์บล็อกแท็บใหม่") ก็มีคำว่าแท็บเหมือนกัน */
    ok('และบอกว่าไปกดแชร์ต่อที่แท็บนั้น',
       shared.said.indexOf('กดแชร์หรือสั่งพิมพ์ในแท็บนั้น') > -1,
       JSON.stringify(shared.said));

    var tab2 = ctx.pages()[ctx.pages().length - 1];
    var ui2 = await tab2.evaluate(function () {
      return { share: !!document.getElementById('b-share'),
               save: !!document.getElementById('b-save'),
               img: !!document.querySelector('img#v') };
    });
    ok('แท็บนั้นมีปุ่มแชร์ของตัวเอง ซึ่งอยู่นอกกรอบแล้วจึงแชร์ได้จริง',
       ui2.share && ui2.save && ui2.img, JSON.stringify(ui2));
    await tab2.close();
  }

  await browser.close();
  try { fs.unlinkSync(wrap) } catch (e) {}
  console.log(fails ? '\nไม่ผ่าน ' + fails + ' ข้อ' : '\nผ่านทั้งหมด');
  process.exit(fails ? 1 : 0);
})();
