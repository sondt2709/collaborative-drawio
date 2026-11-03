/**
 * Text width estimates for Helvetica-like fonts, in 1/1000 em (from the
 * standard Helvetica metrics). dgm uses no browser, so the layout stays
 * deterministic.
 */
const W: Record<string, number> = {};
const set = (chars: string, w: number) => {
  for (const c of chars) W[c] = w;
};
set(' !,./:;I[\\]ft', 278);
set('ijl', 222);
set('|', 260);
set("'", 191);
set('"', 355);
set('()-`r', 333);
set('*', 389);
set('^', 469);
set('J', 500);
set('cksvxyz', 500);
set('#$0123456789?_abdeghnopqu', 556);
set('+<=>~', 584);
set('FTZ', 611);
set('ABEKPSVXY&', 667);
set('CDHNRUw', 722);
set('GOQ', 778);
set('Mm', 833);
set('%', 889);
set('W', 944);
set('@', 1015);
set('{}', 334);
set('·•', 278);
set('–', 556);
set('—', 1000);

function charWidth(c: string): number {
  const w = W[c];
  if (w !== undefined) return w;
  const code = c.codePointAt(0) ?? 0;
  // CJK, Hangul, full-width forms and emoji take about one em.
  if (code >= 0x2e80) return 1000;
  return 556;
}

/** Estimated width in px of one line of text. */
export function lineWidth(text: string, fontSize: number, bold = false): number {
  let sum = 0;
  for (const c of text) sum += charWidth(c);
  return (sum / 1000) * fontSize * (bold ? 1.08 : 1) * 1.04;
}

/** Estimated width in px of the longest line. */
export function textWidth(text: string, fontSize: number, bold = false): number {
  return Math.max(0, ...text.split('\n').map((l) => lineWidth(l, fontSize, bold)));
}

/** Estimated number of lines when the text wraps at `width` px. */
export function lineCount(text: string, fontSize: number, width: number, bold = false): number {
  let n = 0;
  for (const para of text.split('\n')) {
    let line = 0;
    let lines = 1;
    for (const word of para.split(' ')) {
      const w = lineWidth(`${word} `, fontSize, bold);
      if (line > 0 && line + w > width + lineWidth(' ', fontSize, bold)) {
        lines++;
        line = w;
      } else line += w;
    }
    n += lines;
  }
  return Math.max(1, n);
}
