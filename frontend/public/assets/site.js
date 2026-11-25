/* ===== ট্রানজিট ব্যবস্থাপনা — About / Blog / Contact পেজের কমন স্ক্রিপ্ট ===== */

/* ------------------------------------------------------------------
   কনফিগারেশন (শুধু এখানেই বদলাতে হবে)
   alias: FormSubmit প্রথমবার নিশ্চিত করার পর যে random কোড পাঠায় (যেমন "a1b2c3d4e5...")
          সেটি এখানে বসালে ইমেইল ঠিকানা আর কোথাও থাকবে না।
          ফাঁকা থাকলে নিচের ডিফল্ট প্রাপক ব্যবহার হবে।
   ------------------------------------------------------------------ */
var CONTACT_CONFIG = {
  alias: '',
  cooldownSeconds: 20,      // এক বার পাঠানোর পর আবার পাঠাতে অপেক্ষা
  maxMessageLength: 2000
};

(function () {
  'use strict';

  var $  = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  /* ---------- কমন: বছর + মোবাইল মেনু ---------- */
  var y = $('#copy-year');
  if (y) y.textContent = new Date().getFullYear();

  var toggle = $('.nav-toggle'), nav = $('#site-nav');
  if (toggle && nav) {
    toggle.addEventListener('click', function () {
      var open = nav.classList.toggle('open');
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    $$('a', nav).forEach(function (a) { a.addEventListener('click', function () { nav.classList.remove('open'); toggle.setAttribute('aria-expanded', 'false'); }); });
  }

  /* ---------- ব্লগ: বিষয়সূচি, সার্চ, সব খুলুন/বন্ধ, ডিপ-লিংক ---------- */
  var blog = $('#blog-root');
  if (blog) {
    var items = $$('.acc', blog);

    // বিষয়সূচি (প্রতিটি আইটেমের হেডিং থেকে)
    var toc = $('#toc');
    if (toc) {
      $$('.acc-list[data-toc]', blog).forEach(function (list) {
        $$('.acc', list).forEach(function (d) {
          var a = document.createElement('a');
          a.href = '#' + d.id;
          a.textContent = $('h3', d).textContent;
          a.addEventListener('click', function (e) { e.preventDefault(); openItem(d, true); history.replaceState(null, '', '#' + d.id); });
          if (list.dataset.toc === 'guide') toc.appendChild(a);
        });
      });
    }

    function openItem(d, scroll) {
      d.open = true;
      if (scroll) setTimeout(function () { d.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 30);
    }

    function fromHash() {
      var id = decodeURIComponent((location.hash || '').slice(1));
      if (!id) return;
      var d = document.getElementById(id);
      if (d && d.classList.contains('acc')) openItem(d, true);
    }
    window.addEventListener('hashchange', fromHash);
    fromHash();

    // সব খুলুন / বন্ধ করুন
    var openAll = $('#open-all'), closeAll = $('#close-all');
    if (openAll)  openAll.addEventListener('click',  function () { items.forEach(function (d) { if (d.style.display !== 'none') d.open = true; }); });
    if (closeAll) closeAll.addEventListener('click', function () { items.forEach(function (d) { d.open = false; }); });

    // সার্চ
    var q = $('#blog-search'), empty = $('#blog-empty'), cnt = $('#blog-count');
    var texts = items.map(function (d) { return d.textContent.toLowerCase().replace(/\s+/g, ' '); });
    function runSearch() {
      var term = (q.value || '').trim().toLowerCase();
      var shown = 0;
      items.forEach(function (d, i) {
        var hit = !term || texts[i].indexOf(term) !== -1;
        d.style.display = hit ? '' : 'none';
        if (hit) { shown++; if (term) d.open = true; }
        else d.open = false;
      });
      // গ্রুপ হেডিং লুকানো (সব আইটেম না থাকলে)
      $$('.group-block', blog).forEach(function (g) {
        var any = $$('.acc', g).some(function (d) { return d.style.display !== 'none'; });
        g.style.display = any ? '' : 'none';
      });
      if (empty) empty.classList.toggle('show', shown === 0);
      if (cnt) cnt.textContent = term ? (toBn(shown) + ' টি ফলাফল') : '';
    }
    if (q) q.addEventListener('input', runSearch);

    function toBn(n) { return String(n).replace(/[0-9]/g, function (d) { return '০১২৩৪৫৬৭৮৯'[d]; }); }
  }

  /* ---------- যোগাযোগ ফর্ম ---------- */
  var form = $('#contact-form');
  if (form) {
    var statusEl = $('#form-status'), btn = $('#send-btn'), msg = $('#f-message'), counter = $('#msg-count');
    var lastSent = 0;

    function endpoint() {
      // ইমেইল ঠিকানা সরাসরি HTML-এ নেই; alias থাকলে ঠিকানা কোথাও থাকে না।
      var id = CONTACT_CONFIG.alias || ['joyjannat81', 'gmail.com'].join('@');
      return 'https://formsubmit.co/ajax/' + id;
    }

    function show(type, text) {
      statusEl.className = 'status show ' + type;
      statusEl.textContent = text;
      statusEl.setAttribute('role', type === 'bad' ? 'alert' : 'status');
    }
    function setInvalid(id, bad) {
      var f = document.getElementById(id).closest('.field');
      if (f) f.classList.toggle('invalid', bad);
      return !bad;
    }

    if (msg && counter) {
      msg.setAttribute('maxlength', CONTACT_CONFIG.maxMessageLength);
      var upd = function () { counter.textContent = msg.value.length + ' / ' + CONTACT_CONFIG.maxMessageLength; };
      msg.addEventListener('input', upd); upd();
    }
    $$('input,textarea,select', form).forEach(function (el) {
      el.addEventListener('input', function () { var f = el.closest('.field'); if (f) f.classList.remove('invalid'); });
    });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      statusEl.className = 'status';

      // স্প্যাম ফাঁদ: বট এই লুকানো ঘর পূরণ করে
      if ($('#f-website').value) { show('ok', 'ধন্যবাদ! আপনার বার্তা পাঠানো হয়েছে।'); return; }

      var name = $('#f-name').value.trim(),
          email = $('#f-email').value.trim(),
          phone = $('#f-phone').value.trim(),
          topic = $('#f-topic').value,
          message = msg.value.trim();

      var ok = true;
      ok = setInvalid('f-name', name.length < 2) && ok;
      ok = setInvalid('f-email', !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) && ok;
      ok = setInvalid('f-message', message.length < 10) && ok;
      if (!ok) { show('bad', 'দয়া করে লাল চিহ্নিত ঘরগুলো ঠিক করে আবার চেষ্টা করুন।'); return; }

      var wait = CONTACT_CONFIG.cooldownSeconds - Math.floor((Date.now() - lastSent) / 1000);
      if (lastSent && wait > 0) { show('info', 'আবার পাঠানোর আগে আর ' + wait + ' সেকেন্ড অপেক্ষা করুন।'); return; }

      btn.disabled = true; btn.classList.add('loading');
      show('info', 'পাঠানো হচ্ছে…');

      fetch(endpoint(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({
          name: name,
          email: email,                 // উত্তর দেওয়ার জন্য (Reply-To)
          phone: phone || '—',
          topic: topic,
          message: message,
          _subject: '[ট্রানজিট ব্যবস্থাপনা] ' + topic + ' — ' + name,
          _replyto: email,
          _template: 'table',
          _captcha: 'false'
        })
      })
        .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, data: d }; }); })
        .then(function (res) {
          var success = res.ok && (res.data.success === true || res.data.success === 'true');
          if (!success) throw new Error((res.data && res.data.message) || 'send failed');
          lastSent = Date.now();
          form.reset(); if (counter) counter.textContent = '0 / ' + CONTACT_CONFIG.maxMessageLength;
          show('ok', '✅ ধন্যবাদ! আপনার বার্তা পাঠানো হয়েছে। প্রয়োজনে দেওয়া ইমেইলে আপনার সাথে যোগাযোগ করা হবে।');
        })
        .catch(function () {
          show('bad', 'দুঃখিত, এখন বার্তা পাঠানো যায়নি। ইন্টারনেট সংযোগ দেখে একটু পরে আবার চেষ্টা করুন।');
        })
        .then(function () { btn.disabled = false; btn.classList.remove('loading'); });
    });
  }
})();
