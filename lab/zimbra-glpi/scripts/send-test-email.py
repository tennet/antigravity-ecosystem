#!/usr/bin/env python3
"""
Test email generator per validare il flusso Email-to-Ticket (GLPI Mailgate).
Supporta GreenMail (porta 3025) e Zimbra (porta 2525 o 25).
"""

import sys
import smtplib
from email.message import EmailMessage
import argparse
import datetime

def send_test_ticket(smtp_host, smtp_port, sender, recipient, subject, body):
    msg = EmailMessage()
    msg['Subject'] = subject
    msg['From'] = sender
    msg['To'] = recipient
    msg.set_content(body)

    print(f"[*] Invio email a {smtp_host}:{smtp_port}...")
    print(f"    From: {sender}")
    print(f"    To: {recipient}")
    print(f"    Subject: {subject}")

    try:
        with smtplib.SMTP(smtp_host, smtp_port, timeout=10) as server:
            server.send_message(msg)
        print("[+] Email inviata con successo! Il demone cron di GLPI elaborerà il ticket entro 60 secondi.")
    except Exception as e:
        print(f"[-] Errore durante l'invio SMTP: {e}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Invia una email di test per GLPI Mailgate")
    parser.add_argument("--host", default="localhost", help="Host SMTP (default: localhost)")
    parser.add_argument("--port", type=int, default=3025, help="Porta SMTP (default 3025 per mock, 2525 per zimbra)")
    parser.add_argument("--from-addr", default="user1@lab.local", help="Mittente (default: user1@lab.local)")
    parser.add_argument("--to-addr", default="support@lab.local", help="Destinatario GLPI (default: support@lab.local)")
    parser.add_argument("--subject", default=f"[Incident] Stampante piano 2 offline - {datetime.datetime.now().strftime('%H:%M:%S')}")
    parser.add_argument("--body", default="Salve Supporto,\n\nLa stampante dipartimentale del piano 2 non risponde sulla rete.\nSi richiede assistenza.\n\nCordiali saluti,\nUser 1")

    args = parser.parse_args()
    send_test_ticket(args.host, args.port, args.from_addr, args.to_addr, args.subject, args.body)
