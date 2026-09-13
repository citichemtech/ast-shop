/**
 * สำรองไฟล์ชีทอัตโนมัติทุกวัน
 *
 * ====== อ่านตรงนี้ก่อน ======
 * ไฟล์นี้ "ไม่ใช่" ส่วนหนึ่งของแอปคีย์ออเดอร์ ต้องเอาไปวางใน Apps Script
 * โปรเจกต์ใหม่ที่แยกต่างหาก วิธีติดตั้งอยู่ท้ายไฟล์และใน README
 *
 * ทำไมต้องแยก: การก๊อปไฟล์ต้องขอสิทธิ์เข้าถึง Google Drive ทั้งไดรฟ์
 * ถ้าใส่รวมไปในแอป พนักงานทุกคนที่เปิดแอปคีย์ออเดอร์จะโดนถามสิทธิ์ Drive
 * ตามไปด้วยทั้งที่ไม่ได้ใช้ — ให้เจ้าของร้านคนเดียวอนุญาตในโปรเจกต์นี้พอ
 *
 * ทำไมต้องมี: 6 ก.ย. 69 ไฟล์ชีทถูกลบโดยไม่ตั้งใจ กู้จากถังขยะไม่ทัน
 * รอดมาได้เพราะบังเอิญมีแท็บที่เปิดค้างไว้ให้ก๊อปข้อมูลออกมา
 * ครั้งหน้าอาจไม่มีแท็บนั้น — ของสำรองจึงต้องมีอยู่แล้วก่อนเกิดเรื่อง
 */

/* ไฟล์ที่จะสำรอง ตั้งทับได้ที่ คุณสมบัติสคริปต์ คีย์ SHEET_ID
   (ย้ายไฟล์เมื่อไร มาตั้งที่นี่ด้วย ไม่งั้นจะสำรองไฟล์เก่าต่อไปเรื่อย ๆ) */
var BACKUP_SHEET_ID = (function () {
  try {
    var v = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
    if (v && String(v).trim()) return String(v).trim();
  } catch (e) {
    /* อ่าน property ไม่ได้ ไม่ใช่เหตุให้เลิกสำรอง */
  }
  return '1AcV0rYN6Mb_T3Z9e4mPaP6LsT1sP34Lop1l-22sSWCQ';
})();

var BACKUP_FOLDER = 'AST_สำรองชีทอัตโนมัติ';
var BACKUP_PREFIX = 'AST สำรอง ';
var BACKUP_HOUR = 1;      /* ตีหนึ่ง — ไม่มีใครคีย์ออเดอร์อยู่ */
var KEEP_DAYS = 30;
/* ต่อให้เก่ากว่า 30 วันหมดทุกใบ ก็ต้องเหลือไว้อย่างน้อยเท่านี้เสมอ
   กันกรณีที่ตัวสำรองเองพังไปหลายวันโดยไม่มีใครรู้ แล้วมาลบของเก่าทิ้งจนเกลี้ยง */
var KEEP_MIN = 7;

/* ------------------------------------------------------------ ตัวช่วยเรื่องชื่อ */

function pad2_(n) { return n < 10 ? '0' + n : '' + n; }

/* เวลาที่คนอ่าน ต้องเป็นเวลาที่นาฬิกาบนผนังบอก ไม่ใช่เวลา UTC
   toISOString() เขียน 2026-09-09T18:09Z ทั้งที่สำรองตอนตีหนึ่งวันที่ 10
   คนอ่านแล้วนึกว่าสำรองตอนหกโมงเย็นของอีกวัน ซึ่งผิดทั้งวันและทั้งเวลา */
function localStamp_(d) {
  var tz = Session.getScriptTimeZone() || 'Asia/Bangkok';
  return Utilities.formatDate(d, tz, 'yyyy-MM-dd HH:mm') + ' น.';
}

/** ชื่อไฟล์สำรอง — เรียงตามเวลาได้ด้วยการเรียงชื่อ และอ่านออกด้วยตาเปล่า */
function backupName_(d) {
  return BACKUP_PREFIX + d.getFullYear() + '-' + pad2_(d.getMonth() + 1) + '-' +
    pad2_(d.getDate()) + ' ' + pad2_(d.getHours()) + pad2_(d.getMinutes());
}

/**
 * อ่านเวลากลับจากชื่อไฟล์ คืน null ถ้าไม่ใช่ไฟล์สำรองของเรา
 *
 * ตัวนี้คือด่านกันลบผิดไฟล์ — อะไรที่อ่านชื่อไม่ออกจะไม่ถูกแตะเด็ดขาด
 * ถึงจะบังเอิญอยู่ในโฟลเดอร์เดียวกันก็ตาม
 */
function backupTime_(name) {
  var m = String(name || '').match(
    /^AST สำรอง (\d{4})-(\d{2})-(\d{2}) (\d{2})(\d{2})$/);
  if (!m) return null;
  var d = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], 0, 0);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * เลือกว่าจะทิ้งไฟล์ไหน — แยกออกมาเป็นฟังก์ชันล้วนเพื่อให้สอบได้
 *
 * files = [{ id, name }]  คืนรายการที่ควรย้ายลงถังขยะ
 */
function pickExpired_(files, now, keepDays, keepMin) {
  var mine = [];
  for (var i = 0; i < files.length; i++) {
    var t = backupTime_(files[i].name);
    if (!t) continue;                              /* ไม่ใช่ของเรา ไม่แตะ */
    if (files[i].id === BACKUP_SHEET_ID) continue; /* ไฟล์ตัวจริง ไม่แตะเด็ดขาด */
    mine.push({ id: files[i].id, name: files[i].name, at: t.getTime() });
  }
  mine.sort(function (a, b) { return b.at - a.at; });   /* ใหม่สุดอยู่หน้า */

  var cutoff = now.getTime() - keepDays * 24 * 60 * 60 * 1000;
  var out = [];
  for (var j = keepMin; j < mine.length; j++) {
    if (mine[j].at < cutoff) out.push(mine[j]);
  }
  return out;
}

/* ------------------------------------------------------------------ ตัวจริง */

function backupFolder_() {
  var it = DriveApp.getFoldersByName(BACKUP_FOLDER);
  while (it.hasNext()) {
    var f = it.next();
    if (f.getName() === BACKUP_FOLDER) return f;
  }
  return DriveApp.createFolder(BACKUP_FOLDER);
}

/**
 * สำรองหนึ่งครั้ง — ตัวที่ทริกเกอร์รายวันเรียก และกดเองก็ได้
 *
 * ล้มแล้วต้องรู้ ไม่ใช่เงียบ ๆ แล้วเข้าใจว่ามีของสำรองอยู่ทั้งที่ไม่มีมาสามเดือน
 * จึงจำผลล่าสุดไว้ที่คุณสมบัติสคริปต์ ให้ backupStatus() อ่านมาบอกได้
 */
function backupNow() {
  var now = new Date();
  var props = PropertiesService.getScriptProperties();
  try {
    var src = DriveApp.getFileById(BACKUP_SHEET_ID);
    var folder = backupFolder_();
    var name = backupName_(now);
    var copy = src.makeCopy(name, folder);

    /* ลบของเก่าหลังก๊อปสำเร็จเท่านั้น ถ้าก๊อปล้มแล้วยังไปลบของเก่า
       จะเหลือของสำรองน้อยลงทุกวันโดยไม่มีของใหม่มาแทนเลย */
    var files = [], it = folder.getFiles();
    while (it.hasNext()) {
      var f = it.next();
      files.push({ id: f.getId(), name: f.getName(), file: f });
    }
    var expired = pickExpired_(files, now, KEEP_DAYS, KEEP_MIN);
    var trashed = 0;
    for (var i = 0; i < expired.length; i++) {
      for (var j = 0; j < files.length; j++) {
        if (files[j].id !== expired[i].id) continue;
        /* ย้ายลงถังขยะ ไม่ใช่ลบถาวร — ถังขยะยังกู้คืนได้อีก 30 วัน */
        files[j].file.setTrashed(true);
        trashed++;
      }
    }

    var msg = 'สำรองแล้ว: ' + name +
      '\nเก็บไว้ในโฟลเดอร์ ' + BACKUP_FOLDER +
      '\nลิงก์: ' + copy.getUrl() +
      (trashed ? '\nย้ายของเก่ากว่า ' + KEEP_DAYS + ' วันลงถังขยะ ' + trashed + ' ไฟล์' : '');
    props.setProperty('BACKUP_LAST_OK', localStamp_(now));
    props.setProperty('BACKUP_LAST_MSG', msg);
    props.deleteProperty('BACKUP_LAST_ERR');
    Logger.log(msg);
    return msg;
  } catch (e) {
    var err = 'สำรองไม่สำเร็จ (' + localStamp_(now) + '): ' + e.message;
    props.setProperty('BACKUP_LAST_ERR', err);
    Logger.log(err);
    throw e;   /* โยนต่อ เพื่อให้ Apps Script ส่งอีเมลแจ้งว่าทริกเกอร์ล้ม */
  }
}

/** ตั้งให้สำรองเองทุกวัน — กดครั้งเดียวพอ กดซ้ำก็ไม่เกิดทริกเกอร์ซ้ำ */
function setupBackup() {
  stopBackup();
  ScriptApp.newTrigger('backupNow').timeBased().atHour(BACKUP_HOUR).everyDays(1).create();
  /* สำรองให้เลยหนึ่งรอบ จะได้เห็นกับตาว่าใช้ได้จริง ไม่ต้องรอถึงพรุ่งนี้ */
  var first = backupNow();
  var msg = 'ตั้งสำรองอัตโนมัติทุกวันตอนประมาณตี ' + BACKUP_HOUR + ' เรียบร้อย\n\n' + first;
  Logger.log(msg);
  return msg;
}

/** เลิกสำรองอัตโนมัติ — ไฟล์ที่สำรองไว้แล้วไม่ถูกลบ */
function stopBackup() {
  var all = ScriptApp.getProjectTriggers(), n = 0;
  for (var i = 0; i < all.length; i++) {
    if (all[i].getHandlerFunction() === 'backupNow') { ScriptApp.deleteTrigger(all[i]); n++; }
  }
  return n ? 'ปิดการสำรองอัตโนมัติแล้ว (' + n + ' ทริกเกอร์)' : 'ไม่ได้ตั้งสำรองอัตโนมัติไว้อยู่แล้ว';
}

/** สำรองล่าสุดเมื่อไร มีกี่ไฟล์ ล้มครั้งสุดท้ายเพราะอะไร */
function backupStatus() {
  var props = PropertiesService.getScriptProperties();
  var out = [];
  out.push('ไฟล์ที่สำรอง: https://docs.google.com/spreadsheets/d/' + BACKUP_SHEET_ID + '/edit');

  var trig = ScriptApp.getProjectTriggers(), on = 0;
  for (var i = 0; i < trig.length; i++) if (trig[i].getHandlerFunction() === 'backupNow') on++;
  out.push(on ? 'สำรองอัตโนมัติ: เปิดอยู่' : 'สำรองอัตโนมัติ: ยังไม่ได้ตั้ง — สั่ง setupBackup หนึ่งครั้ง');

  var ok = props.getProperty('BACKUP_LAST_OK');
  /* ค่าที่เก็บไว้ก่อนหน้านี้เป็นเวลา UTC แบบ ISO อ่านให้เป็นเวลาไทยก่อนโชว์
     ไม่ต้องรอให้สำรองรอบใหม่มาทับ ถึงจะอ่านรู้เรื่อง */
  if (ok && /^\d{4}-\d{2}-\d{2}T/.test(ok)) {
    var d = new Date(ok);
    if (!isNaN(d.getTime())) ok = localStamp_(d);
  }
  out.push('สำเร็จล่าสุด: ' + (ok || 'ยังไม่เคย'));
  var err = props.getProperty('BACKUP_LAST_ERR');
  if (err) out.push('ล้มครั้งล่าสุด: ' + err);

  try {
    var folder = backupFolder_(), it = folder.getFiles(), n = 0, newest = '';
    while (it.hasNext()) {
      var nm = it.next().getName();
      if (!backupTime_(nm)) continue;
      n++;
      if (nm > newest) newest = nm;
    }
    out.push('ไฟล์สำรองที่มีอยู่: ' + n + ' ไฟล์' + (newest ? ' · ใหม่สุดคือ ' + newest : ''));
  } catch (e) {
    out.push('อ่านโฟลเดอร์สำรองไม่ได้: ' + e.message);
  }

  var msg = out.join('\n');
  Logger.log(msg);
  return msg;
}

/*
 * ================= วิธีติดตั้ง (ทำครั้งเดียว) =================
 *
 * 1. เปิด https://script.google.com แล้วกด "โปรเจกต์ใหม่"
 *    (โปรเจกต์ใหม่จริง ๆ ไม่ใช่โปรเจกต์ของแอปคีย์ออเดอร์)
 * 2. ตั้งชื่อโปรเจกต์ว่า "AST สำรองชีทอัตโนมัติ"
 * 3. ลบโค้ดตัวอย่างในไฟล์ Code.gs ทิ้ง แล้ววางไฟล์นี้ลงไปทั้งไฟล์ → 💾 บันทึก
 * 4. เลือกฟังก์ชัน setupBackup แล้วกด "เรียกใช้"
 *    Google จะถามสิทธิ์เข้าถึง Drive ครั้งเดียว — กดอนุญาต
 * 5. ดูในไดรฟ์ จะมีโฟลเดอร์ AST_สำรองชีทอัตโนมัติ พร้อมไฟล์สำรองใบแรก
 *
 * อยากรู้ว่าสำรองล่าสุดเมื่อไร: เลือกฟังก์ชัน backupStatus แล้วกด เรียกใช้
 * อยากเลิก: เลือก stopBackup แล้วกด เรียกใช้ (ไฟล์เก่าไม่ถูกลบ)
 */
