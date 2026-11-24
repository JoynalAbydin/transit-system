// একই ঠিকানার একাধিক চিঠি → একটি রো/ইনভেলাপ।
// ডাটাবেসের ডেটা বদলায় না; শুধু PDF/প্রিভিউ তৈরির সময় গ্রুপ করা হয়।

// ঠিকানা মেলানোর জন্য: লাইন ট্রিম, বাড়তি স্পেস বাদ, ছোট হাতের অক্ষর
function normalizeAddress(text) {
  return String(text || '')
    .split('\n')
    .map(l => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n')
    .toLowerCase();
}

/**
 * letters: fetchFull() থেকে পাওয়া letters অ্যারে (একাধিক রেকর্ডের letters একসাথেও হতে পারে)
 * রিটার্ন: [{ nums, dates, address, letter_type }]  — প্রতিটি আলাদা ঠিকানার জন্য ১টি
 * ঠিকানা প্রথম যেখানে এসেছে রো সেই জায়গাতেই থাকে।
 */
function buildRows(letters) {
  const byKey = new Map();
  const groups = [];

  (letters || []).forEach((letter, li) => {
    const nums  = letter.letter_numbers || [letter.letter_number];
    const dates = letter.letter_dates   || [letter.letter_date];

    for (const addr of (letter.addresses || [])) {
      const text = addr.address_text || '';
      const key  = normalizeAddress(text);

      let g = key ? byKey.get(key) : null;
      if (!g) {
        g = { address: text, letter_type: letter.letter_type || '', parts: [], seen: new Set() };
        groups.push(g);
        if (key) byKey.set(key, g);
      }
      if (g.seen.has(li)) continue;          // একই চিঠিতে একই ঠিকানা দুবার থাকলে একবারই
      g.seen.add(li);
      g.parts.push({ nums, dates });
      if (!g.letter_type && letter.letter_type) g.letter_type = letter.letter_type;
    }
  });

  return groups.map(g => {
    if (g.parts.length === 1) {
      // একটিই চিঠি — আগের মতোই হুবহু
      return { nums: g.parts[0].nums, dates: g.parts[0].dates, address: g.address, letter_type: g.letter_type };
    }
    // একাধিক চিঠি — স্মারক ও তারিখ জোড়ায় জোড়ায় (ক, খ, গ…) যুক্ত হবে
    const nums = [], dates = [];
    for (const p of g.parts) {
      const n = Math.max(p.nums.length, p.dates.length);
      for (let i = 0; i < n; i++) { nums.push(p.nums[i] || ''); dates.push(p.dates[i] || ''); }
    }
    return { nums, dates, address: g.address, letter_type: g.letter_type };
  });
}

module.exports = { buildRows, normalizeAddress };
