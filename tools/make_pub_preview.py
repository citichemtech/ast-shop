#!/usr/bin/env python3
"""ประกอบหน้าลูกค้า (Pub.html) ให้เปิดในเบราว์เซอร์ธรรมดาได้

    python3 tools/make_pub_preview.py            -> out/pub.html
    python3 tools/make_pub_preview.py out/x.html apps-script/Pub.html

หน้าจริงถูกเสิร์ฟโดย Apps Script ซึ่งแทนที่ <?!= boot ?> ด้วยก้อน JSON
ตัวนี้ทำอย่างเดียวกันด้วยข้อมูลปลอม แล้วใส่ google.script.run จำลองให้

ข้อมูลปลอมในไฟล์นี้ต้องไม่ใช่ของลูกค้าจริง — โค้ดชุดนี้เปิดดูได้จากข้างนอก
(ยอดกับสินค้าลอกโครงมาจากตัวอย่างที่เจ้าของร้านส่งมา แต่ชื่อกับที่อยู่สมมติล้วน)
"""
import json
import re
import subprocess
import shutil
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

BOOT = {
    "key": "0123456789abcdef0123456789abcdef",
    "shop": {"name": "บริษัท ทดสอบ เคมีคอล จำกัด", "tel": "02-000-0000", "line": ""},
    "err": "",
    "data": {
        "ok": True,
        "dead": False,
        "ord": {
            "no": "AST-26-0042",
            "date": "2026-09-13",
            "cust": "ทดส## ทดส####",
            "addr": "1/2 ถ.ทดสอบ แขวงทดสอบ เขตทดสอบ กรุงเทพมหานคร 10520",
            "carrier": "Flash Express",
            "track": "",
            "vat": "ออก VAT",
            "discount": 0,
            "ship": 50,
            "status": "รอชำระ",
            "subtotal": 1795,
            "vatAmt": 125.65,
            "net": 1970.65,
            "items": [
                {"name": "อุปกรณ์ใส่สร้อยคอใหญ่ BOX37", "unit": "ชิ้น",
                 "qty": 1, "price": 265, "total": 265},
                {"name": "ต่างหู B22", "unit": "คู่", "qty": 1, "price": 228, "total": 228},
                {"name": "กล่องอเนกประสงค์ Box18", "unit": "ใบ",
                 "qty": 3, "price": 298, "total": 894},
                {"name": "อุปกรณ์ใส่ต่างหูเล็ก Box19", "unit": "ชิ้น",
                 "qty": 1, "price": 100, "total": 100},
                {"name": "อุปกรณ์ใส่สร้อยคอ Box33", "unit": "ชิ้น",
                 "qty": 1, "price": 100, "total": 100},
                {"name": "ต่างหู B784", "unit": "คู่", "qty": 1, "price": 208, "total": 208},
            ],
        },
        "acct": {
            "bank": "ไทยพาณิชย์ (SCB)",
            "name": "บริษัท ทดสอบ เคมีคอล จำกัด",
            "acct": "431-039435-5",
            "link": "https://www.scbeasy.com/",
        },
        "told": "",
        "slips": [],
    },
}

SHELL = """<!doctype html>
<html lang="th"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>ชำระเงิน — ตัวอย่าง</title>
<script>
/* google.script.run จำลอง — คืนผลสำเร็จหลังหน่วงนิดหนึ่ง เหมือนของจริง
   ตั้ง PUB_FAIL = 'ข้อความ' ก่อนกดปุ่ม เพื่อสอบทางที่ล้ม */
var PUB_SENT = [];
var PUB_FAIL = '';
var google = { script: { run: (function () {
  var ok = null, bad = null;
  var api = {
    withSuccessHandler: function (f) { ok = f; return api; },
    withFailureHandler: function (f) { bad = f; return api; },
    pubSlip: function (key, p) {
      PUB_SENT.push({ key: key, paidAt: p.paidAt, amount: p.amount,
                      bytes: (p.data || '').length });
      setTimeout(function () {
        if (PUB_FAIL) { if (bad) bad(new Error(PUB_FAIL)); }
        else if (ok) ok({ ok: true, slips: [] });
      }, 30);
    }
  };
  return api;
})() } };
</script>
</head><body>
__BODY__
</body></html>
"""


def check_scripts(html: str) -> None:
    """ด่านเดียวกับ make_preview.py — สคริปต์ที่พังตั้งแต่ไวยากรณ์ต้องรู้ตอน build

    เคยพลาดมาแล้วครั้งหนึ่งจากการ escape ตกไปหนึ่งชั้นตอนประกอบไฟล์
    หน้าเว็บขึ้นปกติทุกอย่าง แต่ไม่มีปุ่มไหนทำงานเลย
    """
    node = shutil.which("node")
    if not node:
        return
    for i, code in enumerate(re.findall(r"<script>([\s\S]*?)</script>", html)):
        with tempfile.NamedTemporaryFile("w", suffix=".js", delete=False,
                                         encoding="utf-8") as fh:
            fh.write(code)
            path = fh.name
        r = subprocess.run([node, "--check", path], capture_output=True, text=True)
        if r.returncode:
            sys.exit("สคริปต์ก้อนที่ %d พังตั้งแต่ไวยากรณ์:\n%s" % (i + 1, r.stderr))


def main() -> None:
    out = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "out" / "pub.html"
    src = Path(sys.argv[2]) if len(sys.argv) > 2 else ROOT / "apps-script" / "Pub.html"
    body = src.read_text(encoding="utf-8")
    if "<?!= boot ?>" not in body:
        sys.exit("ไม่เจอ <?!= boot ?> ใน %s — โครงไฟล์เปลี่ยนไป" % src)
    body = body.replace("<?!= boot ?>", json.dumps(BOOT, ensure_ascii=False))
    html = SHELL.replace("__BODY__", body)
    check_scripts(html)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(html, encoding="utf-8")
    print("เขียน %s (%.0f KB)" % (out, out.stat().st_size / 1024))


if __name__ == "__main__":
    main()
