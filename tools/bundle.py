#!/usr/bin/env python3
"""รวมไฟล์ Apps Script ให้เหลือน้อยที่สุด สำหรับคนที่ต้องก๊อปวางเอง

    python3 tools/bundle.py [โฟลเดอร์ผลลัพธ์]

Apps Script อัปโหลดไฟล์ไม่ได้ ต้องคัดลอกไปวางทีละไฟล์ ซึ่งบนมือถือแทบเป็นไปไม่ได้
ถ้าต้องทำ 10 ไฟล์ สคริปต์นี้จึงรวมให้เหลือ 2 ไฟล์

    Code.gs     = โค้ดฝั่งเซิร์ฟเวอร์ทั้งหมดต่อกัน
    Index.html  = หน้าจอทั้งหมด แทนที่ include_() ด้วยเนื้อไฟล์จริง

ผลลัพธ์ทำงานเหมือนเดิมทุกอย่าง ต่างแค่จำนวนไฟล์
ไฟล์ต้นฉบับใน apps-script/ ยังเป็นตัวจริงที่ใช้แก้ — รันสคริปต์นี้ใหม่ทุกครั้งที่แก้โค้ด
"""
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
GS = ROOT / "apps-script"

# เรียงตามลำดับที่อ่านแล้วเข้าใจง่าย — Apps Script ไม่สนลำดับ ฟังก์ชันถูก hoist หมด
SERVER = ["Sheets.gs", "Fefo.gs", "Doc.gs", "Setup.gs", "Api.gs", "Acct.gs", "Pay.gs",
          "Pub.gs", "Shop.gs", "Import.gs"]

# ก้อนย่อยของไฟล์1 สำหรับเครื่องที่เปิดไฟล์ 650 KB ไม่ไหว
#
# Apps Script รับไฟล์ .gs ได้หลายไฟล์และต่อกันเป็นสโคปเดียว ฟังก์ชันถูก hoist หมด
# จึงหั่นได้ตราบใดที่ "ไม่หั่นกลางไฟล์ต้นฉบับ" — ตัวแปรระดับบนสุดของทุกไฟล์
# เป็นค่าคงที่ล้วน (ตรวจแล้ว) ไม่มีตัวไหนอ่านค่าจากไฟล์อื่นตอนโหลด ลำดับไฟล์จึงไม่สำคัญ
#
# หั่นกลางไฟล์เมื่อไรถึงจะพัง เพราะฟังก์ชันจะขาดครึ่ง — สคริปต์นี้จึงหั่นได้แค่ตามรายชื่อ
SPLIT = [
    ("1a", ["Sheets.gs", "Fefo.gs", "Doc.gs", "Acct.gs", "Import.gs"]),
    ("1b", ["Api.gs"]),
    ("1c", ["Setup.gs"]),
    ("1d", ["Pay.gs", "Pub.gs", "Shop.gs"]),
]


def main():
    out = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "out" / "bundle"
    out.mkdir(parents=True, exist_ok=True)

    # ---- Code.gs ----
    parts = ["""/* ============================================================================
 * AST — ระบบคีย์ออเดอร์และตัดสต๊อก (โค้ดฝั่งเซิร์ฟเวอร์ทั้งหมดรวมไว้ไฟล์เดียว)
 *
 * ไฟล์นี้ถูกสร้างจาก apps-script/ ด้วย tools/bundle.py — อย่าแก้ที่นี่
 * ถ้าจะแก้ ให้แก้ไฟล์ต้นฉบับแล้วสั่ง bundle ใหม่ ไม่งั้นแก้แล้วหายตอน bundle รอบหน้า
 * ============================================================================ */
"""]
    for name in SERVER:
        body = (GS / name).read_text(encoding="utf-8").rstrip()
        parts.append("\n\n/* ==================== %s ==================== */\n\n%s\n" % (name, body))
    code = "".join(parts)
    (out / "Code.gs").write_text(code, encoding="utf-8")

    # ---- Pub.html (ไฟล์4) ----
    # หน้าลูกค้าเป็นไฟล์แยกโดยตั้งใจ ไม่รวมเข้า Index.html
    # เพราะ Index.html คือหลังร้านทั้งก้อน ส่งไปถึงเครื่องลูกค้าไม่ได้
    (out / "Pub.html").write_text(
        (GS / "Pub.html").read_text(encoding="utf-8"), encoding="utf-8")

    # ---- Backup.gs (ไฟล์3) ----
    # ไม่รวมเข้า Code.gs โดยตั้งใจ — ตัวสำรองต้องยืนอยู่ได้ลำพัง
    # แต่ต้องก๊อปมาไว้ที่เดียวกัน ไม่งั้นของที่ส่งให้เจ้าของร้านจะมีไฟล์เก่าปนมา
    (out / "Backup.gs").write_text(
        (GS / "Backup.gs").read_text(encoding="utf-8"), encoding="utf-8")

    # ชื่อไฟล์รุ่นเก่าที่เลิกใช้แล้ว ถ้าปล่อยค้างไว้จะถูกหยิบส่งให้เจ้าของร้านผิดตัว
    # (โฟลเดอร์ out/ เป็นของที่สร้างใหม่ได้เสมอ ไม่ได้อยู่ใน git)
    for stale in ("ไฟล์1-Code-gs.txt", "ไฟล์2-Index-html.txt", "ไฟล์3-Backup-gs.txt"):
        old = out / stale
        if old.exists():
            old.unlink()
            print("  ลบไฟล์ชื่อเก่าที่ค้างอยู่: %s" % stale)

    # ---- Index.html ----
    index = (GS / "Index.html").read_text(encoding="utf-8")

    def sub(m):
        name = m.group(1)
        return ("\n<!-- ==================== %s ==================== -->\n%s"
                % (name, (GS / (name + ".html")).read_text(encoding="utf-8")))

    page, n = re.subn(r"<\?!=\s*include_\('(\w+)'\);?\s*\?>", sub, index)
    if n == 0:
        sys.exit("ไม่เจอ include_() ใน Index.html — โครงไฟล์เปลี่ยนไป")
    # หมายเหตุต้องอยู่ "หลัง" <!DOCTYPE html> — อะไรก็ตามที่มาก่อนหัวเอกสาร
    # ทำให้เบราว์เซอร์เก่าตกไปโหมด quirks แล้วหน้าจอเพี้ยน
    note = ("\n<!-- สร้างจาก apps-script/ ด้วย tools/bundle.py — อย่าแก้ที่นี่\n"
            "     แก้ที่ไฟล์ต้นฉบับแล้วสั่ง bundle ใหม่ -->")
    page, k = re.subn(r"<!DOCTYPE html>", lambda m: m.group(0) + note, page, count=1)
    if not k:
        sys.exit("ไม่เจอ <!DOCTYPE html> ใน Index.html — หัวเอกสารหายไป")
    (out / "Index.html").write_text(page, encoding="utf-8")

    # ---- appsscript.json ----
    (out / "appsscript.json").write_text(
        (GS / "appsscript.json").read_text(encoding="utf-8"), encoding="utf-8")

    # ---- ไฟล์ที่ส่งให้เจ้าของร้านก๊อปไปวาง ----
    # เจ้าของร้านวางทีละไฟล์ตามหมายเลข ก่อนหน้านี้ผมก๊อปด้วยมือทุกครั้ง
    # ซึ่งลืมได้ และลืมไปแล้วจริง (4-Pub.txt เคยค้างอยู่รุ่นเก่าหนึ่งวันเต็ม)
    # ไฟล์ที่ค้างรุ่นเก่าคือไฟล์ที่วางไปแล้วไม่มีอะไรเปลี่ยน แล้วไม่มีใครรู้ว่าทำไม
    HAND = [("1-Code.txt", "Code.gs"), ("2-Index.txt", "Index.html"),
            ("3-appsscript.txt", "appsscript.json"), ("4-Pub.txt", "Pub.html"),
            ("5-Backup.txt", "Backup.gs")]
    for txt, src in HAND:
        (out.parent / txt).write_text((out / src).read_text(encoding="utf-8"),
                                      encoding="utf-8")
    # เลขเดิมของไฟล์สำรอง ตอนนี้เลข 3 เป็น appsscript.json แล้ว
    # ถ้าปล่อยค้างไว้ เจ้าของร้านจะวางไฟล์ผิดตัวลงช่องผิด
    old3 = out.parent / "3-Backup.txt"
    if old3.exists():
        old3.unlink()
        print("  ลบไฟล์เลขเก่าที่ค้างอยู่: 3-Backup.txt")

    # ---- ไฟล์1 แบบหั่นเป็นก้อนย่อย ----
    # ที่ต้องมี: เจ้าของร้านเปิดไฟล์ 650 KB บนเครื่องไม่ได้ และเคยวางแล้วขาด
    # เหลือ 91 บรรทัดจาก 10,258 โดยไม่มีอะไรเตือน รู้ตัวตอน SyntaxError
    # ก้อนเล็กลงแปลว่าวางพลาดก็เสียแค่ก้อนเดียว ไม่ต้องเริ่มใหม่ทั้งก้อน
    seen = []
    for tag, names in SPLIT:
        # ส่วนแรกต้องทับไฟล์เดิม ไม่ใช่สร้างไฟล์ใหม่
        # ถ้าปล่อยโค้ดชุดเก่าค้างไว้ในไฟล์เดิม จะมีฟังก์ชันชื่อซ้ำสองชุดในโปรเจกต์เดียว
        # แล้วชุดไหนชนะขึ้นกับลำดับไฟล์ ซึ่งคุมไม่ได้ — พังแบบหาสาเหตุไม่เจอ
        where = ("วางทับของเดิมในไฟล์  รหัส.gs.gs  (กด Ctrl+A ลบให้เกลี้ยงก่อน)"
                 if tag == SPLIT[0][0] else
                 "สร้างไฟล์ใหม่ชื่อ  รหัส%s  แล้ววางลงไป" % tag)
        head = ("/* ============================================================================\n"
                " * AST — ไฟล์1 ส่วน %s จาก %d ส่วน\n"
                " *\n"
                " * %s\n"
                " *\n"
                " * ต้องวางให้ครบทั้ง %d ส่วน ระบบถึงจะทำงาน\n"
                " * ขาดส่วนไหนจะขึ้นว่า \"ไม่พบฟังก์ชัน ...\" ตอนกดใช้งาน\n"
                " *\n"
                " * สร้างจาก apps-script/ ด้วย tools/bundle.py — อย่าแก้ที่นี่\n"
                " * ============================================================================ */\n"
                % (tag, len(SPLIT), where, len(SPLIT)))
        body = [head]
        for name in names:
            src = (GS / name).read_text(encoding="utf-8").rstrip()
            body.append("\n\n/* ==================== %s ==================== */\n\n%s\n" % (name, src))
            seen.append(name)
        (out.parent / ("1%s-Code.txt" % tag[1:])).write_text("".join(body), encoding="utf-8")

    # ทุกไฟล์ต้องอยู่ในก้อนใดก้อนหนึ่งพอดีหนึ่งครั้ง ไม่งั้นของหายหรือซ้ำเงียบ ๆ
    if sorted(seen) != sorted(SERVER):
        sys.exit("SPLIT ไม่ครบหรือซ้ำ: ขาด %s · เกิน %s"
                 % (sorted(set(SERVER) - set(seen)), sorted(set(seen) - set(SERVER))))

    def kb(p):
        return len(p.read_text(encoding="utf-8").encode("utf-8")) / 1024

    print("รวมไฟล์เสร็จ → %s" % out)
    print("  Code.gs          %7.0f KB  (รวม %d ไฟล์: %s)" % (kb(out / "Code.gs"), len(SERVER), ", ".join(SERVER)))
    print("  Index.html       %7.0f KB  (รวมหน้าจอ %d ส่วน)" % (kb(out / "Index.html"), n))
    print("  appsscript.json  %7.1f KB" % kb(out / "appsscript.json"))
    print("  ไฟล์สำหรับก๊อปไปวาง → %s" % out.parent)
    for txt, src in HAND:
        print("    %-18s %7.0f KB  (= %s)" % (txt, kb(out.parent / txt), src))
    print("  ไฟล์1 แบบหั่นย่อย (ใช้แทนไฟล์1 ได้ทั้งชุด สำหรับเครื่องที่เปิดไฟล์ใหญ่ไม่ไหว)")
    for tag, names in SPLIT:
        f = out.parent / ("1%s-Code.txt" % tag[1:])
        print("    %-18s %7.0f KB  (= %s)" % (f.name, kb(f), ", ".join(names)))


if __name__ == "__main__":
    main()
