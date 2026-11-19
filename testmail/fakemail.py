"""Fake IMAP + SMTP servers for local Roundcube skin testing.

- IMAP on 127.0.0.1:1143, any username/password accepted (try test / test123)
- SMTP on 127.0.0.1:1587, accepts everything, saves sent mail to sent/
- 3 sample messages so the mailbox UI has something to render
Run: python testmail/fakemail.py
"""
import base64
import datetime
import email.utils
import os
import re
import socket
import threading
import time

HOST = "127.0.0.1"
IMAP_PORT = 1143
SMTP_PORT = 1587
BASE = os.path.dirname(os.path.abspath(__file__))

import base64 as _b64

UIDVALIDITY = 2

def _addr_tuple(name, addr):
    user, _, host = addr.partition("@")
    return f'(("{name}" NIL "{user}" "{host}"))'

def make_msg(mid, name, addr, subject, body, flags=None, html=False, attachments=None, days_ago=None, encoded_subject=None):
    ts = time.time() - (days_ago if days_ago is not None else mid) * 86400
    date = email.utils.formatdate(ts, localtime=True)
    internaldate = datetime.datetime.fromtimestamp(ts).astimezone().strftime("%d-%b-%Y %H:%M:%S %z")
    subj_hdr = encoded_subject if encoded_subject else subject
    ctype = "text/html" if html else "text/plain"
    if attachments:
        boundary = f"====fakemail{mid}===="
        parts = [f"--{boundary}"]
        parts.append(f"Content-Type: {ctype}; charset=UTF-8\r\nContent-Transfer-Encoding: 7bit\r\n\r\n" + body)
        parts_map = {
            "1": body.encode("utf-8"),
            "1.MIME": f"Content-Type: {ctype}; charset=UTF-8\r\nContent-Transfer-Encoding: 7bit\r\n\r\n".encode("utf-8"),
        }
        for idx, (fname, mime, data) in enumerate(attachments, start=2):
            blob = _b64.b64encode(data).decode()
            parts.append(f"--{boundary}\r\nContent-Type: {mime}; name=\"{fname}\"\r\nContent-Transfer-Encoding: base64\r\nContent-Disposition: attachment; filename=\"{fname}\"\r\n\r\n" + blob)
            parts_map[str(idx)] = blob.encode("utf-8")
            parts_map[f"{idx}.MIME"] = f'Content-Type: {mime}; name="{fname}"\r\nContent-Transfer-Encoding: base64\r\nContent-Disposition: attachment; filename="{fname}"\r\n\r\n'.encode("utf-8")
        parts.append(f"--{boundary}--")
        payload = "\r\n".join(parts)
        raw = (
            f"From: {name} <{addr}>\r\nTo: test@localhost\r\nSubject: {subj_hdr}\r\n"
            f"Date: {date}\r\nMessage-ID: <msg{mid}@localhost>\r\n"
            f"MIME-Version: 1.0\r\nContent-Type: multipart/mixed; boundary=\"{boundary}\"\r\n\r\n" + payload
        ).encode("utf-8")
        sub_parts = [f'("text" "{"html" if html else "plain"}" ("charset" "UTF-8") NIL NIL "7bit" {len(body.encode())} 6)']
        for fname, mime, data in attachments:
            main, _, sub = mime.partition("/")
            sub_parts.append(f'("{main}" "{sub}" ("name" "{fname}") NIL NIL "base64" {len(_b64.b64encode(data))})')
        structure = "(" + "".join(sub_parts) + f' "mixed" ("boundary" "{boundary}") NIL NIL NIL)'
    else:
        raw = (
            f"From: {name} <{addr}>\r\nTo: test@localhost\r\nSubject: {subj_hdr}\r\n"
            f"Date: {date}\r\nMessage-ID: <msg{mid}@localhost>\r\n"
            f"MIME-Version: 1.0\r\nContent-Type: {ctype}; charset=UTF-8\r\n\r\n" + body
        ).encode("utf-8")
        parts_map = {
            "1": body.encode("utf-8"),
            "1.MIME": f"Content-Type: {ctype}; charset=UTF-8\r\n\r\n".encode("utf-8"),
        }
        structure = f'("text" "{"html" if html else "plain"}" ("charset" "UTF-8") NIL NIL "7bit" {len(body.encode("utf-8"))} 6)'
    return {"id": mid, "uid": mid, "flags": list(flags or []), "date": date, "internaldate": internaldate,
            "raw": raw, "parts": parts_map,
            "subject": subject, "env_subject": encoded_subject or subject,
            "name": name, "user": addr.partition("@")[0], "host": addr.partition("@")[2],
            "structure": structure}

def _enc(text):
    return "=?UTF-8?B?" + _b64.b64encode(text.encode("utf-8")).decode() + "?="

MESSAGES = [
    make_msg(1, "Roundcube Demo", "demo@company.vn", "Chao mung den Roundcube (local)",
             "<h2>Chao mung!</h2><p>Day la <b>mail HTML mau</b> de test trinh hien thi: bang bieu, link, dinh dang.</p>"
             "<table border='1' cellpadding='6'><tr><th>Hang muc</th><th>Trang thai</th></tr>"
             "<tr><td>Login</td><td>OK</td></tr><tr><td>Danh sach mail</td><td>OK</td></tr>"
             "<tr><td>Soan thao (TinyMCE)</td><td>OK</td></tr></table><p><a href='https://example.com'>Link mau</a></p>",
             flags=[], html=True, days_ago=0),
    make_msg(2, "HR", "hr@company.vn", "Thong bao lich nghi Tet Nguyen Dan 2027 (du kien)",
             "Chao cac ban,\r\nPhong HCNS gui lich nghi Tet du kien.\r\nMail nay co tieu de dai de test xuong dong ngoai danh sach.",
             flags=[], days_ago=1),
    make_msg(3, "Sep", "sep@company.vn", "URGENT: duyet thiet ke giao dien truoc 17h hom nay",
             "Em oi,\r\nDuyet giup anh ban thiet ke moi truoc 17h hom nay nhe.",
             flags=["\\Flagged"], days_ago=2),
    make_msg(4, "Dev Team", "dev@company.vn", "Re: Re: Re: Reskin Elastic theme - chot mau chu dao",
             "> On Mon: chon mau xanh duong\r\n> On Tue: doi sang mau cam\r\nChot lai: giu mau xanh duong, nut cam cho CTA.\r\nMail dang chuoi hoi dap de test che do thread.",
             flags=["\\Seen", "\\Answered"], days_ago=3),
    make_msg(5, "Ke toan", "ketoan@company.vn", "Gui bao cao tuan 47 (kem file dinh kem)",
             "Gui anh/chi file bao cao tuan.\r\nMail nay co file dinh kem de test icon attachment.",
             flags=["\\Seen"], days_ago=4,
             attachments=[("bao-cao-tuan-47.txt", "text/plain", "Bao cao tuan 47\n- Doanh thu: 1.2 ty\n- Chi phi: 800 tr\n".encode("utf-8"))]),
    make_msg(6, "Marketing", "mkt@company.vn", "subject",  # replaced below with unicode
             "Noi dung co dau de test unicode: khuyen mai, uu dai, dong gia.\r\nMa giam gia: SKIN2026.",
             flags=["\\Seen"], days_ago=5,
             encoded_subject=_enc("Khuyen mai thang 11 - uu dai 50% goi thiet ke")),
    make_msg(7, "He thong", "no-reply@company.vn", "Log he thong ngay (mail dung luong lon)",
             ("Dong log mau de test hien thi mail dai.\r\n" + "Chi tiet cong viec hoan thanh trong ngay.\r\n") * 400,
             flags=["\\Seen"], days_ago=6),
    make_msg(8, "Ban be", "friend@gmail.com", "Cuoi tuan di ca phe khong?",
             "Cuoi tuan nay ranh khong, di ca phe ban chuyen reskin cho vui.",
             flags=["\\Seen"], days_ago=7),
]

def envelope(m):
    subj = m["env_subject"].replace('"', "'")
    addr = _addr_tuple(m["name"], m["user"] + "@" + m["host"])
    return f'ENVELOPE ("{m["date"]}" "{subj}" {addr} {addr} {addr} (("test" NIL "test" "localhost")) NIL NIL NIL "<msg{m["id"]}@localhost>")'

def flags_str(m):
    return "(" + " ".join(m["flags"]) + ")" if m["flags"] else "()"

def _parse_seq(seq_part, is_uid):
    nums = set()
    max_id = max((m["uid" if is_uid else "id"] for m in MESSAGES), default=1)
    for chunk in seq_part.split(","):
        if ":" in chunk:
            a, b = chunk.split(":", 1)
            try:
                lo = int(a.replace("*", str(max_id)))
                hi = int(b.replace("*", str(max_id)))
                if lo > hi:
                    lo, hi = hi, lo
                nums.update(range(lo, hi + 1))
            except ValueError:
                pass
        else:
            try:
                nums.add(int(chunk.replace("*", str(max_id))))
            except ValueError:
                pass
    return nums


def _filter_headers(hdr_bytes, fields, invert=False):
    wanted = {f.upper() for f in fields}
    lines = hdr_bytes.split(b"\r\n")
    out = []
    keep = False
    for line in lines:
        if line.startswith((b" ", b"\t")):
            if keep:
                out.append(line)
            continue
        name = line.split(b":", 1)[0].strip().decode("ascii", "ignore").upper()
        match = name in wanted
        keep = (not match) if invert else match
        if keep:
            out.append(line)
    return (b"\r\n".join(out) + b"\r\n\r\n") if out else b"\r\n"


def _body_section_bytes(m, section):
    raw = m["raw"]
    hdr_bytes, _, body_bytes = raw.partition(b"\r\n\r\n")
    sec_up = section.strip().upper()
    if sec_up == "":
        return raw
    if sec_up == "HEADER":
        return hdr_bytes + b"\r\n\r\n"
    if sec_up == "TEXT":
        return body_bytes
    match = re.match(r"HEADER\.FIELDS(?:\.NOT)?\s*\(([^)]*)\)$", sec_up)
    if match:
        fields = match.group(1).split()
        return _filter_headers(hdr_bytes, fields, invert=sec_up.startswith("HEADER.FIELDS.NOT"))
    return m["parts"].get(sec_up, b"")


def _write_fetch_response(w, m, arg, is_uid):
    raw = m["raw"]
    hdr_bytes, _, _ = raw.partition(b"\r\n\r\n")
    size = len(raw)
    arg_no_body = re.sub(r"BODY(?:\.PEEK)?\[[^\]]*\](?:<\d+\.\d+>)?", "", arg, flags=re.IGNORECASE)
    upper = arg_no_body.upper()

    chunks = [f'* {m["id"]} FETCH ('.encode("utf-8")]
    first = True

    def add_str(s):
        nonlocal first
        if not first:
            chunks.append(b" ")
        chunks.append(s.encode("utf-8"))
        first = False

    def add_literal(label, data):
        nonlocal first
        if not first:
            chunks.append(b" ")
        chunks.append(f"{label} {{{len(data)}}}\r\n".encode("utf-8"))
        chunks.append(data)
        first = False

    if is_uid or re.search(r"\bUID\b", upper):
        add_str(f'UID {m["uid"]}')
    if re.search(r"\bFLAGS\b", upper):
        add_str(f'FLAGS {flags_str(m)}')
    if re.search(r"\bINTERNALDATE\b", upper):
        add_str(f'INTERNALDATE "{m["internaldate"]}"')
    if re.search(r"\bRFC822\.SIZE\b", upper):
        add_str(f"RFC822.SIZE {size}")
    if re.search(r"\bENVELOPE\b", upper):
        add_str(envelope(m))
    if re.search(r"\bBODYSTRUCTURE\b", upper):
        add_str(f'BODYSTRUCTURE {m["structure"]}')
    elif re.search(r"\bBODY\b", upper):
        add_str(f'BODY {m["structure"]}')
    if re.search(r"\bRFC822\.HEADER\b", upper):
        add_literal("RFC822.HEADER", hdr_bytes + b"\r\n\r\n")
    if re.search(r"\bRFC822\b", upper):
        add_literal("RFC822", raw)

    for bm in re.finditer(r"BODY(?:\.PEEK)?\[([^\]]*)\](?:<(\d+)\.(\d+)>)?", arg, flags=re.IGNORECASE):
        section = bm.group(1)
        data = _body_section_bytes(m, section)
        if bm.group(2) is not None:
            off, ln = int(bm.group(2)), int(bm.group(3))
            data = data[off:off + ln]
            label = f"BODY[{section}]<{off}>"
        else:
            label = f"BODY[{section}]"
        add_literal(label, data)

    if first:
        add_str(f'UID {m["uid"]} FLAGS {flags_str(m)}')

    chunks.append(b")\r\n")
    w.write(b"".join(chunks))
    w.flush()


# ---------------- IMAP ----------------
def send_line(w, s):
    if isinstance(s, str):
        s = s.encode("utf-8")
    w.write(s + b"\r\n")
    w.flush()

def handle_imap(conn):
    r = conn.makefile("rb")
    w = conn.makefile("wb")
    send_line(w, "* OK fakemail IMAP ready")
    selected = False
    while True:
        line = r.readline()
        if not line:
            break
        try:
            text = line.decode("utf-8", "replace").strip()
        except Exception:
            break
        if not text:
            continue
        parts = text.split(None, 2)
        if len(parts) < 2:
            continue
        tag, cmd = parts[0], parts[1].upper()
        arg = parts[2] if len(parts) > 2 else ""
        # UID prefix
        if cmd == "UID" and arg:
            sub = arg.split(None, 1)
            cmd = "UID_" + sub[0].upper()
            arg = sub[1] if len(sub) > 1 else ""
        if cmd in ("CAPABILITY",):
            send_line(w, "* CAPABILITY IMAP4rev1 UIDPLUS CHILDREN NAMESPACE AUTH=PLAIN")
            send_line(w, f"{tag} OK CAPABILITY done")
        elif cmd in ("NOOP", "CHECK"):
            send_line(w, f"{tag} OK done")
        elif cmd == "LOGIN":
            send_line(w, f"{tag} OK LOGIN completed")
        elif cmd == "AUTHENTICATE":
            mech = arg.split()[0].upper() if arg.split() else ""
            if mech == "PLAIN" and len(arg.split()) > 1:
                send_line(w, f"{tag} OK AUTHENTICATE completed")
            elif mech in ("PLAIN", "LOGIN"):
                send_line(w, "+ ")
                r.readline()
                if mech == "LOGIN":
                    send_line(w, "+ UGFzc3dvcmQ6 ")
                    r.readline()
                send_line(w, f"{tag} OK AUTHENTICATE completed")
            else:
                send_line(w, f"{tag} NO unsupported mechanism")
        elif cmd == "LOGOUT":
            send_line(w, "* BYE bye")
            send_line(w, f"{tag} OK LOGOUT done")
            break
        elif cmd in ("LIST", "LSUB"):
            send_line(w, '* LIST (\\HasNoChildren) "/" "INBOX"')
            send_line(w, '* LIST (\\HasNoChildren) "/" "Sent"')
            send_line(w, '* LIST (\\HasNoChildren) "/" "Drafts"')
            send_line(w, f"{tag} OK LIST done")
        elif cmd == "STATUS":
            n = len(MESSAGES)
            unseen = sum(1 for m in MESSAGES if "\\Seen" not in m["flags"])
            send_line(w, f'* STATUS INBOX (MESSAGES {n} RECENT 0 UIDNEXT {n+1} UIDVALIDITY {UIDVALIDITY} UNSEEN {unseen})')
            send_line(w, f"{tag} OK STATUS done")
        elif cmd in ("SELECT", "EXAMINE"):
            selected = True
            n = len(MESSAGES)
            send_line(w, f"* FLAGS (\\Answered \\Flagged \\Deleted \\Seen \\Draft)")
            send_line(w, f"* {n} EXISTS")
            send_line(w, "* 0 RECENT")
            send_line(w, "* OK [UIDVALIDITY {0}]".format(UIDVALIDITY))
            send_line(w, f"* OK [UIDNEXT {n+1}]")
            send_line(w, f"{tag} OK [READ-WRITE] SELECT done")
        elif cmd in ("SEARCH", "UID_SEARCH"):
            ids = " ".join(str(m["uid" if cmd.startswith("UID") else "id"]) for m in MESSAGES)
            send_line(w, f"* SEARCH {ids}")
            send_line(w, f"{tag} OK SEARCH done")
        elif cmd in ("FETCH", "UID_FETCH"):
            is_uid = cmd.startswith("UID")
            seq_part, _, rest = arg.partition(" ")
            nums = _parse_seq(seq_part or "1", is_uid)
            for m in MESSAGES:
                key = m["uid"] if is_uid else m["id"]
                if key not in nums and seq_part != "1:*" and "*" not in seq_part:
                    if len(nums) and key not in nums:
                        continue
                _write_fetch_response(w, m, rest, is_uid)
            send_line(w, f"{tag} OK FETCH done")
        elif cmd in ("STORE", "UID_STORE"):
            is_uid = cmd.startswith("UID")
            parts_s = arg.split(None, 2)
            if len(parts_s) >= 3:
                nums = _parse_seq(parts_s[0], is_uid)
                op = parts_s[1].upper()
                new_flags = parts_s[2].strip().strip("()").split()
                for m in MESSAGES:
                    key = m["uid"] if is_uid else m["id"]
                    if key in nums:
                        if op.startswith("+FLAGS"):
                            for fl in new_flags:
                                if fl not in m["flags"]:
                                    m["flags"].append(fl)
                        elif op.startswith("-FLAGS"):
                            m["flags"] = [fl for fl in m["flags"] if fl not in new_flags]
                        elif op.startswith("FLAGS"):
                            m["flags"] = list(new_flags)
                        if ".SILENT" not in op:
                            send_line(w, f'* {m["id"]} FETCH (UID {m["uid"]} FLAGS {flags_str(m)})')
            send_line(w, f"{tag} OK STORE done")
        elif cmd in ("CLOSE", "EXPUNGE", "COPY", "CREATE", "SUBSCRIBE", "GETQUOTA", "GETQUOTAROOT", "NAMESPACE", "IDLE", "ENABLE", "THREAD"):
            if cmd == "NAMESPACE":
                send_line(w, '* NAMESPACE (("" "/")) NIL NIL')
            send_line(w, f"{tag} OK done")
        else:
            send_line(w, f"{tag} BAD unknown command {cmd}")
    try:
        conn.close()
    except Exception:
        pass

def imap_loop():
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    s.bind((HOST, IMAP_PORT))
    s.listen(20)
    print(f"IMAP listening on {HOST}:{IMAP_PORT}", flush=True)
    while True:
        c, _ = s.accept()
        threading.Thread(target=handle_imap, args=(c,), daemon=True).start()

# ---------------- SMTP ----------------
def smtp_line(w, s):
    w.write(s.encode() + b"\r\n")
    w.flush()

def handle_smtp(conn):
    r = conn.makefile("rb")
    w = conn.makefile("wb")
    smtp_line(w, "220 fakemail SMTP ready")
    data_mode = False
    buf = []
    while True:
        line = r.readline()
        if not line:
            break
        try:
            text = line.decode("utf-8", "replace")
        except Exception:
            break
        if data_mode:
            if text.strip() == ".":
                data_mode = False
                os.makedirs(os.path.join(BASE, "sent"), exist_ok=True)
                with open(os.path.join(BASE, "sent", f"mail-{int(time.time())}.eml"), "w", encoding="utf-8") as f:
                    f.write("".join(buf))
                buf = []
                smtp_line(w, "250 OK queued")
            else:
                buf.append(text)
            continue
        up = text.strip().upper()
        if up.startswith("EHLO") or up.startswith("HELO"):
            smtp_line(w, "250-fakemail")
            smtp_line(w, "250 AUTH LOGIN PLAIN")
        elif up.startswith("AUTH"):
            smtp_line(w, "235 OK authenticated")
            # consume possible LOGIN challenge lines blindly
        elif up.startswith("MAIL FROM") or up.startswith("RCPT TO") or up.startswith("RSET") or up.startswith("NOOP"):
            smtp_line(w, "250 OK")
        elif up.startswith("DATA"):
            data_mode = True
            smtp_line(w, "354 End with .")
        elif up.startswith("QUIT"):
            smtp_line(w, "221 Bye")
            break
        else:
            smtp_line(w, "250 OK")
    try:
        conn.close()
    except Exception:
        pass

def smtp_loop():
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    s.bind((HOST, SMTP_PORT))
    s.listen(20)
    print(f"SMTP listening on {HOST}:{SMTP_PORT}", flush=True)
    while True:
        c, _ = s.accept()
        threading.Thread(target=handle_smtp, args=(c,), daemon=True).start()

if __name__ == "__main__":
    threading.Thread(target=imap_loop, daemon=True).start()
    threading.Thread(target=smtp_loop, daemon=True).start()
    print("fakemail running. IMAP test/test123. Ctrl+C to stop.", flush=True)
    try:
        while True:
            time.sleep(3600)
    except KeyboardInterrupt:
        pass
