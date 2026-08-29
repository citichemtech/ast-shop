#!/usr/bin/env python3
"""ประกอบไฟล์ Apps Script ให้เป็นหน้าเว็บไฟล์เดียวที่เปิดในเบราว์เซอร์ธรรมดาได้

ตอนอยู่บน Google หน้าเว็บถูกประกอบด้วย HtmlService (<?!= include_('X') ?>)
และคุยกับหลังบ้านผ่าน google.script.run ซึ่งทั้งสองอย่างไม่มีในเครื่อง
สคริปต์นี้จึงแทนที่ทั้งสองอย่างด้วยของจำลอง เพื่อให้ขับหน้าจอด้วย Playwright
ได้จริง — เห็นว่าปุ่มทำงานไหม ยอดรวมถูกไหม ใบปะหน้าวาดออกมาได้ไหม

    python3 tools/make_preview.py [ไฟล์ผลลัพธ์]

ไม่มีข้อมูลลูกค้าจริงอยู่ในไฟล์นี้ ทุกอย่างเป็นข้อมูลสมมติ
"""
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
GS = ROOT / "apps-script"

PRODUCTS = [
    {"sku": "SKU-141", "group": "TOOLING", "unit": "ชิ้น", "perPack": 1, "price": 129, "remain": 980,
     "name": "End Mill Corn cut 2F  3.0*15*3.175*38L (1pcs)"},
    {"sku": "SKU-143", "group": "TOOLING", "unit": "ชิ้น", "perPack": 1, "price": 149, "remain": 500,
     "name": "End Mill Corn cut 2F  3.175*22*3.175*45L (1pcs)"},
    {"sku": "SKU-160", "group": "TOOLING", "unit": "ชุด", "perPack": 10, "price": 750, "remain": 40,
     "name": "Set D1.8×8.5×3.175×38L Endmill Corn Cut 2F (10pcs)"},
    {"sku": "SKU-161", "group": "TOOLING", "unit": "ชิ้น", "perPack": 1, "price": 95, "remain": 300,
     "name": "End Mill Corn cut 2F 1.8*8.5*3.175*38L (1pcs)"},
    {"sku": "CHEM-001", "group": "CHEMICAL", "unit": "แกลลอน", "perPack": 1, "price": 1200, "remain": 14,
     "name": "น้ำยาหล่อเย็น 20L"},
]

BOOT = {
    "staff": "somchai@chem-inno-tech.com",
    "shop": "AST Chem-Tooling",
    "vatRate": 0.07,
    "lists": {
        "channel": ["หน้าร้าน", "Shopee", "เพจ Facebook"],
        "carrier": ["Flash Express", "Kerry Express", "ไปรษณีย์ไทย", "ส่งด่วน (ไรเดอร์)", "รับเองที่ร้าน"],
        "vat": ["ไม่รับ VAT", "รับ VAT"],
        "status": ["รอชำระ", "ชำระแล้ว", "จัดของแล้ว", "ส่งแล้ว", "ยกเลิก"],
        "recvType": ["ซื้อเข้า", "ตรวจนับ", "คืนจากลูกค้า", "ปรับเพิ่ม", "ปรับลด"],
    },
    "app": {
        "sender": {"name": "AST Chem-Tooling", "addr": "99/9 ถ.ทดสอบ ต.สันทราย อ.เมือง เชียงใหม่ 50000",
                   "tel": "0961929993"},
        "shipFee": 50, "freeOver": 1000, "codFee": 0,
        "line": "https://line.me/R/ti/p/@citiofficial",
        "track": {"Flash Express": "https://www.flashexpress.com/fle/tracking?se={track}"},
    },
    "products": PRODUCTS,
    "lots": {
        "CHEM-001": {"total": 14, "count": 2,
                     "next": {"lotNo": "L-2610", "exp": 1793404800000, "remain": 4}},
    },
    "nextNo": "AST-26-0006",
}

ORDERS = [{
    "no": "AST-26-0005", "date": "2026-08-28", "channel": "เพจ Facebook",
    "cust": "ลูกค้าตัวอย่าง ก", "tel": "0800000000",
    "addr": "1/2 ถ.ตัวอย่าง\nต.ในเมือง อ.เมือง\nเชียงใหม่ 50000",
    "carrier": "Flash Express", "track": "TH0000000001", "vat": "ไม่รับ VAT",
    "discount": 0, "ship": 50, "status": "ส่งแล้ว", "staff": "somchai@chem-inno-tech.com",
    "note": "", "subtotal": 750, "net": 800, "check": "OK",
    "items": [{"sku": "SKU-160", "name": PRODUCTS[2]["name"], "unit": "ชุด",
               "qty": 1, "price": 750, "total": 750, "lot": ""}],
}]

MOCK = """
<script>
/* google.script.run จำลอง — ใช้เฉพาะตอนดูหน้าจอในเครื่อง ไม่ได้ขึ้นไปอยู่บน Google */
var MOCK_BOOT = __BOOT__;
var MOCK_ORDERS = __ORDERS__;
window.SENT = [];
window.google = { script: { run: (function(){
  var ok=null, bad=null;
  var api = {
    withSuccessHandler: function(f){ ok=f; return api },
    withFailureHandler: function(f){ bad=f; return api },
    getBootstrap: function(){ reply(function(){ return JSON.parse(JSON.stringify(MOCK_BOOT)) }) },
    getOrders: function(){ reply(function(){ return JSON.parse(JSON.stringify(MOCK_ORDERS)) }) },
    setTracking: function(no,track,status){
      reply(function(){
        MOCK_ORDERS.forEach(function(o){ if(o.no===no){ o.track=track; o.status=status } });
        return {ok:true,no:no,changed:true};
      });
    },
    createOrder: function(p){
      window.SENT.push(p);
      reply(function(){
        if(window.MOCK_FAIL) throw new Error(window.MOCK_FAIL);
        var sub=0;
        p.items.forEach(function(it){
          var pr=MOCK_BOOT.products.filter(function(x){return x.sku===it.sku})[0];
          var unit=(it.price===""||it.price==null)?(pr?pr.price:0):Number(it.price);
          sub+=Math.round(Number(it.qty)*unit*100)/100;
        });
        return {ok:true,no:MOCK_BOOT.nextNo,subtotal:sub,
                net:sub-(Number(p.discount)||0)+(Number(p.ship)||0),lots:[]};
      });
    }
  };
  function reply(make){
    var s=ok, f=bad; ok=null; bad=null;
    setTimeout(function(){
      var r; try{ r=make() }catch(e){ if(f) f(e); return }
      if(s) s(r);
    }, 10);
  }
  return api;
})() } };
</script>
"""


def main():
    out = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "out" / "preview.html"
    out.parent.mkdir(parents=True, exist_ok=True)

    # รับ Index.html ที่รวมไฟล์แล้วได้ด้วย เพื่อพิสูจน์ว่าตัวที่เอาไปวางจริงยังทำงานได้
    src = pathlib.Path(sys.argv[2]) if len(sys.argv) > 2 else GS / "Index.html"
    index = src.read_text(encoding="utf-8")

    def sub_include(m):
        name = m.group(1)
        return (GS / (name + ".html")).read_text(encoding="utf-8")

    page, n = re.subn(r"<\?!=\s*include_\('(\w+)'\);?\s*\?>", sub_include, index)
    if n not in (0, 4):
        sys.exit("คาดว่าจะมี include 4 อัน (หรือ 0 ถ้ารวมไฟล์มาแล้ว) แต่เจอ %d อัน" % n)

    page = page.replace('"<?= staffEmail ?>"', json.dumps(BOOT["staff"]))
    if "<?" in page:
        sys.exit("ยังมี scriptlet ของ HtmlService เหลืออยู่ ประกอบไฟล์ไม่ครบ")

    mock = (MOCK.replace("__BOOT__", json.dumps(BOOT, ensure_ascii=False))
                .replace("__ORDERS__", json.dumps(ORDERS, ensure_ascii=False)))

    # ตัวจริงมีหัวเอกสารของตัวเองแล้ว (และ HtmlService เป็นคนเติม viewport ให้ตอนเสิร์ฟ)
    # ที่นี่จึงเติม viewport กับ title ลงใน <head> เดิม แล้วแทรกของจำลองหลัง <body>
    # ห้ามครอบ <html> ซ้อนอีกชั้น ไม่งั้นที่ทดสอบก็ไม่ใช่หน้าเดียวกับที่เอาไปวางจริง
    if page.lstrip().startswith("<!DOCTYPE"):
        extra = ('<meta name="viewport" content="width=device-width, initial-scale=1">'
                 '<title>ตัวอย่างหน้าคีย์ออเดอร์ (ข้อมูลสมมติ)</title>')
        html, n = re.subn(r"</head>", extra + "</head>", page, count=1)
        if not n:
            sys.exit("มี <!DOCTYPE> แต่ไม่เจอ </head> — โครงไฟล์เปลี่ยนไป")
        html, n = re.subn(r"<body[^>]*>", lambda m: m.group(0) + mock, html, count=1)
        if not n:
            sys.exit("มี <!DOCTYPE> แต่ไม่เจอ <body> — โครงไฟล์เปลี่ยนไป")
    else:
        html = ('<!DOCTYPE html><html lang="th"><head><meta charset="utf-8">'
                '<meta name="viewport" content="width=device-width, initial-scale=1">'
                '<title>ตัวอย่างหน้าคีย์ออเดอร์ (ข้อมูลสมมติ)</title></head><body>'
                + mock + page + '</body></html>')
    out.write_text(html, encoding="utf-8")
    print("เขียน %s (%.0f KB)" % (out, len(html.encode("utf-8")) / 1024))


if __name__ == "__main__":
    main()
