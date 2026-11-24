const express = require('express');
const crypto  = require('crypto');
const router  = express.Router();
const { getDb } = require('../database/db');
const { authMiddleware } = require('../middleware/auth');

// ── Helper: fetch single record with letters+addresses ──
async function fetchFull(db, id) {
  const row = await db.execute({ sql: 'SELECT * FROM records WHERE id = ?', args: [id] });
  const record = row.rows[0];
  if (!record) return null;

  const lRows = await db.execute({ sql: 'SELECT * FROM letters WHERE record_id = ? ORDER BY id', args: [Number(record.id)] });
  const letters = [];
  for (const l of lRows.rows) {
    const aRows = await db.execute({ sql: 'SELECT * FROM addresses WHERE letter_id = ? ORDER BY address_order', args: [Number(l.id)] });
    letters.push({
      ...l,
      letter_numbers: (l.letter_number || '').split('\n').filter(Boolean),
      letter_dates:   (l.letter_date   || '').split('\n').filter(Boolean),
      addresses:      aRows.rows,
      letter_types:   (() => { try { const p = JSON.parse(l.letter_type || '[]'); return Array.isArray(p) ? p : [p].filter(Boolean); } catch { return l.letter_type ? [l.letter_type] : []; } })()
    });
  }
  return { ...record, letters };
}

// ── Helper: next serial number (শুধু প্রকাশের সময় ডাকা হয়) ──
// ড্রাফট থেকে প্রকাশ করলে id-র ক্রম আর সিরিয়ালের ক্রম আলাদা হতে পারে,
// তাই সবচেয়ে বড় সিরিয়াল ধরে পরেরটি তৈরি হয়।
async function nextSerial(db) {
  const year = new Date().getFullYear();
  const last = await db.execute({ sql: "SELECT serial_number FROM records WHERE serial_number LIKE ? ORDER BY serial_number DESC LIMIT 1", args: [`TMS-${year}-%`] });
  let seq = 1;
  if (last.rows[0]) { const p = String(last.rows[0].serial_number).split('-'); seq = (parseInt(p[2]) || 0) + 1; }
  return `TMS-${year}-${String(seq).padStart(4, '0')}`;
}

// ড্রাফটের কোনো সিরিয়াল/আইডি নেই। কলাম NOT NULL UNIQUE, তাই অস্থায়ী মান 'DRAFT-<id>' রাখা হয়।
const isDraftSerial = s => String(s || '').startsWith('DRAFT-');
async function insertRecord(db, { date, area, description, status, userId }) {
  if (status === 'draft') {
    const tmp = 'DRAFT-tmp-' + crypto.randomUUID();
    const r = await db.execute({
      sql:  'INSERT INTO records (serial_number, date, distribution_area, description, status, created_by) VALUES (?,?,?,?,?,?)',
      args: [tmp, date, area, description || '', 'draft', userId]
    });
    const id = Number(r.lastInsertRowid);
    const serial = 'DRAFT-' + id;
    await db.execute({ sql: 'UPDATE records SET serial_number=? WHERE id=?', args: [serial, id] });
    return { id, serial };
  }
  const serial = await nextSerial(db);
  const r = await db.execute({
    sql:  'INSERT INTO records (serial_number, date, distribution_area, description, status, created_by) VALUES (?,?,?,?,?,?)',
    args: [serial, date, area, description || '', 'published', userId]
  });
  return { id: Number(r.lastInsertRowid), serial };
}

// letters + addresses (+ suggestions) সংরক্ষণ
async function insertLetters(db, recordId, letters) {
  for (const letter of (letters || [])) {
    const numStr  = Array.isArray(letter.letter_numbers) ? letter.letter_numbers.join('\n') : (letter.letter_number || '');
    const dateStr = Array.isArray(letter.letter_dates)   ? letter.letter_dates.join('\n')   : (letter.letter_date  || '');
    const ltStr   = JSON.stringify(letter.letter_types || (letter.letter_type ? [letter.letter_type] : []));

    const lResult = await db.execute({ sql: 'INSERT INTO letters (record_id, letter_number, letter_date, letter_type) VALUES (?,?,?,?)', args: [recordId, numStr, dateStr, ltStr] });
    const letterId = Number(lResult.lastInsertRowid);

    for (const n of (letter.letter_numbers || []).filter(Boolean)) {
      await db.execute({ sql: 'INSERT OR IGNORE INTO letter_number_suggestions (letter_number) VALUES (?)', args: [n] });
      await db.execute({ sql: 'UPDATE letter_number_suggestions SET use_count=use_count+1 WHERE letter_number=?', args: [n] });
    }

    for (const [idx, addr] of (letter.addresses || []).entries()) {
      const txt = typeof addr === 'string' ? addr : addr.address_text;
      if (!txt) continue;
      const norm = txt.trim().split('\n').map(l => l.trim()).filter(Boolean).join('\n');
      await db.execute({ sql: 'INSERT INTO addresses (letter_id, address_text, address_order) VALUES (?,?,?)', args: [letterId, norm, idx] });
      await db.execute({ sql: 'INSERT OR IGNORE INTO address_suggestions (address_text, use_count) VALUES (?,1)', args: [norm] });
      await db.execute({ sql: 'UPDATE address_suggestions SET use_count=use_count+1 WHERE address_text=?', args: [norm] });
    }
  }
}

async function clearLetters(db, recordId) {
  const ls = await db.execute({ sql: 'SELECT id FROM letters WHERE record_id = ?', args: [recordId] });
  for (const l of ls.rows) await db.execute({ sql: 'DELETE FROM addresses WHERE letter_id = ?', args: [Number(l.id)] });
  await db.execute({ sql: 'DELETE FROM letters WHERE record_id = ?', args: [recordId] });
}

// ── Search helpers ──
// বাংলা ↔ ইংরেজি সংখ্যা: "১২৩" লিখলে "123"-ও মিলবে, উল্টোটাও।
const BN_DIGITS = '০১২৩৪৫৬৭৮৯';
function termVariants(term) {
  const en = term.replace(/[০-৯]/g, d => String(BN_DIGITS.indexOf(d)));
  const bn = term.replace(/[0-9]/g, d => BN_DIGITS[Number(d)]);
  return [...new Set([term, en, bn])];
}
// LIKE-এর বিশেষ চিহ্ন (% _ \) সাধারণ অক্ষর হিসেবে খোঁজা হবে
const likeEscape = t => t.replace(/[\\%_]/g, m => '\\' + m);

// সার্চ বক্সের লেখা → WHERE শর্ত।
// স্পেস দিয়ে আলাদা প্রতিটি শব্দ অবশ্যই মিলতে হবে (AND);
// প্রতিটি শব্দ খোঁজা হয়: সিরিয়াল, বিতরণ এলাকা, বিবরণ, স্মারক নম্বর ও ঠিকানায়।
function buildSearchWhere(search) {
  const terms = String(search || '').trim().split(/\s+/).filter(Boolean).slice(0, 6);
  if (!terms.length) return { where: '', args: [] };

  const args = [];
  const termClauses = terms.map(term => {
    const variantClauses = termVariants(term).map(v => {
      const like = '%' + likeEscape(v) + '%';
      args.push(like, like, like, like, like);
      return `(r.serial_number LIKE ? ESCAPE '\\'
            OR r.distribution_area LIKE ? ESCAPE '\\'
            OR r.description LIKE ? ESCAPE '\\'
            OR EXISTS (SELECT 1 FROM letters l WHERE l.record_id = r.id AND l.letter_number LIKE ? ESCAPE '\\')
            OR EXISTS (SELECT 1 FROM letters l JOIN addresses a ON a.letter_id = l.id
                       WHERE l.record_id = r.id AND a.address_text LIKE ? ESCAPE '\\'))`;
    });
    return '(' + variantClauses.join(' OR ') + ')';
  });
  return { where: 'WHERE ' + termClauses.join(' AND '), args };
}

// ── GET all records ──
router.get('/', authMiddleware, async (req, res) => {
  try {
    const db = getDb();
    const page   = Math.max(parseInt(req.query.page)  || 1, 1);
    const limit  = Math.min(Math.max(parseInt(req.query.limit) || 15, 1), 500);
    const offset = (page - 1) * limit;
    const { where, args } = buildSearchWhere(req.query.search);

    const [records, totalRow] = await Promise.all([
      db.execute({
        sql: `SELECT r.*, u.full_name as creator_name FROM records r LEFT JOIN users u ON r.created_by = u.id ${where} ORDER BY r.id DESC LIMIT ? OFFSET ?`,
        args: [...args, limit, offset]
      }),
      db.execute({ sql: `SELECT COUNT(*) as total FROM records r ${where}`, args })
    ]);
    res.json({ records: records.rows, total: Number(totalRow.rows[0].total), page, limit });
  } catch(err) { console.error(err); res.status(500).json({ error: err.message }); }
});

// ── GET single record ──
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const record = await fetchFull(getDb(), req.params.id);
    if (!record) return res.status(404).json({ error: 'Record not found' });
    res.json(record);
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// ── POST create ──
// status=draft → শুধু সংরক্ষণ, কোনো সিরিয়াল (ট্রানজিট নম্বর) তৈরি হয় না
router.post('/', authMiddleware, async (req, res) => {
  const db = getDb();
  const { date, distribution_area, description, letters, status } = req.body;
  if (!date)              return res.status(400).json({ error: 'Date required' });
  if (!distribution_area) return res.status(400).json({ error: 'Distribution area required' });

  try {
    const recStatus = status === 'draft' ? 'draft' : 'published';
    const { id, serial } = await insertRecord(db, { date, area: distribution_area, description, status: recStatus, userId: req.user.id });
    await insertLetters(db, id, letters);
    res.status(201).json({ id, serial_number: recStatus === 'draft' ? null : serial, status: recStatus });
  } catch(err) { console.error(err); res.status(500).json({ error: 'Save failed: ' + err.message }); }
});

// ── PUT update ──
//  • ড্রাফট রেকর্ড  → একই রেকর্ডে ইন-প্লেস আপডেট (যতবার ইচ্ছা)। 'published' পাঠালে তখনই সিরিয়াল তৈরি।
//  • প্রকাশিত রেকর্ড → আগের মতোই নতুন রেকর্ড তৈরি (পুরনোটি থাকে)
router.put('/:id', authMiddleware, async (req, res) => {
  const db = getDb();
  const existing = await db.execute({ sql: 'SELECT * FROM records WHERE id = ?', args: [req.params.id] });
  if (!existing.rows[0]) return res.status(404).json({ error: 'Record not found' });
  const record = existing.rows[0];

  // Admin-only inline description update
  if (req.body.descriptionOnly) {
    if (req.user.role !== 'ADMIN') return res.status(403).json({ error: 'Admin only' });
    await db.execute({ sql: "UPDATE records SET description=?, updated_at=datetime('now') WHERE id=?", args: [req.body.description, record.id] });
    return res.json({ message: 'Description updated' });
  }

  const { date, distribution_area, description, letters, status } = req.body;
  const newStatus = status === 'draft' ? 'draft' : 'published';
  const newDate   = date || record.date;
  const newArea   = distribution_area || record.distribution_area;
  const newDesc   = description !== undefined ? description : record.description;

  try {
    if (record.status === 'draft') {
      const recordId = Number(record.id);
      let serial = record.serial_number;
      if (newStatus === 'published') serial = await nextSerial(db);   // প্রকাশের সময়ই আইডি
      await db.execute({
        sql: "UPDATE records SET serial_number=?, date=?, distribution_area=?, description=?, status=?, updated_at=datetime('now') WHERE id=?",
        args: [serial, newDate, newArea, newDesc || '', newStatus, recordId]
      });
      await clearLetters(db, recordId);
      await insertLetters(db, recordId, letters);
      return res.json({ message: newStatus === 'draft' ? 'Draft updated' : 'Published', id: recordId, serial_number: newStatus === 'draft' ? null : serial, status: newStatus });
    }

    // প্রকাশিত রেকর্ডের ইডিট → নতুন রেকর্ড
    const { id: newId, serial } = await insertRecord(db, { date: newDate, area: newArea, description: newDesc, status: newStatus, userId: req.user.id });
    await insertLetters(db, newId, letters);
    res.json({ message: 'New record created from edit', id: newId, serial_number: newStatus === 'draft' ? null : serial, status: newStatus });
  } catch(err) { res.status(500).json({ error: 'Update failed: ' + err.message }); }
});

// ── PATCH publish — এখানেই প্রথম সিরিয়াল তৈরি হয় ──
router.patch('/:id/publish', authMiddleware, async (req, res) => {
  const db = getDb();
  try {
    const row = await db.execute({ sql: 'SELECT id, status, serial_number FROM records WHERE id=?', args: [req.params.id] });
    const rec = row.rows[0];
    if (!rec) return res.status(404).json({ error: 'Record not found' });
    if (rec.status !== 'draft' && !isDraftSerial(rec.serial_number))
      return res.json({ message: 'Already published', serial_number: rec.serial_number });

    const serial = await nextSerial(db);
    await db.execute({ sql: "UPDATE records SET serial_number=?, status='published', updated_at=datetime('now') WHERE id=?", args: [serial, rec.id] });
    res.json({ message: 'Published', serial_number: serial });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// ── PATCH description (admin) ──
router.patch('/:id/description', authMiddleware, async (req, res) => {
  if (req.user.role !== 'ADMIN') return res.status(403).json({ error: 'Admin only' });
  try {
    await getDb().execute({ sql: "UPDATE records SET description=?, updated_at=datetime('now') WHERE id=?", args: [req.body.description || '', req.params.id] });
    res.json({ message: 'Updated' });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// ── DELETE ──
router.delete('/:id', authMiddleware, async (req, res) => {
  const db = getDb();
  try {
    const row = await db.execute({ sql: 'SELECT id FROM records WHERE id = ?', args: [req.params.id] });
    if (!row.rows[0]) return res.status(404).json({ error: 'Not found' });

    const ls = await db.execute({ sql: 'SELECT id FROM letters WHERE record_id = ?', args: [req.params.id] });
    for (const l of ls.rows) await db.execute({ sql: 'DELETE FROM addresses WHERE letter_id = ?', args: [Number(l.id)] });
    await db.execute({ sql: 'DELETE FROM letters WHERE record_id = ?', args: [req.params.id] });
    await db.execute({ sql: 'DELETE FROM records WHERE id = ?',        args: [req.params.id] });
    res.json({ message: 'Deleted' });
  } catch(err) { res.status(500).json({ error: 'Delete failed: ' + err.message }); }
});

module.exports = { router, fetchFull };
