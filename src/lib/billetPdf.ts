/* =========================================================
   BWEB — Génération du billet de formation en PDF (façon ticket).
   pdf-lib (polices standard embarquées → compatible serverless Vercel,
   pas de fichier de police à charger sur disque) + qrcode (QR PNG).
   ========================================================= */
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import QRCode from "qrcode";
import { LOGO_PNG_B64, BG_PNG_B64 } from "./billetAssets";

export type BilletData = {
  reference: string;
  full_name: string;
  session_title: string;
  session_date?: string | null;
  session_venue?: string | null;
  ticket_name?: string | null;
  quantity?: number;
  amount_paid?: number;
  balance?: number;
  is_deposit?: boolean;
};

/** Remplace les espaces insécables (fine U+202F, normale U+00A0) — non
    encodables en WinAnsi par pdf-lib — par une espace ordinaire. */
const ascii = (s: string) => String(s ?? "").replace(/[  ]/g, " ");
const fmt = (n?: number) => ascii((Number(n) || 0).toLocaleString("fr-FR")) + " F CFA";

/** Hex #rrggbb → rgb() pdf-lib (0..1). */
function hex(h: string) {
  const n = parseInt(h.replace("#", ""), 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

/** Découpe un texte en <=maxLines lignes tenant dans maxWidth. */
function wrap(text: string, font: PDFFont, size: number, maxWidth: number, maxLines: number): string[] {
  const words = ascii(text).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const test = cur ? cur + " " + w : w;
    if (!cur || font.widthOfTextAtSize(test, size) <= maxWidth) cur = test;
    else {
      lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) {
    lines.length = maxLines;
    let last = lines[maxLines - 1];
    while (last && font.widthOfTextAtSize(last + "…", size) > maxWidth) last = last.slice(0, -1);
    lines[maxLines - 1] = last + "…";
  }
  return lines;
}

export async function billetPdfBuffer(b: BilletData): Promise<Buffer> {
  const isDeposit = !!b.is_deposit && Number(b.balance) > 0;
  const accent = isDeposit ? "#f0a500" : "#00c89e";
  const navy = "#050a3a";
  const white = "#ffffff";
  const muted = "#8b94c8";
  const lilac = "#aeb8ec";

  // QR encodant la référence (code d'entrée, vérifié à l'accueil).
  const qrPng = await QRCode.toBuffer(b.reference, {
    margin: 0,
    width: 240,
    color: { dark: "#050a3aff", light: "#ffffffff" },
  });

  const W = 580;
  const H = 250;
  const doc = await PDFDocument.create();
  doc.setTitle(`Billet ${b.reference} — Bweb Agence`);
  const page: PDFPage = doc.addPage([W, H]);

  const helv = await doc.embedFont(StandardFonts.Helvetica);
  const helvB = await doc.embedFont(StandardFonts.HelveticaBold);
  const cour = await doc.embedFont(StandardFonts.Courier);
  const courB = await doc.embedFont(StandardFonts.CourierBold);
  const qrImg = await doc.embedPng(qrPng);
  const bgImg = await doc.embedPng(Buffer.from(BG_PNG_B64, "base64"));
  const logoImg = await doc.embedPng(Buffer.from(LOGO_PNG_B64, "base64"));

  // Helpers en coordonnées "haut-gauche" (converties vers le repère PDF bas-gauche).
  const rect = (
    x: number,
    top: number,
    w: number,
    h: number,
    o: { color?: string; border?: string; borderW?: number } = {}
  ) =>
    page.drawRectangle({
      x,
      y: H - top - h,
      width: w,
      height: h,
      ...(o.color ? { color: hex(o.color) } : {}),
      ...(o.border ? { borderColor: hex(o.border), borderWidth: o.borderW ?? 1 } : {}),
    });
  const text = (
    s: string,
    x: number,
    top: number,
    o: { size?: number; font?: PDFFont; color?: string; right?: number; center?: number } = {}
  ) => {
    const size = o.size ?? 10;
    const font = o.font ?? helv;
    s = ascii(s);
    let px = x;
    if (o.right !== undefined) px = o.right - font.widthOfTextAtSize(s, size);
    if (o.center !== undefined) px = o.center - font.widthOfTextAtSize(s, size) / 2;
    page.drawText(s, { x: px, y: H - top - size, size, font, color: hex(o.color ?? navy) });
  };

  // --- Fond + billet ---
  rect(0, 0, W, H, { color: white });
  const pad = 18;
  const tX = pad,
    tY = pad,
    tW = W - pad * 2,
    tH = H - pad * 2;
  const stubW = 150;
  const perfX = tX + tW - stubW;
  // Fond du billet : dégradé + halos + texture (image), repli navy dessous.
  rect(tX, tY, tW, tH, { color: navy });
  page.drawImage(bgImg, { x: tX, y: H - tY - tH, width: tW, height: tH });

  // Perforation (ligne pointillée verticale).
  page.drawLine({
    start: { x: perfX, y: H - (tY + 12) },
    end: { x: perfX, y: H - (tY + tH - 12) },
    thickness: 1,
    color: hex(white),
    opacity: 0.4,
    dashArray: [4, 4],
  });

  // --- Corps ---
  const bx = tX + 22;
  const bRight = perfX - 16;
  const bw = bRight - bx;

  // Logo (marque) en tête du billet.
  const logoH = 13;
  const logoW = (logoImg.width / logoImg.height) * logoH;
  page.drawImage(logoImg, { x: bx, y: H - (tY + 16) - logoH, width: logoW, height: logoH });

  let top = tY + 39;

  text("— BILLET DE FORMATION", bx, top, { size: 8, font: courB, color: accent });
  top += 15;

  const titleLines = wrap(b.session_title, helvB, 15, bw, 2);
  for (const ln of titleLines) {
    text(ln, bx, top, { size: 15, font: helvB, color: white });
    top += 18;
  }
  top += 2;

  if (b.ticket_name) {
    text(`${b.quantity || 1}× ${b.ticket_name}`, bx, top, { size: 9, font: helv, color: lilac });
    top += 15;
  } else {
    top += 4;
  }

  const rowGap = 15;
  const row = (k: string, v: string) => {
    text(k, bx, top, { size: 9, font: helv, color: muted });
    for (const ln of wrap(v, helvB, 9.5, bw - 78, 1)) text(ln, 0, top, { size: 9.5, font: helvB, color: white, right: bRight });
    top += rowGap;
  };
  if (b.session_date) row("Date", b.session_date);
  if (b.session_venue) row("Lieu", b.session_venue);
  row("Participant", b.full_name);

  // Bandeau de statut.
  top += 6;
  const bandH = 30;
  rect(bx, top, bw, bandH, { border: accent, borderW: 1 });
  text(isDeposit ? "ACOMPTE · 50 %" : "PAYÉ", bx + 11, top + 11, { size: 9, font: courB, color: accent });
  text(fmt(b.amount_paid), 0, top + 8, { size: 13, font: courB, color: white, right: bx + bw - 11 });
  top += bandH + 8;

  if (isDeposit) {
    text(`Solde de ${fmt(b.balance)} à régler sur place le jour J.`, bx, top, { size: 8, font: helv, color: accent });
  } else {
    text("Rien à régler sur place · rappel envoyé la veille.", bx, top, { size: 8, font: helv, color: muted });
  }

  // --- Talon (QR + code) ---
  const cx = perfX + stubW / 2;
  const qrSize = 92;
  const qrTop = tY + 22;
  const qrX = perfX + (stubW - qrSize) / 2;
  rect(qrX - 6, qrTop - 6, qrSize + 12, qrSize + 12, { color: white });
  page.drawImage(qrImg, { x: qrX, y: H - qrTop - qrSize, width: qrSize, height: qrSize });

  let sTop = qrTop + qrSize + 14;
  text("CODE D'ENTRÉE", 0, sTop, { size: 7, font: courB, color: accent, center: cx });
  sTop += 13;
  text(b.reference, 0, sTop, { size: 14, font: courB, color: white, center: cx });
  sTop += 20;
  text("ADMIS · 1", 0, sTop, { size: 7, font: cour, color: muted, center: cx });

  const bytes = await doc.save();
  return Buffer.from(bytes);
}
