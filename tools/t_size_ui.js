/*
 * หน้าจอต้องไม่ล้นออกนอกจอ ไม่ว่าจะย่อ-ขยายตัวอักษรแค่ไหน
 *
 *   python3 tools/make_preview.py && node tools/t_size_ui.js
 *
 * ทำไมต้องมีข้อสอบชุดนี้แยกออกมา
 *
 *   เจ้าของร้านกดปุ่ม ก+ จนสุดเพราะอ่านไม่ถนัด แล้วได้หน้าจอที่ "เล็กลง"
 *   ไม่ใช่ใหญ่ขึ้น — ฟังดูเหมือนปุ่มพัง แต่ที่จริงคือแถวไอคอนเก้าปุ่มท้ายออเดอร์
 *   ขยายตามตัวอักษรจนกว้าง 460px บนจอกว้าง 411px หน้าจึงล้น
 *   เบราว์เซอร์มือถือแก้ปัญหาหน้าล้นด้วยการ "ย่อทั้งหน้า" ลงมาให้พอดีจอ
 *   ผลคือยิ่งสั่งให้ตัวหนังสือใหญ่ ทั้งหน้ายิ่งถูกย่อ ตัวหนังสือจริงบนจอยิ่งเล็ก
 *
 *   ข้อสอบเดิมวัดแต่ว่า "ปุ่มอยู่ไหม กดแล้วทำงานไหม" ซึ่งผ่านหมดทั้งที่ใช้งานจริงไม่ได้
 *   ชุดนี้จึงวัดสิ่งเดียว: กว้างเกินจอหรือยัง และปุ่มยังใหญ่พอให้นิ้วกดไหม
 */
'use strict';
var { chromium } = require('/opt/node22/lib/node_modules/playwright');
var fails = 0;
function ok(label, cond, extra) {
  if (!cond) fails++;
  console.log((cond ? '  ok   ' : '  FAIL ') + label + (cond ? '' : '  ' + (extra || '')));
}

/* จอที่เจอจริง: 360 = มือถือรุ่นเล็ก · 411 = Galaxy ของเจ้าของร้าน · 430 = iPhone Pro Max
   431–560 คือช่วงที่เคยตกร่องระหว่างกฎ CSS สองข้อ จึงต้องมีในรายการ */
var WIDTHS = [360, 390, 411, 430, 460, 520, 560, 640, 900];
/* FS_MIN · FS_DEF · FS_MAX ของปุ่ม ก− ก+ */
var FONTS = [17, 20, 30];
var TABS = ['new', 'list', 'recv', 'quote', 'sum'];
var MIN_TAP = 38;   /* ต่ำกว่านี้นิ้วคนกดพลาด */

(async () => {
  var b = await chromium.launch();

  console.log('\n1. ไม่มีหน้าไหนกว้างเกินจอ ทุกขนาดตัวอักษร ทุกความกว้างจอ');
  var over = [];
  for (var wi = 0; wi < WIDTHS.length; wi++) {
    for (var fi = 0; fi < FONTS.length; fi++) {
      var w = WIDTHS[wi], fs = FONTS[fi];
      var p = await b.newPage({ viewport: { width: w, height: 900 } });
      await p.addInitScript(function (f) {
        try { localStorage.setItem('ast-fs', String(f)) } catch (e) {}
      }, fs);
      await p.goto('file:///home/user/ast-shop/out/preview.html');
      await p.waitForTimeout(700);
      for (var ti = 0; ti < TABS.length; ti++) {
        var btn = await p.$('.tabs button[data-go="' + TABS[ti] + '"]');
        if (!btn) continue;
        await btn.click();
        await p.waitForTimeout(350);
        var r = await p.evaluate(function () {
          var de = document.documentElement;
          if (de.scrollWidth <= de.clientWidth) return null;
          /* บอกให้ด้วยว่าอะไรดันจนล้น ไม่งั้นได้แต่รู้ว่าล้มแต่ไม่รู้ว่าตรงไหน */
          var worst = null;
          document.querySelectorAll('body *').forEach(function (e) {
            var b = e.getBoundingClientRect();
            if (b.width && (!worst || b.right > worst.right))
              worst = { right: Math.round(b.right), cls: String(e.className).slice(0, 40) };
          });
          return { sw: de.scrollWidth, cw: de.clientWidth, worst: worst };
        });
        if (r) over.push('จอ ' + w + ' ตัวอักษร ' + fs + ' หน้า ' + TABS[ti] +
          ' กว้าง ' + r.sw + ' เกินมา ' + (r.sw - r.cw) + 'px (' + (r.worst && r.worst.cls) + ')');
      }
      await p.close();
    }
  }
  ok('ไม่มีหน้าไหนล้นเลย', over.length === 0, '\n     ' + over.join('\n     '));

  console.log('\n2. ปุ่มไอคอนท้ายออเดอร์ต้องใหญ่พอให้นิ้วกด');
  var small = [], sizes = [];
  for (var wj = 0; wj < WIDTHS.length; wj++) {
    for (var fj = 0; fj < FONTS.length; fj++) {
      var w2 = WIDTHS[wj], fs2 = FONTS[fj];
      var p2 = await b.newPage({ viewport: { width: w2, height: 900 } });
      await p2.addInitScript(function (f) {
        try { localStorage.setItem('ast-fs', String(f)) } catch (e) {}
      }, fs2);
      await p2.goto('file:///home/user/ast-shop/out/preview.html');
      await p2.waitForTimeout(700);
      await p2.click('.tabs button[data-go="list"]');
      await p2.waitForTimeout(400);
      var s = await p2.evaluate(function () {
        var sq = document.querySelector('#list .row .sq');
        if (!sq) return null;
        var r = sq.getBoundingClientRect();
        var ic = sq.querySelector('.sqic');
        var ir = ic && ic.getBoundingClientRect();
        return { w: Math.round(r.width), h: Math.round(r.height),
                 icw: ir ? Math.round(ir.width) : 0,
                 fits: !ir || (ir.width <= r.width + 0.5 && ir.height <= r.height + 0.5) };
      });
      if (!s) continue;
      sizes.push(w2 + '/' + fs2 + '=' + s.w + 'x' + s.h);
      if (s.w < MIN_TAP || s.h < MIN_TAP)
        small.push('จอ ' + w2 + ' ตัวอักษร ' + fs2 + ' ได้ปุ่ม ' + s.w + 'x' + s.h);
      if (!s.fits)
        small.push('จอ ' + w2 + ' ตัวอักษร ' + fs2 + ' รูปในปุ่มล้นออกนอกปุ่ม (' + s.icw + ' > ' + s.w + ')');
      await p2.close();
    }
  }
  ok('ปุ่มไม่เล็กกว่า ' + MIN_TAP + 'px และรูปไม่ล้นปุ่ม เลยสักกรณี',
     small.length === 0, '\n     ' + small.join('\n     '));
  console.log('     ขนาดปุ่มที่วัดได้ (จอ/ตัวอักษร=กว้างxสูง):\n     ' + sizes.join('  '));

  console.log('\n3. กด ก+ แล้วต้องได้ตัวหนังสือใหญ่ขึ้นจริงบนจอ ไม่ใช่เล็กลง');
  /* วัดความสูงจริงของบรรทัดชื่อลูกค้า เทียบกับสัดส่วนของจอ
     ถ้าหน้าล้นแล้วถูกย่อ ตัวเลขนี้จะไม่โต ทั้งที่ค่าใน CSS โตขึ้น */
  var pz = await b.newPage({ viewport: { width: 411, height: 900 } });
  await pz.goto('file:///home/user/ast-shop/out/preview.html');
  await pz.waitForTimeout(800);
  await pz.click('.tabs button[data-go="list"]');
  await pz.waitForTimeout(400);
  var grow = await pz.evaluate(async function () {
    function nameH() {
      var el = document.querySelector('#list .row .i b');
      return el ? el.getBoundingClientRect().height : 0;
    }
    var out = [];
    for (var i = 0; i < 3; i++) {
      var fs = [17, 20, 30][i];
      fsApply(fs);
      await new Promise(function (r) { setTimeout(r, 120) });
      out.push({ fs: fs, h: Math.round(nameH()),
                 over: document.documentElement.scrollWidth - document.documentElement.clientWidth });
    }
    return out;
  });
  await pz.close();
  ok('ย่อสุด → ปกติ → ขยายสุด แล้วบรรทัดชื่อสูงขึ้นทุกขั้น',
     grow[0].h < grow[1].h && grow[1].h < grow[2].h,
     JSON.stringify(grow));
  ok('และไม่มีขั้นไหนทำให้หน้าล้น',
     grow.every(function (g) { return g.over <= 0 }), JSON.stringify(grow));
  console.log('     ความสูงบรรทัดชื่อ: ' +
    grow.map(function (g) { return g.fs + '→' + g.h + 'px' }).join('  ·  '));

  await b.close();
  console.log(fails ? '\nไม่ผ่าน ' + fails + ' ข้อ' : '\nผ่านทั้งหมด');
  process.exit(fails ? 1 : 0);
})();
