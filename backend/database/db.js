const { createClient } = require('@libsql/client');
const bcrypt = require('bcryptjs');

let _client = null;

function getDb() {
  if (!_client) throw new Error('DB not initialized. Call initDb() first.');
  return _client;
}

async function initDb() {
  if (_client) return _client;

  _client = createClient({
    url:       process.env.TURSO_URL,
    authToken: process.env.TURSO_TOKEN,
  });

  await seedDatabase(_client);
  return _client;
}

async function seedDatabase(db) {
  // Create all tables
  await db.executeMultiple(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'USER',
      full_name TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now')),
      is_active INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS distribution_areas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      name_bn TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      serial_number TEXT UNIQUE NOT NULL,
      date TEXT NOT NULL,
      distribution_area TEXT NOT NULL,
      description TEXT DEFAULT '',
      status TEXT DEFAULT 'published',
      created_by INTEGER,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS letters (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      record_id INTEGER NOT NULL,
      letter_number TEXT NOT NULL,
      letter_date TEXT NOT NULL,
      letter_type TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS addresses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      letter_id INTEGER NOT NULL,
      address_text TEXT NOT NULL,
      address_order INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS address_suggestions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      address_text TEXT UNIQUE NOT NULL,
      use_count INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS letter_number_suggestions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      letter_number TEXT UNIQUE NOT NULL,
      use_count INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);

  // Ensure admin user exists
  const adminRow = await db.execute({
    sql: 'SELECT id FROM users WHERE username = ?',
    args: ['admin']
  });
  if (adminRow.rows.length === 0) {
    // Default পাসওয়ার্ড আর নেই। Admin তৈরি হবে শুধু ADMIN_PASSWORD env variable থাকলে।
    const adminPassword = process.env.ADMIN_PASSWORD;
    if (!adminPassword || adminPassword.length < 8) {
      console.warn('⚠️  কোনো admin নেই। Admin তৈরি করতে Render-এ ADMIN_PASSWORD (কমপক্ষে ৮ অক্ষর) সেট করে redeploy করুন।');
    } else {
      const hash = bcrypt.hashSync(adminPassword, 10);
      await db.execute({
        sql: 'INSERT INTO users (username, password, role, full_name) VALUES (?, ?, ?, ?)',
        args: ['admin', hash, 'ADMIN', 'System Administrator']
      });
      console.log('✅ Admin user created (ADMIN_PASSWORD থেকে)');
    }
  }

  // Seed distribution areas if empty
  const areaRow = await db.execute('SELECT COUNT(*) as count FROM distribution_areas');
  if (Number(areaRow.rows[0].count) === 0) {
    const areas = [
      ['Cantonment Area', 'সেনানিবাস এলাকা'],
      ['Ministry Area',   'মন্ত্রণালয় এলাকা'],
      ['Signal Center',   'সিগন্যাল সেন্টার'],
      ['Others',          'অন্যান্য'],
    ];
    for (const [name, name_bn] of areas) {
      await db.execute({ sql: 'INSERT OR IGNORE INTO distribution_areas (name, name_bn) VALUES (?, ?)', args: [name, name_bn] });
    }
  }

  // ড্রাফটের সিরিয়াল নেই: আগে তৈরি হয়ে যাওয়া ড্রাফটগুলোর TMS-… নম্বর ছেড়ে দেওয়া হয় (একবারই কাজ করে)
  await db.execute("UPDATE records SET serial_number = 'DRAFT-' || id WHERE status = 'draft' AND serial_number NOT LIKE 'DRAFT-%'");

  console.log('✅ Database ready (Turso)');
}

module.exports = { initDb, getDb };
