/*
 * ด่านเข้าใช้ระบบ — ไล่อ่านโค้ดเองว่าไม่มีฟังก์ชันไหนหลุดด่าน
 *
 *   node tools/t_guard.js
 *   BUNDLE=1 node tools/t_guard.js     สอบไฟล์ที่รวมแล้ว
 *
 * ทำไมต้องมีข้อสอบที่อ่านซอร์สโค้ดเอง แทนที่จะเรียกฟังก์ชันมาทดสอบทีละตัว
 *
 * ทุกฟังก์ชันที่ชื่อไม่ลงท้ายด้วยขีดล่าง หน้าเว็บเรียกได้หมดด้วย
 * google.script.run — รวมถึงคนที่เปิด F12 แล้วพิมพ์เอง ไม่ใช่แค่ปุ่มที่เราวางไว้
 * และคำสั่งนั้นรันด้วยสิทธิ์ของฝั่งเซิร์ฟเวอร์ ไม่ใช่สิทธิ์ของคนกด
 *
 * ตราบใดที่แอปเปิดให้เฉพาะคนในบริษัท ความเสี่ยงยังจำกัด แต่พอเปิดลิงก์
 * ให้ลูกค้าเข้ามาได้ ทุกฟังก์ชันที่ไม่มีด่านคือประตูที่เปิดค้างไว้
 * `getCustomers()` บรรทัดเดียวคือรายชื่อลูกค้าทั้งร้าน
 *
 * ข้อสอบที่เรียกฟังก์ชันทีละตัวจะคุมได้แค่ตัวที่นึกออกวันนี้
 * ตัวที่เขียนเพิ่มพรุ่งนี้จะไม่มีใครคุม — ตัวนี้จึงอ่านไฟล์ทั้งโฟลเดอร์
 * แล้วบังคับว่าทุกชื่อที่โผล่มาใหม่ ต้องมีด่าน หรือมีชื่อในรายการยกเว้น
 * พร้อมเหตุผลที่เขียนไว้ตรงนี้ ไม่มีทางที่สามคือ "ลืม"
 */
'use strict';
var fs = require('fs');
var path = require('path');

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

/* ---------------------------------------------------------------------------
   รายการยกเว้น — ทุกบรรทัดต้องมีเหตุผลว่าทำไมปล่อยให้คนนอกเรียกได้
   เพิ่มชื่อเข้ามาที่นี่ = ยอมรับว่าคนที่ไม่รู้จักเรียกฟังก์ชันนี้ได้จริง
--------------------------------------------------------------------------- */
var ALLOW = {
  doGet: 'ทางเข้าหน้าเว็บ ตัวมันเองเป็นคนตัดสินว่าจะเสิร์ฟหน้าไหนให้ใคร',

  /* คิดเลขล้วน ไม่แตะชีท ไม่แตะไดรฟ์ ไม่รู้จักออเดอร์ใบไหนทั้งนั้น
     ส่งอาร์เรย์เข้าไปแล้วได้อาร์เรย์กลับมา รู้ผลก็ไม่ได้อะไรไปมากกว่าที่ส่งเข้าไปเอง */
  fefoSort: 'เรียงล็อตที่ผู้เรียกส่งมาเอง ไม่ได้อ่านอะไรจากชีท',
  fefoPick: 'คำนวณว่าจะตัดล็อตไหนจากรายการที่ส่งมาเอง',
  fefoExpired: 'ดูว่าล็อตที่ส่งมาหมดอายุหรือยัง',
  todayMs: 'บอกเวลาเที่ยงคืนของวันนี้',

  /* ตัวช่วยคนที่เข้าระบบไม่ได้ ต้องเรียกได้ตอนที่ยังไม่ผ่านด่าน
     ไม่งั้นคนที่ติดปัญหาจะไม่มีทางรู้เลยว่าต้องแชร์ชีทให้อีเมลไหน
     แต่ข้างในกันคนที่ไม่ได้ล็อกอินไว้แล้ว (ดูข้อสอบท้ายไฟล์) */
  whoAmI: 'บอกว่าใครกำลังเรียก มีไว้ให้คนที่เข้าไม่ได้ใช้ ไม่บอกอะไรถ้าไม่ได้ล็อกอิน',

  /* สองตัวนี้คือทางเข้าของลูกค้า ซึ่ง "ไม่มีด่าน" คือเรื่องที่ตั้งใจ
     ด่านของมันคือกุญแจในลิงก์ ไม่ใช่บัญชีผู้ใช้ — มีข้อสอบคุมแยกใน t_pub.js
     ว่ากุญแจผิดต้องไม่ผ่าน และผ่านแล้วต้องเห็นได้แค่ออเดอร์ใบของกุญแจนั้น */
  pubOrder: 'ลูกค้าเปิดลิงก์ดูยอด — ตรวจด้วยกุญแจ 128 บิตแทนบัญชีผู้ใช้',
  pubSlip: 'ลูกค้าแนบสลิป — ตรวจด้วยกุญแจ และเขียนได้แค่สลิปของใบนั้นใบเดียว',

  /* ไฟล์3 ยืนลำพัง ทำงานด้วยทริกเกอร์รายวันในเวลาที่ไม่มีใครล็อกอิน
     ใส่ด่านแล้วของสำรองจะหยุดเงียบ ๆ ซึ่งอันตรายกว่ามีคนสั่งสำรองเกินโควตา */
  backupNow: 'ทริกเกอร์รายวันเรียกเองตอนไม่มีใครล็อกอิน'
};

/* ฟังก์ชันที่ใช้ด่านคนละตัวเพราะอยู่คนละไฟล์ที่ไม่ผูกกับ Sheets.gs */
var SOFT = { setupBackup: 1, stopBackup: 1, backupStatus: 1 };

var dir = process.env.BUNDLE
  ? path.join(__dirname, '..', 'out', 'bundle')
  : path.join(__dirname, '..', 'apps-script');
var files = process.env.BUNDLE
  ? ['Code.gs', 'Backup.gs']
  : ['Sheets.gs', 'Fefo.gs', 'Doc.gs', 'Setup.gs', 'Api.gs', 'Acct.gs', 'Pay.gs',
     'Pub.gs', 'Import.gs', 'Backup.gs'];

/** ตัดตัวฟังก์ชันออกมาจากไฟล์ โดยนับจาก function ตัวหนึ่งถึง function ตัวถัดไป
    (ทุกไฟล์ในโปรเจกต์นี้เขียนฟังก์ชันชิดขอบซ้ายหมด ไม่มีฟังก์ชันซ้อนระดับบนสุด) */
function scan(src, file) {
  var out = [];
  /* ต้องจับฟังก์ชันส่วนตัว (ลงท้ายขีดล่าง) มาด้วย ไม่ใช่จับแต่ตัวที่เรียกได้
     ไม่งั้น "ตัวฟังก์ชัน" ของตัวที่เรียกได้จะยาวคลุมฟังก์ชันส่วนตัวที่อยู่ถัดไป
     แล้วถ้าตัวส่วนตัวนั้นมี requireStaff_ อยู่ ตัวที่ไม่มีด่านจะสอบผ่านหน้าตาเฉย */
  var re = /^function ([A-Za-z][A-Za-z0-9_]*)\s*\(([^)]*)\)\s*\{/gm;
  var m, prev = null;
  while ((m = re.exec(src))) {
    if (prev) prev.body = src.slice(prev.at, m.index);
    prev = { file: file, name: m[1], at: m.index + m[0].length, args: m[2] };
    out.push(prev);
  }
  if (prev) prev.body = src.slice(prev.at);
  /* ตัดคำอธิบายทิ้งก่อนตรวจ สองเหตุผล
     1. requireStaff_ ที่เขียนอยู่ในคอมเมนต์ ไม่ใช่ด่าน แต่หน้าตาเหมือนด่านทุกอย่าง
     2. ในไฟล์ที่รวมแล้ว ตัวฟังก์ชันสุดท้ายของแต่ละไฟล์จะยาวคลุมหัวข้อของไฟล์ถัดไป
        ซึ่งพูดถึง SpreadsheetApp ในคอมเมนต์ จนตัวที่คิดเลขล้วนดูเหมือนแตะชีท */
  out.forEach(function (fn) {
    fn.body = String(fn.body || '')
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/^[ \t]*\/\/.*$/gm, ' ');
  });
  return out;
}

var all = [];
files.forEach(function (f) {
  var p = path.join(dir, f);
  if (!fs.existsSync(p)) return;
  all = all.concat(scan(fs.readFileSync(p, 'utf8'), f));
});
var open = all.filter(function (fn) { return fn.name.slice(-1) !== '_'; });

console.log('\n1. ทุกฟังก์ชันที่หน้าเว็บเรียกได้ ต้องมีด่านหรือมีเหตุผลที่ยกเว้น');
truthy('อ่านไฟล์เจอฟังก์ชันจริง ไม่ใช่ regex ไม่แมตช์แล้วผ่านฟรี', all.length > 200);
truthy('มีฟังก์ชันที่หน้าเว็บเรียกได้อยู่จำนวนหนึ่ง', open.length > 40);

var naked = open.filter(function (fn) {
  if (ALLOW[fn.name]) return false;
  if (SOFT[fn.name]) return fn.body.indexOf('backupStaff_()') < 0;
  return fn.body.indexOf('requireStaff_()') < 0;
}).map(function (fn) { return fn.file + ':' + fn.name; });
eq('ไม่มีฟังก์ชันไหนหลุดด่าน', naked, []);

console.log('\n   รายการยกเว้นต้องเป็นของจริง ไม่ใช่ชื่อค้างจากโค้ดที่ลบไปแล้ว');
var names = {};
open.forEach(function (fn) { names[fn.name] = 1; });
eq('ทุกชื่อในรายการยกเว้นยังมีอยู่ในโค้ดจริง',
  Object.keys(ALLOW).concat(Object.keys(SOFT)).filter(function (n) { return !names[n]; }), []);
/* ยกเว้นไว้เยอะ ๆ แล้วผ่านหมด คือข้อสอบที่ไม่ได้สอบอะไรเลย */
truthy('รายการยกเว้นสั้นกว่าหนึ่งในห้าของทั้งหมด',
  Object.keys(ALLOW).length * 5 < open.length);

console.log('\n   ฟังก์ชันที่ยกเว้นเพราะ "คิดเลขล้วน" ต้องคิดเลขล้วนจริง');
['fefoSort', 'fefoPick', 'fefoExpired', 'todayMs'].forEach(function (n) {
  var fn = open.filter(function (x) { return x.name === n; })[0];
  truthy(n + ' ไม่แตะชีท ไดรฟ์ หรือคุณสมบัติสคริปต์',
    !!fn && !/SpreadsheetApp|DriveApp|PropertiesService|readAll_|sheet_\(/.test(fn.body));
});

/* ------------------------------------------------------------------------ */
console.log('\n2. ด่านต้องปิดตายเมื่อระบบไม่รู้ว่าใครเรียก');
var FS = require('./fakesheet');

/* คนนอกที่เปิดลิงก์ของลูกค้าเข้ามา = ไม่มีอีเมล ไม่ใช่ "อีเมลที่ยังไม่รู้"
   ตรงนี้คือกรณีที่ห้ามผ่านเด็ดขาด และเป็นกรณีเดียวที่เกิดขึ้นจริงกับคนนอก */
var fx = FS.build();
var ctx = FS.load(fx, {});
ctx.setup();
var ghost = FS.load(fx, { email: '' });

function denied(name, fn) {
  var msg = null;
  try { fn(); } catch (e) { msg = e.message; }
  var ok = msg !== null;
  if (!ok) fails++;
  console.log((ok ? '  ok   ' : '  FAIL ') + name + ' ปฏิเสธคนที่ระบบไม่รู้ว่าเป็นใคร' +
    (ok ? '' : '  — ผ่านเข้าไปได้!'));
}
denied('getOrders', function () { ghost.getOrders(0); });
denied('getCustomers', function () { ghost.getCustomers(); });
denied('searchOrders', function () { ghost.searchOrders('กรุงเทพ'); });
denied('getCustomerHistory', function () { ghost.getCustomerHistory('คุณทดสอบ'); });
denied('getDayReport', function () { ghost.getDayReport('2026-09-13'); });
denied('listDocs', function () { ghost.listDocs(); });
denied('clearOldOrders', function () { ghost.clearOldOrders('ล้างออเดอร์เก่า'); });
denied('clearDemoRows', function () { ghost.clearDemoRows(); });
denied('setup', function () { ghost.setup(); });
denied('authDrive', function () { ghost.authDrive(); });
denied('exportSlips', function () { ghost.exportSlips(''); });
denied('slipsWaiting', function () { ghost.slipsWaiting(); });

console.log('\n   whoAmI ตอบได้ แต่ต้องไม่หลุดที่อยู่ไฟล์ชีทให้คนนอก');
var ghostWho = ghost.whoAmI();
truthy('บอกว่าไม่ทราบว่าเป็นใคร', ghostWho.indexOf('ไม่ทราบว่าคุณเป็นใคร') > -1);
truthy('ไม่มีลิงก์ไฟล์ชีทอยู่ในคำตอบ', ghostWho.indexOf('spreadsheets/d/') < 0);
truthy('พนักงานที่ล็อกอินอยู่ยังได้คำตอบเต็ม',
  ctx.whoAmI().indexOf('spreadsheets/d/') > -1);

/* ---------------------------------------------------------------------------
   ฟังก์ชันที่สั่งได้จากหน้า Apps Script ต้องเขียนผลลง Log

   หน้า Apps Script มีปุ่ม "เรียกใช้" ที่สั่งฟังก์ชันซึ่งไม่รับค่าอะไรเลยได้
   แต่ **ค่าที่ฟังก์ชัน return ไม่ถูกแสดงให้เห็นเลย** บันทึกการดำเนินการจะขึ้น
   แค่ "เริ่มการดำเนินการแล้ว" กับ "ดำเนินการเสร็จแล้ว" สองบรรทัดเท่านั้น

   ของจริง 15 ก.ย. 69: เจ้าของร้านสั่ง fixDocNotes แล้วเห็นแค่สองบรรทัดนั้น
   ไม่มีทางรู้เลยว่ามันย้ายให้กี่ใบ ใบไหนบ้าง หรือไม่เจออะไรให้ย้ายเลย
   ฟังก์ชันที่ทำงานเสร็จแล้วเงียบสนิท กับฟังก์ชันที่ไม่ได้ทำอะไร หน้าตาเหมือนกันเป๊ะ
   แล้วคนใช้ต้องไปเดาเอาเองจากการเปิดชีทดูทีละช่อง

   นับ Logger.log ของฟังก์ชันส่วนตัวที่มันเรียกด้วย เพราะหลายตัวเป็นแค่เปลือกบาง ๆ
   ที่ส่งต่อให้ตัวจริงทำ (checkStaticCells -> staticCells_) ซึ่งไม่ใช่ความผิด   */
console.log('\n3. ฟังก์ชันที่สั่งจากหน้า Apps Script ได้ ต้องไม่ทำงานเสร็จแบบเงียบ ๆ');

/* สามตัวนี้หน้าเว็บเป็นคนเรียก ไม่ใช่คนกดจากหน้า Apps Script
   บังคับให้เขียน Log จะกลายเป็นขยะที่เขียนทุกครั้งที่มีคนเปิดแอป */
var WEB_ONLY = {
  getBootstrap: 'หน้าเว็บเรียกตอนเปิดแอป',
  slipsWaiting: 'หน้าเว็บเรียกเพื่อนับสลิปที่รอตรวจ',
  slipMonths: 'หน้าเว็บเรียกตอนเลือกเดือนที่จะส่งออก'
};

var byName = {};
all.forEach(function (fn) { byName[fn.name] = fn.body; });

function logsSomewhere(fn) {
  if (fn.body.indexOf('Logger.log') > -1) return true;
  /* ตามไปอีกชั้นเดียว พอสำหรับเปลือกบาง ๆ และยังอ่านออกว่าตรวจอะไรอยู่ */
  var calls = fn.body.match(/\b[A-Za-z][A-Za-z0-9_]*_\s*\(/g) || [];
  for (var i = 0; i < calls.length; i++) {
    var nm = calls[i].replace(/\s*\($/, '');
    if (byName[nm] && byName[nm].indexOf('Logger.log') > -1) return true;
  }
  return false;
}

var runnable = all.filter(function (fn) {
  return fn.name.slice(-1) !== '_' && !fn.args.trim() && !WEB_ONLY[fn.name];
});
truthy('เจอฟังก์ชันที่สั่งจากหน้า Apps Script ได้จริง', runnable.length > 15);
eq('ทุกตัวเขียนผลลง Log ไม่มีตัวไหนเสร็จแล้วเงียบ',
  runnable.filter(function (fn) { return !logsSomewhere(fn); })
    .map(function (fn) { return fn.file + ':' + fn.name; }), []);

/* รายการยกเว้นต้องเป็นของจริง ไม่ใช่ชื่อค้างจากโค้ดที่ลบไปแล้ว */
eq('ชื่อในรายการยกเว้นยังมีอยู่จริงทุกตัว',
  Object.keys(WEB_ONLY).filter(function (n) { return !byName[n]; }), []);

console.log(fails ? '\nตก ' + fails + ' ข้อ' : '\nผ่านทั้งหมด');
process.exit(fails ? 1 : 0);
