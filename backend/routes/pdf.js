const express = require('express');
const router  = express.Router();
const { getDb } = require('../database/db');
const { authMiddleware } = require('../middleware/auth');

function toBn(n) {
  const d = ['০','১','২','৩','৪','৫','৬','৭','৮','৯'];
  return String(n).split('').map(c => d[parseInt(c)] !== undefined ? d[parseInt(c)] : c).join('');
}

const BN_LETTERS = ['ক','খ','গ','ঘ','ঙ','চ','ছ','জ','ঝ','ঞ','ট','ঠ','ড','ঢ','ণ','ত','থ','দ','ধ','ন','প','ফ','ব','ভ','ম','য','র','ল','শ','ষ','স','হ'];

function prefixLetter(nums) {
  if (nums.length <= 1) return nums.map(n => n);
  return nums.map((n, i) => `(${BN_LETTERS[i] || toBn(i+1)}) ${n}`);
}

const BN_MONTHS = ['জানুয়ারি','ফেব্রুয়ারি','মার্চ','এপ্রিল','মে','জুন','জুলাই','আগস্ট','সেপ্টেম্বর','অক্টোবর','নভেম্বর','ডিসেম্বর'];

function formatDateBn(raw) {
  if (!raw) return '';
  let m = String(raw).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return `${toBn(parseInt(m[3]))} ${BN_MONTHS[parseInt(m[2])-1]} ${toBn(parseInt(m[1]))}`;
  m = String(raw).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return `${toBn(parseInt(m[1]))} ${BN_MONTHS[parseInt(m[2])-1]} ${toBn(parseInt(m[3]))}`;
  return raw;
}

function chunkArray(arr, size) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
  return chunks;
}

// ── Turso async fetchFull ──
async function fetchFull(db, recordId) {
  const row = await db.execute({ sql: 'SELECT * FROM records WHERE id = ?', args: [recordId] });
  const record = row.rows[0];
  if (!record) return null;

  const lRows = await db.execute({ sql: 'SELECT * FROM letters WHERE record_id = ? ORDER BY id', args: [Number(record.id)] });
  const letters = [];
  for (const l of lRows.rows) {
    const aRows = await db.execute({ sql: 'SELECT * FROM addresses WHERE letter_id = ? ORDER BY address_order', args: [Number(l.id)] });
    let ltypes = [];
    try { const p = JSON.parse(l.letter_type || '[]'); ltypes = Array.isArray(p) ? p : [p].filter(Boolean); } catch { ltypes = l.letter_type ? [l.letter_type] : []; }
    letters.push({
      ...l,
      letter_numbers: (l.letter_number||'').split('\n').map(s=>s.trim()).filter(Boolean),
      letter_dates:   (l.letter_date  ||'').split('\n').map(s=>s.trim()).filter(Boolean),
      addresses:      aRows.rows,
      letter_types:   ltypes,
      letter_type:    ltypes[0] || ''
    });
  }
  return { ...record, letters };
}

function generateTransitHTML(record, letters, rowsPerPage = 6) {
  const RPP = [5,6,7,10,11,12].includes(Number(rowsPerPage)) ? Number(rowsPerPage) : 6;

  const rows = [];
  let serial = 1;
  for (const letter of letters) {
    const nums  = letter.letter_numbers || [letter.letter_number];
    const dates = letter.letter_dates   || [letter.letter_date];
    for (const addr of letter.addresses) {
      rows.push({ serial: serial++, nums, dates, address: addr.address_text });
    }
  }
  while (rows.length < RPP || rows.length % RPP !== 0) {
    rows.push({ serial: null, nums: [], dates: [], address: '' });
  }
  const pages  = chunkArray(rows, RPP);
  const dateBn = formatDateBn(record.date);

  /* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
     অটো ROW HEIGHT — কীভাবে কাজ করে:

     .page        → height: 297mm  (exact A4, overflow: hidden)
     .hdr         → fixed উচ্চতা (header + title)
     .table-wrapper → flex: 1  ← বাকি পুরো জায়গা পায়
     table        → height: 100%  ← wrapper-এর পুরোটা fill করে
     <tr>         → কোনো explicit height নেই

     Chromium-এর table layout engine:
       ১. প্রতিটি row-এর natural height (content থেকে) বের করে
       ২. মোট natural height < table height হলে বাকি space সব row-এ
          সমানভাবে ভাগ করে দেয়
       ➜ ফলাফল: content বেশি = row বড়, অন্যগুলো একটু ছোট
                content কম/নেই = row পুরো equal share পায়
                মোট table সবসময় পুরো পেজ জুড়ে থাকে ✓

     নিচের ফাঁকা জায়গা (স্বাক্ষর লাইনের উপরে):
     বাড়াতে: 60pt / 70pt  |  কমাতে: 30pt / 35pt
     ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
  const BOTTOM_PT = 45;   /* ← এই লাইনে bottom space বদলান */

  /*
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   CORE FIX — কেন এই approach:

   সমস্যা: `table { height:100% }` দিলে Chromium table-layout
   engine প্রতিটি row-এর natural height বের করে, বাকি space
   proportionally ভাগ করে — কিন্তু multi-line row-এ সেই extra
   allocated height-এর কারণে text-এর নিচে blank space তৈরি হয়,
   আর `vertical-align:top` সেই td-এর allocated height-এর মধ্যে
   text উপরে রাখে — কিন্তু td নিজেই বড় থাকে।

   সমাধান:
   • thead আলাদা (normal table) → border + column width align করে
   • tbody-wrapper (flex column, flex:1) → বাকি সব জায়গা নেয়
   • প্রতিটি .row (flex row, flex:1) → সব row সমান minimum share
   • প্রতিটি .cell (flex column, align-items:flex-start) →
     content সবসময় top-এ, extra space নিচে চলে যায় row-এর মধ্যে
   • .stacked div: margin/padding zero, line-height compact →
     multi-line text-এর মাঝে কোনো gap নেই
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  */
  const COL = { serial:'6%', letter:'20%', date:'14%', addr:'42%', sig:'18%' };

  const css = `
    @import url('https://fonts.googleapis.com/css2?family=Noto+Serif+Bengali:wght@400;700&display=swap');
    *{margin:0;padding:0;box-sizing:border-box;}
    body{font-family:'Noto Serif Bengali',serif;background:white;color:#000;font-size:15px;}

    /* ── পেজ: exact A4, flex column ── */
    .page{
      width:210mm;
      height:297mm;
      padding:8mm 8mm 6mm 8mm;
      page-break-after:always;
      display:flex;
      flex-direction:column;
      overflow:hidden;
    }
    .page:last-child{page-break-after:avoid;}

    /* ── হেডার ── */
    .hdr{margin-bottom:4px;flex-shrink:0;}
    .hdr-title{font-size:22px;font-weight:bold;text-decoration:underline;text-align:center;display:block;margin-bottom:6px;}
    .hdr-date-row{text-align:right;font-size:15px;display:block;}
    .hdr-date-value{display:inline-block;border-bottom:1.5px solid #000;min-width:200px;padding-bottom:1px;text-align:left;padding-left:4px;}

    /* ── table-wrapper: বাকি সব জায়গা নেয়, flex column ── */
    .table-wrapper{
      flex:1;
      overflow:hidden;
      display:flex;
      flex-direction:column;
      border:1px solid #000;
    }

    /* ── thead: normal flex row, fixed height ── */
    .thead-row{
      display:flex;
      flex-shrink:0;
      border-bottom:1px solid #000;
      background:#efefef;
    }
    .th{
      font-weight:bold;
      text-align:center;
      font-size:15px;
      padding:4px 5px;
      border-right:1px solid #000;
      word-break:break-word;
      line-height:1.3;
    }
    .th:last-child{border-right:none;flex:1;}

    /* ── tbody-wrapper: fixed height, overflow clip ── */
    .tbody-wrap{
      flex:1;
      display:flex;
      flex-direction:column;
      overflow:hidden;
      min-height:0;
      /* rows content অনুযায়ী বাড়বে, total height এর বাইরে গেলে clip */
    }

    /*
      row: flex:1 1 auto + min-height:min-content
      — content অনুযায়ী row naturally বাড়ে (hide হয় না)
      — tbody-wrap overflow:hidden পুরো table clip করে
      — blank row গুলো remaining space fill করে
    */
    .row{
      display:flex;
      flex:1 1 auto;
      min-height:min-content;
      border-bottom:1px solid #000;
    }
    .row:last-child{border-bottom:none;}

    /* cell: visible overflow — row-ই size নিয়ন্ত্রণ করে */
    .cell{
      border-right:1px solid #000;
      padding:3px 5px;
      display:block;
      word-break:break-word;
      overflow-wrap:break-word;
      font-size:15px;
      line-height:1.3;
    }
    .cell:last-child{border-right:none;flex:1;}

    /* ── column widths ── */
    .c-serial{width:${COL.serial};flex-shrink:0;text-align:center;}
    .c-letter{width:${COL.letter};flex-shrink:0;word-break:break-all;}
    .c-date  {width:${COL.date};flex-shrink:0;}
    .c-addr  {width:${COL.addr};flex-shrink:0;word-break:break-word;}
    .c-sig   {width:${COL.sig};flex-shrink:0;}

    /* ── stacked: zero gap, compact line-height ── */
    .stacked{
      display:flex;
      flex-direction:column;
      width:100%;
    }
    .stacked div{
      margin:0;
      padding:0;
      line-height:1.3;
      word-break:break-all;
      overflow-wrap:break-word;
      width:100%;
    }

    /* ── নিচের ফাঁকা জায়গা (স্বাক্ষরের জন্য) ── */
    .bottom-space{height:${BOTTOM_PT}pt;flex-shrink:0;}

    /* ── ফুটার ── */
    .footer{margin-top:6px;flex-shrink:0;display:flex;justify-content:space-between;align-items:flex-end;font-size:13px;}
    .sign-line{border-top:1px solid #000;width:130px;margin-bottom:3px;}

    @page{size:A4 portrait;margin:0;}
  `;

  const pagesHTML = pages.map((pageRows, pi) => {
    const rowsHTML = pageRows.map(r => {
      const serialCell    = r.serial !== null ? `${toBn(r.serial)}।` : '';
      const prefixedNums  = prefixLetter(r.nums);
      const letterCell    = r.nums.length
        ? `<div class="stacked">${prefixedNums.map(n=>`<div style="word-break:break-all;overflow-wrap:break-word;">${n}</div>`).join('')}</div>`
        : '';
      const dateCell      = r.dates.length
        ? `<div class="stacked">${r.dates.map(d=>`<div>${formatDateBn(d)}</div>`).join('')}</div>`
        : '';
      const addrCell      = r.address ? r.address.replace(/\n/g,'<br>') : '';

      /* row HTML: tr/td → div.row / div.cell */
      return `<div class="row">
        <div class="cell c-serial">${serialCell}</div>
        <div class="cell c-letter">${letterCell}</div>
        <div class="cell c-date">${dateCell}</div>
        <div class="cell c-addr">${addrCell}</div>
        <div class="cell c-sig"></div>
      </div>`;
    }).join('');

    return `<div class="page">
      <div class="hdr">
        <span class="hdr-title">ট্রানজিট স্লিপ এনটিএমসি</span>
        <span class="hdr-date-row">তারিখ: <span class="hdr-date-value">&nbsp;${dateBn}&nbsp;</span></span>
      </div>
      <div class="table-wrapper">
        <div class="thead-row">
          <div class="th c-serial">ক্রঃ</div>
          <div class="th c-letter">পত্র নং</div>
          <div class="th c-date">পত্রের তারিখ</div>
          <div class="th c-addr">ঠিকানা</div>
          <div class="th c-sig">গ্রহণকারীর স্বাক্ষর ও তারিখ</div>
        </div>
        <div class="tbody-wrap">${rowsHTML}</div>
      </div>
      <div class="bottom-space"></div>
      <div class="footer">
        <div style="text-align:center;"><div class="sign-line"></div><div>প্রেরকের স্বাক্ষর</div></div>
        <div>পৃষ্ঠা ${toBn(pi+1)} / ${toBn(pages.length)}</div>
      </div>
    </div>`;
  }).join('');

  return `<!DOCTYPE html><html lang="bn"><head><meta charset="UTF-8"><style>${css}</style></head><body>${pagesHTML}</body></html>`;
}

// ──────────────────────────────────────────────────────────────────────────
// SIGNAL TRANSIT — শুধু আসল ঠিকানা অনুযায়ী রো, কোনো খালি রো/min-height নেই
//   • প্রতিটি ঠিকানা = ১টি রো; বর্ডার লেখার গায়ে গায়ে (শুধু padding)
//   • পেজ ভরে গেলে রো নিজে থেকে পরের পেজে যায় (রো মাঝখানে কাটে না)
//   • thead (শিরোনাম + তারিখ + কলাম হেডার) ও tfoot (স্বাক্ষর) প্রতি পেজে আসে
//   • পেজের উপর/নিচের মার্জিনও thead/tfoot-এর spacer থেকে আসে,
//     তাই PDF-এর margin ০ থাকলেও (Puppeteer/PDFShift) ঠিক থাকে
// অন্য কোনো ফাংশন বা PDF এর সাথে এর কোনো সম্পর্ক নেই।
// ──────────────────────────────────────────────────────────────────────────
function generateSignalTransitHTML(record, letters) {
  const rows = [];
  let serial = 1;
  for (const letter of letters) {
    const nums  = letter.letter_numbers || [letter.letter_number];
    const dates = letter.letter_dates   || [letter.letter_date];
    for (const addr of letter.addresses) {
      rows.push({ serial: serial++, nums, dates, address: addr.address_text });
    }
  }
  const dateBn = formatDateBn(record.date);

  /* ← এই লাইনগুলো বদলে ফাঁকা/সাইজ ঠিক করুন */
  const CELL_PAD_Y   = 2;    /* px: রো-র ভিতরে উপর-নিচ ফাঁকা (লেখার সাথে বর্ডারের দূরত্ব) */
  const TOP_MARGIN   = 8;    /* mm: প্রতি পেজের উপরের মার্জিন */
  const BOTTOM_MARGIN = 6;   /* mm: প্রতি পেজের নিচের মার্জিন */
  const SIGN_SPACE_PT = 30;  /* pt: স্বাক্ষর লাইনের উপরে ফাঁকা */
  const COL = { serial:'6%', letter:'20%', date:'14%', addr:'42%', sig:'18%' };

  const css = `
    @import url('https://fonts.googleapis.com/css2?family=Noto+Serif+Bengali:wght@400;700&display=swap');
    *{margin:0;padding:0;box-sizing:border-box;}
    body{font-family:'Noto Serif Bengali',serif;background:white;color:#000;font-size:15px;}
    @page{size:A4 portrait;margin:0;}

    /* পেজের দুই পাশের মার্জিন */
    .wrap{width:210mm;padding:0 8mm;}

    table{width:100%;border-collapse:collapse;table-layout:fixed;}
    thead{display:table-header-group;}   /* প্রতি পেজে হেডার */
    tfoot{display:table-footer-group;}   /* প্রতি পেজে স্বাক্ষর */
    tr{break-inside:avoid;page-break-inside:avoid;}

    /* হেডারের উপরের অংশ (শিরোনাম/তারিখ/স্পেসার) — কোনো বর্ডার নেই */
    td.nb{border:none;padding:0;}
    .sp-top{height:${TOP_MARGIN}mm;}
    .sp-bottom{height:${BOTTOM_MARGIN}mm;}
    .hdr-title{font-size:22px;font-weight:bold;text-decoration:underline;text-align:center;display:block;margin-bottom:6px;}
    .hdr-date-row{text-align:right;font-size:15px;display:block;margin-bottom:4px;}
    .hdr-date-value{display:inline-block;border-bottom:1.5px solid #000;min-width:200px;padding-bottom:1px;text-align:left;padding-left:4px;}

    /* কলাম হেডার ও ডাটা সেল — রো-র উচ্চতা শুধু লেখা অনুযায়ী */
    th, td.cell{
      border:1px solid #000;
      padding:${CELL_PAD_Y}px 5px;
      font-size:15px;
      line-height:1.3;
      vertical-align:top;
      word-break:break-word;
      overflow-wrap:break-word;
    }
    th{font-weight:bold;text-align:center;background:#efefef;vertical-align:middle;padding:4px 5px;}
    td.c-serial{text-align:center;}
    td.c-letter{word-break:break-all;}

    .stacked{display:flex;flex-direction:column;width:100%;}
    .stacked div{margin:0;padding:0;line-height:1.3;word-break:break-all;overflow-wrap:break-word;width:100%;}

    /* স্বাক্ষর (tfoot) */
    .sign-space{height:${SIGN_SPACE_PT}pt;}
    .sign-line{border-top:1px solid #000;width:130px;margin-bottom:3px;}
    .sign-txt{font-size:13px;text-align:center;width:130px;}
  `;

  const rowsHTML = rows.map(r => {
    const prefixedNums = prefixLetter(r.nums);
    const letterCell = r.nums.length
      ? `<div class="stacked">${prefixedNums.map(n => `<div>${n}</div>`).join('')}</div>`
      : '';
    const dateCell = r.dates.length
      ? `<div class="stacked">${r.dates.map(d => `<div>${formatDateBn(d)}</div>`).join('')}</div>`
      : '';
    const addrCell = r.address ? r.address.replace(/\n/g, '<br>') : '';
    return `<tr>
      <td class="cell c-serial">${toBn(r.serial)}।</td>
      <td class="cell c-letter">${letterCell}</td>
      <td class="cell c-date">${dateCell}</td>
      <td class="cell c-addr">${addrCell}</td>
      <td class="cell c-sig"></td>
    </tr>`;
  }).join('');

  const html = `<div class="wrap"><table>
    <colgroup>
      <col style="width:${COL.serial}"><col style="width:${COL.letter}"><col style="width:${COL.date}">
      <col style="width:${COL.addr}"><col style="width:${COL.sig}">
    </colgroup>
    <thead>
      <tr><td class="nb sp-top" colspan="5"></td></tr>
      <tr><td class="nb" colspan="5"><span class="hdr-title">ট্রানজিট স্লিপ এনটিএমসি</span></td></tr>
      <tr><td class="nb" colspan="5"><span class="hdr-date-row">তারিখ: <span class="hdr-date-value">&nbsp;${dateBn}&nbsp;</span></span></td></tr>
      <tr>
        <th>ক্রঃ</th><th>পত্র নং</th><th>পত্রের তারিখ</th><th>ঠিকানা</th><th>গ্রহণকারীর স্বাক্ষর</th>
      </tr>
    </thead>
    <tbody>${rowsHTML}</tbody>
    <tfoot>
      <tr><td class="nb" colspan="5"><div class="sign-space"></div></td></tr>
      <tr><td class="nb" colspan="5"><div class="sign-line"></div><div class="sign-txt">প্রেরকের স্বাক্ষর</div></td></tr>
      <tr><td class="nb sp-bottom" colspan="5"></td></tr>
    </tfoot>
  </table></div>`;

  return `<!DOCTYPE html><html lang="bn"><head><meta charset="UTF-8"><style>${css}</style></head><body>${html}</body></html>`;
}

function generateEnvelopeHTML(record, letters) {
  const envs = [];
  for (const letter of letters) {
    const nums  = letter.letter_numbers || [letter.letter_number];
    const dates = letter.letter_dates   || [letter.letter_date];
    const ltype = letter.letter_type || '';
    for (const addr of letter.addresses) {
      envs.push({ nums, dates, address: addr.address_text, letter_type: ltype });
    }
  }
  if (!envs.length) envs.push({ nums:[''], dates:[''], address:'' });

  const envsHTML = envs.map(e => {
    const maxRows = Math.max(e.nums.length, e.dates.length);
    const topRows = Array.from({ length: maxRows }, (_, i) => ({ num: e.nums[i]||'', date: e.dates[i]||'' }));
    const prefixedEnvNums = prefixLetter(e.nums);

    // ── letter_type logic ──
    const lt = (e.letter_type || '').trim();
    // Group A: above env-top AND below address (dual placement)
    const groupA = ['গোপনীয়','অতি গোপনীয়','Restricted','Confidential','Secret','Top Secret'];
    // Group B: above env-top only (single)
    const groupB = ['গোপনীয় আবরণ সীমিত'];
    // Group C: above env-top only, split on "/" with no gap
    const groupC = ['গোপনীয় আবরণ সীমিত/ ভাঁজ করা নিষেধ','গোপনীয়/ ভাঁজ করা নিষেধ'];
    // Group D: above env-top right side (date side) only
    const groupD = ['জরুরি','অতিব জরুরি','অতি জরুরি'];

    let aboveTopCenter = '';
    let aboveTopRight  = '';
    let belowAddrCenter = '';

    if (lt && groupA.includes(lt)) {
      aboveTopCenter = `<div class="lt-center">${lt}</div>`;
      belowAddrCenter = `<div class="lt-center">${lt}</div>`;
    } else if (lt && groupB.includes(lt)) {
      aboveTopCenter = `<div class="lt-center">${lt}</div>`;
    } else if (lt && groupC.includes(lt)) {
      const parts = lt.split('/');
      const line1 = parts[0].trim();
      const line2 = (parts[1] || '').trim();
      aboveTopCenter = `<div class="lt-center lt-twoline"><div>${line1}</div><div>${line2}</div></div>`;
    } else if (lt && groupD.includes(lt)) {
      aboveTopRight = `<div class="lt-right">${lt}</div>`;
    }

    const topHTML = topRows.map((row, ri) => `
      <div class="env-row">
        <span class="env-num">${prefixedEnvNums[ri] || row.num}</span>
        <span class="env-date">${row.date ? `তারিখ: ${formatDateBn(row.date)}` : ''}</span>
      </div>`).join('');
    const addrLines = (e.address||'').split('\n').filter(l=>l.trim());
    const addrHTML  = addrLines.map(l=>`<div>${l}</div>`).join('');
    return `<div class="env-block">
      ${aboveTopCenter}
      ${aboveTopRight}
      <div class="env-top">${topHTML}</div>
      <div class="env-body">
        <span class="env-proti">প্রতি,</span>
        <div class="env-addr">${addrHTML}</div>
      </div>
      ${belowAddrCenter}
    </div>`;
  }).join('');

  const css = `
    @import url('https://fonts.googleapis.com/css2?family=Noto+Serif+Bengali:wght@400;700&display=swap');
    *{margin:0;padding:0;box-sizing:border-box;}
    body{font-family:'Noto Serif Bengali',serif;background:white;color:#000;}
    .env-wrapper{width:297mm;padding:3mm 5mm;columns:2;column-gap:3mm;}
    .env-block{break-inside:avoid;page-break-inside:avoid;padding:1.2mm 1.8mm;margin-bottom:1.5mm;border:1px solid #d0d0d0;border-radius:3px;box-shadow:1px 1px 4px rgba(0,0,0,0.10);}
    .env-top{margin-bottom:0;}
    .env-row{display:flex;justify-content:space-between;align-items:baseline;line-height:1.35;}
    .env-num{font-size:13.5px;flex:1;padding-right:6px;line-height:1.35;}
    .env-date{font-size:12.5px;white-space:nowrap;}
    .env-body{padding-left:30pt;margin-top:0px;}
    .env-proti{display:block;font-size:14.5px;line-height:1.35;}
    .env-addr{font-size:14.5px;line-height:1.4;padding-left:2.3em;}
    .lt-center{text-align:center;font-size:12px;font-weight:700;margin-bottom:3pt;letter-spacing:.5px;}
    .lt-twoline{line-height:1.1;}
    .lt-right{text-align:right;font-size:12px;font-weight:700;margin-bottom:3pt;}
    @page{size:A4 landscape;margin:0;}
  `;

  return `<!DOCTYPE html><html lang="bn"><head><meta charset="UTF-8"><style>${css}</style></head><body><div class="env-wrapper">${envsHTML}</div></body></html>`;
}

// ── PDF Generation — Dual Mode ────────────────────────────────────────────
// LOCAL  : PDFSHIFT_KEY নেই → Puppeteer (offline OK)
// ONLINE : PDFSHIFT_KEY আছে → PDFShift API, ব্যর্থ হলে Puppeteer fallback
// ──────────────────────────────────────────────────────────────────────────

async function htmlToPdfPuppeteer(html, options = {}) {
  let puppeteer;
  try { puppeteer = require('puppeteer'); }
  catch(e) { throw new Error('Puppeteer ইনস্টল নেই। চালান: npm install puppeteer'); }

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });
  try {
    const page = await browser.newPage();
    try {
      await page.setContent(html, { waitUntil: 'networkidle0', timeout: 12000 });
    } catch(_) {
      await page.setContent(html, { waitUntil: 'domcontentloaded', timeout: 5000 });
    }
    const pdf = await page.pdf({
      format: 'A4',
      landscape: options.landscape || false,
      margin: { top: '0mm', bottom: '0mm', left: '0mm', right: '0mm' },
      printBackground: true,
      preferCSSPageSize: false,
    });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}

async function htmlToPdfShift(html, options = {}) {
  const fetch = require('node-fetch');
  const keys = [
    process.env.PDFSHIFT_KEY,   process.env.PDFSHIFT_KEY_2,
    process.env.PDFSHIFT_KEY_3, process.env.PDFSHIFT_KEY_4,
    process.env.PDFSHIFT_KEY_5, process.env.PDFSHIFT_KEY_6,
    process.env.PDFSHIFT_KEY_7, process.env.PDFSHIFT_KEY_8,
    process.env.PDFSHIFT_KEY_9, process.env.PDFSHIFT_KEY_10,
  ].filter(Boolean);

  let lastError = null;
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    const label = 'PDFShift key #' + (i + 1);   // key-এর কোনো অংশ log-এ ছাপা হয় না
    try {
      const resp = await fetch('https://api.pdfshift.io/v3/convert/pdf', {
        method: 'POST',
        timeout: 45000,
        headers: {
          'X-API-Key': key,                                              // বর্তমান v3 auth header
          'Authorization': 'Basic ' + Buffer.from(`api:${key}`).toString('base64'), // legacy compatibility
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          source: html,
          landscape: options.landscape || false,
          format: 'A4',
          margin: { top: '0mm', bottom: '0mm', left: '0mm', right: '0mm' }
        })
      });
      if (resp.ok) {
        console.log('✅ ' + label + ' দিয়ে PDF তৈরি হয়েছে');
        return Buffer.from(await resp.arrayBuffer());
      }
      const errText = await resp.text();
      console.warn('⚠️  ' + label + ' failed (' + resp.status + '): ' + errText.slice(0, 300));
      lastError = new Error('PDFShift (' + resp.status + '): ' + errText.slice(0, 300));
    } catch(e) {
      console.warn('⚠️  ' + label + ' error: ' + e.message);
      lastError = e;
    }
  }
  throw lastError || new Error('সব PDFShift key ব্যর্থ।');
}

// ── Dispatcher: সব route এটাই কল করে ──
// PDFSHIFT_KEY* সেট থাকলে আগে PDFShift, ব্যর্থ হলে Puppeteer fallback।
// কোনো key না থাকলে সরাসরি Puppeteer।
function hasPdfShiftKeys() {
  return Object.keys(process.env).some(k => /^PDFSHIFT_KEY(_\d+)?$/.test(k) && process.env[k]);
}

async function htmlToPdf(html, options = {}) {
  if (hasPdfShiftKeys()) {
    try {
      return await htmlToPdfShift(html, options);
    } catch (e) {
      console.warn('⚠️  PDFShift ব্যর্থ, Puppeteer fallback চালু হচ্ছে: ' + e.message);
    }
  }
  return htmlToPdfPuppeteer(html, options);
}



// ── Transit PDF ──
router.get('/transit/:id', authMiddleware, async (req, res) => {
  try {
    const record = await fetchFull(getDb(), req.params.id);
    if (!record) return res.status(404).json({ error: 'Not found' });
    const rowsPerPage = req.query.rows ? parseInt(req.query.rows) : 6;
    // ?mode=signal → Signal Transit (ঠিকানা অনুযায়ী রো); নইলে আগের মতোই
    const html = req.query.mode === 'signal'
      ? generateSignalTransitHTML(record, record.letters)
      : generateTransitHTML(record, record.letters, rowsPerPage);
    const pdf  = await htmlToPdf(html, { landscape: false });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="transit-${record.serial_number}.pdf"`);
    res.setHeader('Content-Length', pdf.length);
    res.end(pdf);
  } catch(err) {
    console.error('Transit PDF:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Envelope PDF ──
router.get('/envelope/:id', authMiddleware, async (req, res) => {
  try {
    const record = await fetchFull(getDb(), req.params.id);
    if (!record) return res.status(404).json({ error: 'Not found' });
    const html = generateEnvelopeHTML(record, record.letters);
    const pdf  = await htmlToPdf(html, { landscape: true });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="envelope-${record.serial_number}.pdf"`);
    res.setHeader('Content-Length', pdf.length);
    res.end(pdf);
  } catch(err) {
    console.error('Envelope PDF:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Merge Envelope ──
router.post('/envelope/merge', authMiddleware, async (req, res) => {
  try {
    const db = getDb();
    const { record_ids } = req.body;
    if (!record_ids || !Array.isArray(record_ids) || record_ids.length === 0)
      return res.status(400).json({ error: 'record_ids array required' });

    const allLetters = [];
    const recordDates = [];

    for (const rid of record_ids) {
      const record = await fetchFull(db, rid);
      if (!record) continue;
      recordDates.push(record.date);
      allLetters.push(...record.letters);
    }

    if (allLetters.length === 0)
      return res.status(404).json({ error: 'কোনো তথ্য পাওয়া যায়নি' });

    const html = generateEnvelopeHTML({ date: recordDates[0] || '' }, allLetters);
    const pdf  = await htmlToPdf(html, { landscape: true });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="merged-envelope.pdf"`);
    res.setHeader('Content-Length', pdf.length);
    res.end(pdf);
  } catch(err) {
    console.error('Merge Envelope:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
