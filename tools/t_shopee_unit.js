/*
 * ทดสอบตัวอ่านไฟล์ Shopee ด้วย node — ดึงโค้ดจริงจาก apps-script/Shopee.html มารัน
 *
 *   node tools/t_shopee_unit.js
 *
 * ทำไมต้องมีชุดนี้แยกจากข้อสอบเบราว์เซอร์: ตัวอ่านตารางคือจุดที่พลาดแล้วเงียบที่สุด
 * คอลัมน์เลื่อนไปหนึ่งช่องคือเบอร์โทรไปโผล่ช่องที่อยู่ · จับหัวคอลัมน์ผิดตัวคือ
 * "ราคาตั้งต้น" ถูกใช้แทน "ราคาขาย" แล้วกำไรผิดทั้งไฟล์โดยที่หน้าจอดูปกติดี
 */
'use strict';
var fs = require('fs');
var path = require('path');
var vm = require('vm');

var html = fs.readFileSync(path.join(__dirname, '..', 'apps-script', 'Shopee.html'), 'utf8');
var code = html.replace(/^[\s\S]*?<script>/, '').replace(/<\/script>[\s\S]*$/, '');
var ctx = { console: console };
vm.createContext(ctx);
vm.runInContext(code, ctx);

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

function tsv(rows) { return rows.map(function (r) { return r.join('\t'); }).join('\n'); }

/* หัวคอลัมน์ชุดนี้ลอกจากไฟล์ที่ Seller Centre ไทยส่งออกมาจริง */
var HEAD = ['หมายเลขคำสั่งซื้อ', 'สถานะการสั่งซื้อ', 'สถานะการยกเลิก/คืนเงิน',
  'วันที่ทำการสั่งซื้อ', 'ชื่อสินค้า', 'ชื่อตัวเลือก', 'เลขอ้างอิง SKU (ตัวเลือก)',
  'ราคาตั้งต้น', 'ราคาขาย', 'จำนวน', 'จำนวนเงินทั้งหมด',
  'โค้ดส่วนลดชำระโดยผู้ขาย', 'ค่าจัดส่งที่ชำระโดยผู้ซื้อ',
  'ผู้ให้บริการขนส่ง', 'หมายเลขติดตามพัสดุ',
  'ชื่อผู้รับ', 'หมายเลขโทรศัพท์', 'ที่อยู่ในการจัดส่ง',
  'ตำบล/แขวง', 'อำเภอ/เขต', 'จังหวัด', 'รหัสไปรษณีย์'];

function line(o) {
  return [o.sn, o.status || 'สำเร็จแล้ว', '', o.date || '05/09/2026',
    o.name, o.variation || '', o.sku || '', o.orig || '', o.price || '',
    o.qty, o.total || '', o.disc || '', o.ship || '',
    o.carrier || 'Shopee Xpress', o.track || '',
    o.cust || '', o.tel || '', o.addr || '',
    o.town || '', o.district || '', o.province || '', o.zip || ''];
}

/* ---------- 1. อ่านไฟล์ปกติ ---------- */
console.log('\n1. อ่านไฟล์ที่ก๊อปมาจาก Excel (คั่นด้วยแท็บ)');
var r1 = ctx.shopeeRead(tsv([HEAD,
  line({ sn: '260905ABCD1', name: 'End Mill Corn cut 2F  3.0*15*3.175*38L (1pcs)',
         sku: 'SKU-141', price: '129', qty: '2', ship: '0', disc: '0',
         cust: 'สมหญิง ทดสอบ', tel: '0812345678', addr: '99/1 หมู่ 5',
         town: 'บางรัก', district: 'บางรัก', province: 'กรุงเทพมหานคร', zip: '10500' }),
  line({ sn: '260905ABCD1', name: 'End Mill Corn cut 2F  3.175*22*3.175*45L (1pcs)',
         sku: 'SKU-143', price: '149', qty: '1', ship: '0' }),
  line({ sn: '260905ABCD2', name: 'น้ำยาหล่อเย็น 20L', sku: 'CHEM-001',
         price: '1200', qty: '1', ship: '50', disc: '30',
         cust: 'บริษัท ทดสอบ จำกัด', tel: '0899999999', addr: '1 ถ.ทดสอบ',
         province: 'ปทุมธานี', zip: '12150' })]));

truthy('อ่านผ่าน', r1.ok);
eq('ได้ 2 ใบ', r1.orders.length, 2);
eq('ใบแรกมี 2 บรรทัด', r1.orders[0].lines.length, 2);
eq('รหัสสินค้าอ่านมาถูก', r1.orders[0].lines.map(function (l) { return l.sku; }),
  ['SKU-141', 'SKU-143']);
eq('จำนวนอ่านมาถูก', r1.orders[0].lines.map(function (l) { return l.qty; }), [2, 1]);
eq('ราคาใช้ "ราคาขาย" ไม่ใช่ "ราคาตั้งต้น"', r1.orders[0].lines[0].price, 129);
eq('ชื่อลูกค้าเก็บจากบรรทัดแรกของใบ', r1.orders[0].cust, 'สมหญิง ทดสอบ');
eq('เบอร์โทร', r1.orders[0].tel, '0812345678');
eq('วันที่แปลงเป็น ค.ศ. แบบ ปี-เดือน-วัน', r1.orders[0].date, '2026-09-05');
eq('ที่อยู่ต่อตำบล อำเภอ จังหวัด รหัสไปรษณีย์ ให้ครบ', r1.orders[0].addr,
  '99/1 หมู่ 5 บางรัก กรุงเทพมหานคร 10500');
eq('ค่าส่งของใบที่สอง', r1.orders[1].ship, 50);
eq('ส่วนลดของใบที่สอง', r1.orders[1].discount, 30);

/* ---------- 2. เงินระดับใบต้องไม่บวกซ้ำตามจำนวนบรรทัด ---------- */
console.log('\n2. ค่าส่งใบละ 50 ที่ซ้ำอยู่ทุกบรรทัด ต้องไม่กลายเป็น 150');
var r2 = ctx.shopeeRead(tsv([HEAD,
  line({ sn: 'X1', name: 'ก', sku: 'SKU-141', price: '100', qty: '1', ship: '50', disc: '20' }),
  line({ sn: 'X1', name: 'ข', sku: 'SKU-143', price: '100', qty: '1', ship: '50', disc: '20' }),
  line({ sn: 'X1', name: 'ค', sku: 'SKU-161', price: '100', qty: '1', ship: '50', disc: '20' })]));
eq('ค่าส่งยังเป็น 50', r2.orders[0].ship, 50);
eq('ส่วนลดยังเป็น 20', r2.orders[0].discount, 20);
eq('รายการสินค้าครบ 3 บรรทัด', r2.orders[0].lines.length, 3);

/* ---------- 3. ไฟล์ที่ใส่ข้อมูลใบไว้เฉพาะบรรทัดแรก ---------- */
console.log('\n3. ไฟล์ที่ใส่หมายเลขคำสั่งซื้อไว้เฉพาะบรรทัดแรกของใบ');
var r3 = ctx.shopeeRead(tsv([HEAD,
  line({ sn: 'Y1', name: 'ก', sku: 'SKU-141', price: '100', qty: '1', cust: 'ลูกค้า ก' }),
  line({ sn: '', name: 'ข', sku: 'SKU-143', price: '100', qty: '2' }),
  line({ sn: 'Y2', name: 'ค', sku: 'SKU-161', price: '100', qty: '1', cust: 'ลูกค้า ข' })]));
eq('ได้ 2 ใบ ไม่ใช่ 3', r3.orders.length, 2);
eq('บรรทัดที่ไม่มีเลขใบไปเกาะใบข้างบน', r3.orders[0].lines.length, 2);
eq('ใบที่สองแยกออกถูกต้อง', r3.orders[1].lines.length, 1);

/* ---------- 4. หัวคอลัมน์ที่หลอกให้จับผิดช่อง ---------- */
console.log('\n4. หัวคอลัมน์ที่มีคำซ้ำกัน ต้องไม่จับผิดช่อง');
var r4 = ctx.shopeeRead(tsv([HEAD,
  line({ sn: 'Z1', name: 'ก', sku: 'SKU-141', orig: '999', price: '129',
         qty: '3', total: '387' })]));
eq('"จำนวน" ต้องไม่ไปโดน "จำนวนเงินทั้งหมด"', r4.orders[0].lines[0].qty, 3);
eq('"ราคาขาย" ชนะ "ราคาตั้งต้น"', r4.orders[0].lines[0].price, 129);

/* ---------- 5. ไฟล์ .csv ที่มีจุลภาคและขึ้นบรรทัดใหม่ในช่องที่อยู่ ---------- */
console.log('\n5. ไฟล์ csv ที่ที่อยู่มีจุลภาคและขึ้นบรรทัดใหม่อยู่ข้างใน');
var csv = 'หมายเลขคำสั่งซื้อ,ชื่อสินค้า,จำนวน,ราคาขาย,ชื่อผู้รับ,ที่อยู่ในการจัดส่ง\n' +
  'C1,ก,1,100,"ทดสอบ, ระบบ","9/9 ถ.หนึ่ง, ซอยสอง\nอาคารสาม ชั้น 4"\n';
var r5 = ctx.shopeeRead(csv);
truthy('อ่านผ่าน', r5.ok);
eq('ชื่อที่มีจุลภาคไม่ถูกตัด', r5.orders[0].cust, 'ทดสอบ, ระบบ');
eq('ที่อยู่ที่มีขึ้นบรรทัดใหม่ยังอยู่ครบใบเดียว', r5.orders[0].addr,
  '9/9 ถ.หนึ่ง, ซอยสอง\nอาคารสาม ชั้น 4');
eq('ยังเป็นออเดอร์ใบเดียว', r5.orders.length, 1);

/* ---------- 6. ชื่อสินค้าที่มีเครื่องหมายคำพูดอยู่กลางชื่อ ---------- */
console.log('\n6. ชื่อสินค้าที่มีนิ้วฟุต (") อยู่กลางชื่อ ต้องไม่กลืนทั้งไฟล์');
var r6 = ctx.shopeeRead('หมายเลขคำสั่งซื้อ,ชื่อสินค้า,จำนวน\n' +
  'D1,ท่อ 2" ยาว 3 เมตร,1\nD2,ของอีกอย่าง,2\n');
eq('ยังแยกได้ 2 ใบ', r6.orders.length, 2);
eq('ชื่อสินค้าครบ', r6.orders[0].lines[0].name, 'ท่อ 2" ยาว 3 เมตร');

/* ---------- 7. มีบรรทัดชื่อรายงานอยู่เหนือหัวตาราง ---------- */
console.log('\n7. ไฟล์ที่มีบรรทัดชื่อรายงานอยู่เหนือหัวตาราง');
var r7 = ctx.shopeeRead(tsv([
  ['รายงานคำสั่งซื้อ ประจำวันที่ 5 ก.ย. 2569'],
  ['ร้าน AST Chem-Tooling'],
  HEAD,
  line({ sn: 'E1', name: 'ก', sku: 'SKU-141', price: '100', qty: '1' })]));
truthy('ข้ามบรรทัดชื่อรายงานแล้วหาหัวตารางเจอ', r7.ok);
eq('อ่านออเดอร์ได้', r7.orders.length, 1);

/* ---------- 8. ขาดคอลัมน์ที่ต้องมี ---------- */
console.log('\n8. ขาดคอลัมน์ที่ขาดไม่ได้ ต้องบอกชื่อคอลัมน์ ไม่ใช่เดาต่อ');
var r8 = ctx.shopeeRead('หมายเลขคำสั่งซื้อ,ชื่อผู้รับ,ที่อยู่ในการจัดส่ง\nF1,ทดสอบ,9/9\n');
eq('ไม่ผ่าน', r8.ok, false);
eq('บอกว่าขาดชื่อสินค้ากับจำนวน', r8.missing, ['ชื่อสินค้า', 'จำนวน']);
truthy('บอกหัวคอลัมน์ที่อ่านได้กลับมาด้วย', r8.headers.length === 3);

/* ---------- 9. หัวคอลัมน์ภาษาอังกฤษ ---------- */
console.log('\n9. ไฟล์หัวคอลัมน์ภาษาอังกฤษ');
var r9 = ctx.shopeeRead(tsv([
  ['Order ID', 'Order Status', 'Product Name', 'Variation Name', 'SKU Reference No.',
   'Deal Price', 'Quantity', 'Receiver Name', 'Phone Number', 'Delivery Address',
   'Tracking Number', 'Shipping Option'],
  ['G1', 'Completed', 'End Mill Corn cut 2F', '3.0mm', 'SKU-141', '129', '2',
   'Test Buyer', '0811111111', '1 Test Road', 'TH123', 'Flash Express']]));
truthy('อ่านผ่าน', r9.ok);
eq('รหัสสินค้า', r9.orders[0].lines[0].sku, 'SKU-141');
eq('ชื่อสินค้าต่อกับชื่อตัวเลือก', r9.orders[0].lines[0].name, 'End Mill Corn cut 2F 3.0mm');
eq('จำนวน', r9.orders[0].lines[0].qty, 2);
eq('เลขพัสดุ', r9.orders[0].track, 'TH123');
eq('ขนส่ง', r9.orders[0].carrier, 'Flash Express');

/* ---------- 10. เบอร์โทรที่ Excel ห่อไว้กัน 0 หน้าหาย ---------- */
console.log('\n10. เบอร์โทรแบบ ="0812345678" ที่ Excel ใส่มากัน 0 หน้าหาย');
var r10 = ctx.shopeeRead('หมายเลขคำสั่งซื้อ,ชื่อสินค้า,จำนวน,หมายเลขโทรศัพท์\n' +
  'H1,ก,1,="0812345678"\n');
eq('ถอดเครื่องหมายออกแล้วเลข 0 ยังอยู่', r10.orders[0].tel, '0812345678');

/* ---------- 11. Shopee ปิดบังชื่อผู้ซื้อ ---------- */
console.log('\n11. ไฟล์ที่ไม่มีชื่อผู้ซื้อ (Shopee ปิดบังไว้)');
var r11 = ctx.shopeeRead(tsv([HEAD,
  line({ sn: 'I1', name: 'ก', sku: 'SKU-141', price: '100', qty: '1', cust: '' })]));
eq('ใส่ชื่อที่ตามกลับไปหาใบเดิมได้ แทนที่จะปล่อยว่างแล้วบันทึกไม่ผ่าน',
  r11.orders[0].cust, 'ลูกค้า Shopee I1');

/* ---------- 12. วันที่แบบต่าง ๆ ---------- */
console.log('\n12. วันที่');
eq('วัน/เดือน/ปี ค.ศ.', ctx.shopeeDate('05/09/2026 14:23'), '2026-09-05');
eq('ปี-เดือน-วัน', ctx.shopeeDate('2026-09-05 14:23:07'), '2026-09-05');
eq('ปี พ.ศ. แปลงกลับเป็น ค.ศ.', ctx.shopeeDate('05/09/2569'), '2026-09-05');
eq('ช่องว่างได้ค่าว่าง ไม่ใช่วันที่มั่ว', ctx.shopeeDate(''), '');
eq('อ่านไม่ออกก็คืนค่าว่าง', ctx.shopeeDate('เมื่อวาน'), '');

/* ---------- 13. ตัวเลขที่มีจุลภาคและสัญลักษณ์เงิน ---------- */
console.log('\n13. ตัวเลขในไฟล์');
eq('มีจุลภาค', ctx.shopeeNum('1,250.50'), 1250.5);
eq('มีสัญลักษณ์เงิน', ctx.shopeeNum('฿ 890'), 890);
eq('ช่องว่าง = 0', ctx.shopeeNum(''), 0);
eq('อ่านไม่ออก = 0 ไม่ใช่ NaN', ctx.shopeeNum('ไม่ระบุ'), 0);

/* ---------- 14. ที่อยู่ที่มีจังหวัดซ้ำอยู่แล้ว ---------- */
console.log('\n14. ที่อยู่ที่ในช่องหลักมีจังหวัดกับรหัสไปรษณีย์อยู่แล้ว');
eq('ไม่ต่อซ้ำ',
  ctx.shopeeAddr('9/9 ถ.ทดสอบ แขวงบางรัก เขตบางรัก กรุงเทพมหานคร 10500',
    'บางรัก', 'บางรัก', 'กรุงเทพมหานคร', '10500'),
  '9/9 ถ.ทดสอบ แขวงบางรัก เขตบางรัก กรุงเทพมหานคร 10500');
eq('ส่วนที่ขาดต่อให้', ctx.shopeeAddr('9/9 ถ.ทดสอบ', '', '', 'ปทุมธานี', '12150'),
  '9/9 ถ.ทดสอบ ปทุมธานี 12150');

/* ---------- 15. วางข้อความเปล่า ---------- */
console.log('\n15. วางของที่ไม่ใช่ตาราง');
eq('ข้อความว่าง', ctx.shopeeRead('').ok, false);
eq('ข้อความมั่ว ๆ ไม่ล้ม แต่ตอบว่าอ่านไม่ได้', ctx.shopeeRead('สวัสดีครับ').ok, false);

console.log(fails ? '\nตก ' + fails + ' ข้อ' : '\nผ่านทั้งหมด');
process.exit(fails ? 1 : 0);
