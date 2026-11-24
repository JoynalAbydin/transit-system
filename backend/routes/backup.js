const express = require('express');
const router  = express.Router();
const { getDb } = require('../database/db');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');

router.get('/', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const db = getDb();
    const [records, letters, addresses, users, letterSugg, addrSugg] = await Promise.all([
      db.execute('SELECT * FROM records ORDER BY id'),
      db.execute('SELECT * FROM letters ORDER BY id'),
      db.execute('SELECT * FROM addresses ORDER BY id'),
      db.execute('SELECT id, username, full_name, role, created_at FROM users ORDER BY id'),
      db.execute('SELECT * FROM letter_number_suggestions ORDER BY id'),
      db.execute('SELECT * FROM address_suggestions ORDER BY id'),
    ]);

    const backup = {
      exported_at: new Date().toISOString(),
      version: '2.0',
      data: {
        records:            records.rows,
        letters:            letters.rows,
        addresses:          addresses.rows,
        users:              users.rows,
        letterSuggestions:  letterSugg.rows,
        addressSuggestions: addrSugg.rows,
      }
    };

    const json = JSON.stringify(backup, null, 2);
    const date = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="ntmc-backup-${date}.json"`);
    res.setHeader('Content-Length', Buffer.byteLength(json));
    res.end(json);
  } catch(err) {
    res.status(500).json({ error: 'ব্যাকআপ তৈরিতে সমস্যা: ' + err.message });
  }
});

router.post('/restore', authMiddleware, adminMiddleware, async (req, res) => {
  const db = getDb();
  try {
    const backup = req.body;
    if (!backup?.data) return res.status(400).json({ error: 'Invalid backup file' });
    const { records, letters, addresses, letterSuggestions, addressSuggestions } = backup.data;

    // Clear
    await db.executeMultiple(`
      DELETE FROM addresses;
      DELETE FROM letters;
      DELETE FROM records;
      DELETE FROM letter_number_suggestions;
      DELETE FROM address_suggestions;
    `);

    for (const r of (records || [])) {
      await db.execute({ sql: `INSERT OR IGNORE INTO records (id,serial_number,date,distribution_area,description,status,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)`, args: [r.id, r.serial_number, r.date, r.distribution_area, r.description, r.status||'published', r.created_by, r.created_at, r.updated_at] });
    }
    for (const l of (letters || [])) {
      await db.execute({ sql: 'INSERT OR IGNORE INTO letters (id,record_id,letter_number,letter_date,letter_type) VALUES (?,?,?,?,?)', args: [l.id, l.record_id, l.letter_number, l.letter_date, l.letter_type||''] });
    }
    for (const a of (addresses || [])) {
      await db.execute({ sql: 'INSERT OR IGNORE INTO addresses (id,letter_id,address_text,address_order) VALUES (?,?,?,?)', args: [a.id, a.letter_id, a.address_text, a.address_order] });
    }
    for (const s of (letterSuggestions || [])) {
      await db.execute({ sql: 'INSERT OR IGNORE INTO letter_number_suggestions (id,letter_number,use_count) VALUES (?,?,?)', args: [s.id, s.letter_number, s.use_count] });
    }
    for (const s of (addressSuggestions || [])) {
      await db.execute({ sql: 'INSERT OR IGNORE INTO address_suggestions (id,address_text,use_count) VALUES (?,?,?)', args: [s.id, s.address_text, s.use_count] });
    }

    res.json({ message: 'রিস্টোর সম্পন্ন হয়েছে' });
  } catch(err) {
    res.status(500).json({ error: 'রিস্টোরে সমস্যা: ' + err.message });
  }
});

module.exports = router;
