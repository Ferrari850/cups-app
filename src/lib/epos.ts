/**
 * Direct Wi-Fi printing to an Epson TM printer (e.g. TM-m30III) with ePOS-Print XML.
 * The tablet's browser posts the ticket straight to the printer: no cable, no driver, no print dialog.
 *
 * One-time setup per tablet: open https://<printer-ip> in the tablet's browser and accept the
 * printer's certificate, so the browser lets the app talk to it.
 * Printers print Latin text natively; Arabic names are left out of the Wi-Fi ticket
 * (the browser receipt still shows them).
 */

export type Ticket = {
  cafe: string;
  title: string; // "TAX INVOICE" or "RECEIPT"
  trn?: string | null;
  address?: string | null;
  invoice: string;
  ticket: number;
  date: string;
  channel: string;
  car?: string | null;
  lines: { qty: number; name: string; mods: string[]; total: string; note?: string | null }[];
  total: string;
  vat: string;
  net: string;
  payments: { label: string; amount: string }[];
  footer?: string | null;
};

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]!);

/** Printers here are 48 characters wide (80 mm paper, font A). */
const W = 48;
const latin = (s: string) => s.replace(/[^\x20-\x7E]/g, "").replace(/\s+/g, " ").trim();
const row = (left: string, right: string, width = W) => {
  const r = latin(right);
  const l = latin(left).slice(0, Math.max(0, width - r.length - 1));
  return l + " ".repeat(Math.max(1, width - l.length - r.length)) + r;
};

export function ticketXml(tk: Ticket) {
  const t = (s: string, attrs = "") => `<text${attrs}>${esc(s)}&#10;</text>`;
  const parts: string[] = [
    '<text lang="en" smooth="true"/>',
    '<text align="center"/>',
    '<text dw="true" dh="true"/>',
    t(latin(tk.cafe)),
    '<text dw="false" dh="false"/>',
    tk.address ? t(latin(tk.address)) : "",
    tk.trn ? t(`TRN ${latin(tk.trn)}`) : "",
    t(tk.title),
    '<feed line="1"/>',
    '<text dw="true" dh="true"/>',
    t(`#${tk.ticket}`),
    '<text dw="false" dh="false"/>',
    '<text align="left"/>',
    t(row(tk.invoice, tk.date)),
    t(row(tk.channel, tk.car ? latin(tk.car) : "")),
    t("-".repeat(W)),
  ];
  for (const l of tk.lines) {
    parts.push(t(row(`${l.qty} x ${l.name}`, l.total)));
    for (const m of l.mods) parts.push(t(`   + ${latin(m)}`));
    if (l.note) parts.push(t(`   * ${latin(l.note)}`));
  }
  parts.push(
    t("-".repeat(W)),
    '<text dw="true"/>',
    t(row("TOTAL AED", tk.total, W / 2)),
    '<text dw="false"/>',
    t(row("Net (excl. VAT)", tk.net)),
    t(row("VAT 5%", tk.vat)),
    ...tk.payments.map((p) => t(row(p.label, p.amount))),
    '<feed line="1"/>',
    '<text align="center"/>',
    tk.footer ? t(latin(tk.footer)) : "",
    '<feed line="2"/>',
    '<cut type="feed"/>',
  );
  return (
    '<?xml version="1.0" encoding="utf-8"?>' +
    '<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body>' +
    '<epos-print xmlns="http://www.epson-pos.com/schemas/2011/03/epos-print">' +
    parts.filter(Boolean).join("") +
    "</epos-print></s:Body></s:Envelope>"
  );
}

export async function eposPrint(ip: string, xml: string): Promise<{ ok: boolean; error?: string }> {
  const url = `https://${ip.trim()}/cgi-bin/epos/service.cgi?devid=local_printer&timeout=10000`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "text/xml; charset=utf-8", SOAPAction: '""' },
      body: xml,
      signal: AbortSignal.timeout(12000),
    });
    const body = await res.text();
    if (/success="true"/.test(body)) return { ok: true };
    const code = body.match(/code="([^"]*)"/)?.[1];
    return { ok: false, error: code || `HTTP ${res.status}` };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
