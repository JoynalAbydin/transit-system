import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import { toBanglaNumber, areaStyle, DISTRIBUTION_AREAS, groupByAddress } from '../utils/helpers';

// Transit row options
const TRANSIT_ROW_OPTIONS = [
  { label: '৫ রো', value: 5 },
  { label: '৬ রো (ডিফল্ট)', value: 6 },
  { label: '৭ রো', value: 7 },
  { label: '১০ রো', value: 10 },
  { label: '১১ রো', value: 11 },
  { label: '১২ রো', value: 12 },
];

function TransitRowDropdown({ recId, recSerial, pdfLoading, onDownload }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const isLoading = pdfLoading[`transit-${recId}`];

  return (
    <div className="flex items-center gap-0" ref={ref}>
      <button
        onClick={() => onDownload('transit', recId, recSerial, 6)}
        disabled={isLoading}
        title="ট্রানজিট ডাউনলোড (৬ রো)"
        className="inline-flex items-center gap-1 bg-blue-600 hover:bg-blue-700 text-white text-xs px-3 py-1.5 rounded-l-lg transition-all disabled:opacity-50">
        {isLoading
          ? <div className="w-3 h-3 border border-white/30 border-t-white rounded-full animate-spin"></div>
          : '📄'} ট্রানজিট
      </button>
      <div className="relative">
        <button
          onClick={() => setOpen(o => !o)}
          disabled={isLoading}
          title="অন্য ফরম্যাট"
          className="inline-flex items-center justify-center bg-blue-700 hover:bg-blue-800 text-white px-1.5 rounded-r-lg transition-all disabled:opacity-50 border-l border-blue-500"
          style={{ height: '30px', minWidth: '18px' }}>
          <svg className={`w-2.5 h-2.5 transition-transform ${open ? 'rotate-180' : ''}`} fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
          </svg>
        </button>
        {open && (
          <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-xl z-50 py-1" style={{ minWidth: '140px' }}>
            <div className="px-3 py-1 text-gray-400 border-b border-gray-100 mb-1" style={{ fontSize: '10px', fontWeight: 600 }}>রো সংখ্যা বেছে নিন</div>
            {TRANSIT_ROW_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => { setOpen(false); onDownload('transit', recId, recSerial, opt.value); }}
                className={`w-full text-left px-3 py-1.5 text-xs hover:bg-blue-50 hover:text-blue-700 transition-colors ${opt.value === 6 ? 'font-bold text-blue-600' : 'text-gray-700'}`}>
                {opt.label}
              </button>
            ))}
            {/* Signal Transit — ঠিকানা অনুযায়ী রো, খালি রো নেই */}
            <div className="border-t border-gray-100 mt-1 pt-1">
              <button
                onClick={() => { setOpen(false); onDownload('transit', recId, recSerial, 'signal'); }}
                className="w-full text-left px-3 py-1.5 text-xs text-gray-700 hover:bg-blue-50 hover:text-blue-700 transition-colors">
                📡 Signal Transit
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// blob response-এর error থেকে সার্ভারের বার্তা বের করে (না পেলে fallback)
async function errMessage(err, fallback) {
  try {
    const d = err?.response?.data;
    if (d instanceof Blob) { const j = JSON.parse(await d.text()); if (j?.error) return j.error; }
    else if (d?.error) return d.error;
  } catch {}
  return fallback;
}

// ── Envelope Preview Modal ─────────────────────────────────────────────────
function EnvelopePreviewModal({ rec, onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    axios.get(`/api/records/${rec.id}`)
      .then(r => { setData(r.data); setLoading(false); })
      .catch(() => { toast.error('ডেটা লোড সমস্যা'); onClose(); });
  }, [rec.id, onClose]);

  // Close on Escape + body scroll lock
  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', h);
    // modal খোলা থাকলে page scroll বন্ধ
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', h);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const BN_LETTERS = ['ক','খ','গ','ঘ','ঙ','চ','ছ','জ','ঝ','ঞ','ট','ঠ','ড','ঢ','ণ','ত','থ','দ','ধ','ন'];
  const BN_MONTHS = ['জানুয়ারি','ফেব্রুয়ারি','মার্চ','এপ্রিল','মে','জুন','জুলাই','আগস্ট','সেপ্টেম্বর','অক্টোবর','নভেম্বর','ডিসেম্বর'];

  function fmtDate(raw) {
    if (!raw) return '';
    let m = String(raw).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) {
      const d = ['০','১','২','৩','৪','৫','৬','৭','৮','৯'];
      const toBn = n => String(n).split('').map(c => d[parseInt(c)] !== undefined ? d[parseInt(c)] : c).join('');
      return `${toBn(parseInt(m[3]))} ${BN_MONTHS[parseInt(m[2])-1]} ${toBn(parseInt(m[1]))}`;
    }
    return raw;
  }

  // Collect all envelopes from all letters
  // "ইনভেলাপ হয়ে গেছে" চিহ্নিত চিঠি বাদ; বাকিগুলোর একই ঠিকানা একটি ইনভেলাপে মিলিয়ে দেখানো হয়
  const allLetters = data?.letters || [];
  const doneCount  = allLetters.filter(l => l.envelope_done).length;
  const envelopes  = groupByAddress(allLetters.filter(l => !l.envelope_done));

  const toggleDone = async (letter) => {
    const done = !letter.envelope_done;
    try {
      await axios.patch(`/api/records/letters/${letter.id}/envelope-done`, { done });
      setData(d => ({ ...d, letters: d.letters.map(l => l.id === letter.id ? { ...l, envelope_done: done ? 1 : 0 } : l) }));
    } catch { toast.error('চিহ্ন দিতে সমস্যা'); }
  };

  return createPortal(
    <div
      style={{
        position: 'fixed',
        top: 0, left: 0, right: 0, bottom: 0,
        background: 'rgba(0,0,0,0.65)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div
        style={{
          width: '90vw',
          height: '90vh',
          background: '#fff',
          borderRadius: '16px',
          boxShadow: '0 25px 60px rgba(0,0,0,0.3)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}>
        {/* Modal header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
          <div>
            <h2 className="text-lg font-bold text-gray-800">👁️ ইনভেলাপ প্রিভিউ</h2>
            <p className="text-xs text-gray-400 mt-0.5">রেকর্ড: {rec.serial_number} — {rec.distribution_area}</p>
          </div>
          <button onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 hover:bg-red-100 text-gray-500 hover:text-red-600 transition-all text-lg font-bold">
            ✕
          </button>
        </div>

        {/* Modal body */}
        <div className="overflow-y-auto flex-1 p-6" style={{ overscrollBehavior: "contain" }}>
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <div className="spinner"></div>
              <p className="text-gray-400 text-sm">লোড হচ্ছে...</p>
            </div>
          ) : (
            <>
            {/* চিঠির তালিকা: ম্যানুয়াল "ইনভেলাপ হয়ে গেছে" চিহ্ন */}
            {allLetters.length > 0 && (
              <div className="mb-5 border border-gray-200 rounded-xl overflow-hidden">
                <div className="bg-gray-50 px-4 py-2 text-xs font-semibold text-gray-600 border-b border-gray-200">
                  ✅ যেসব চিঠির ইনভেলাপ আগেই হয়ে গেছে সেগুলোতে টিক দিন — ইনভেলাপ ডাউনলোডে বাদ যাবে (ট্রানজিটে সবই থাকবে)
                </div>
                <div className="divide-y divide-gray-100">
                  {allLetters.map(l => {
                    const nums = (l.letter_numbers || []).join(', ') || '—';
                    const addrs = (l.addresses || []).map(a => String(a.address_text || '').split('\n')[0]).join(' • ');
                    return (
                      <label key={l.id} className={`flex items-start gap-3 px-4 py-2 cursor-pointer hover:bg-gray-50 ${l.envelope_done ? 'bg-green-50/60' : ''}`}>
                        <input type="checkbox" checked={!!l.envelope_done} onChange={() => toggleDone(l)}
                          className="mt-1 w-4 h-4 accent-green-600 flex-shrink-0" />
                        <div className="min-w-0">
                          <div className={`text-sm ${l.envelope_done ? 'text-gray-400 line-through' : 'text-gray-800'}`}>{nums}</div>
                          <div className="text-xs text-gray-400 truncate">{addrs}</div>
                        </div>
                        {!!l.envelope_done && <span className="ml-auto text-xs text-green-700 bg-green-100 px-2 py-0.5 rounded-lg flex-shrink-0">ইনভেলাপ হয়েছে</span>}
                      </label>
                    );
                  })}
                </div>
              </div>
            )}

            {envelopes.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <div className="text-5xl mb-3">📭</div>
              <p>{allLetters.length > 0 && doneCount === allLetters.length ? 'সব চিঠির ইনভেলাপ হয়ে গেছে' : 'কোনো ঠিকানা পাওয়া যায়নি'}</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              {envelopes.map((env, ei) => {
                const maxRows = Math.max(env.nums.length, env.dates.length, 1);
                const prefixed = env.nums.length > 1
                  ? env.nums.map((n, i) => `(${BN_LETTERS[i] || (i+1)}) ${n}`)
                  : env.nums;
                return (
                  <div key={ei} className="border border-gray-200 rounded-xl p-4 bg-gray-50 hover:border-indigo-200 hover:bg-indigo-50/30 transition-all" style={{ fontFamily: "'Noto Serif Bengali', 'SolaimanLipi', serif" }}>
                    {/* Letter numbers & dates */}
                    <div className="mb-3 space-y-0.5">
                      {Array.from({ length: maxRows }, (_, i) => (
                        <div key={i} className="flex justify-between items-baseline gap-2">
                          <span className="text-sm text-gray-700 flex-1 leading-snug">{prefixed[i] || ''}</span>
                          {env.dates[i] && (
                            <span className="text-xs text-gray-500 whitespace-nowrap">তারিখ: {fmtDate(env.dates[i])}</span>
                          )}
                        </div>
                      ))}
                    </div>
                    {/* Address */}
                    <div className="border-t border-gray-200 pt-3">
                      <div className="text-sm text-gray-600 mb-1">প্রতি,</div>
                      <div className="pl-6 text-sm text-gray-800 leading-relaxed whitespace-pre-line">
                        {env.address}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            )}
            </>
          )}
        </div>

        {/* Modal footer */}
        {!loading && envelopes.length > 0 && (
          <div className="px-6 py-3 border-t border-gray-100 flex items-center justify-between flex-shrink-0 bg-gray-50">
            <span className="text-xs text-gray-400">ইনভেলাপ হবে {toBanglaNumber(envelopes.length)} টি{doneCount > 0 ? ` (${toBanglaNumber(doneCount)} টি চিঠি বাদ — আগেই হয়েছে)` : ''}</span>
            <button onClick={onClose}
              className="bg-gray-200 hover:bg-gray-300 text-gray-700 text-sm px-4 py-1.5 rounded-lg transition-all">
              ✕ বন্ধ করুন
            </button>
          </div>
        )}
      </div>
    </div>
  , document.body);
}

export default function Dashboard() {
  const { user, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [records, setRecords]         = useState([]);
  const [total, setTotal]             = useState(0);
  const [page, setPage]               = useState(1);
  const [search, setSearch]           = useState('');
  const [searchInput, setInput]       = useState('');
  const [loading, setLoading]         = useState(true);
  const [pdfLoading, setPdfLoad]      = useState({});
  const [editDesc, setEditDesc]       = useState(null);
  const [envSelected, setEnvSelected] = useState([]);
  const [merging, setMerging]         = useState(false);
  const [previewRec, setPreviewRec]   = useState(null);
  const [pageSize, setPageSize]       = useState(15);
  const [transitSelected, setTransitSelected] = useState([]);
  const [transitRows, setTransitRows] = useState(6);
  const [mergingTransit, setMergingTransit]   = useState(false);

  const fetchRecords = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get('/api/records', { params: { search, page, limit: pageSize } });
      setRecords(res.data.records);
      setTotal(res.data.total);
    } catch { toast.error('ডেটা লোড করতে সমস্যা'); }
    finally { setLoading(false); }
  }, [search, page, pageSize]);

  useEffect(() => { fetchRecords(); }, [fetchRecords]);

  const handleSearch = e => { e.preventDefault(); setSearch(searchInput); setPage(1); };

  const handleDelete = async (id, serial) => {
    if (!window.confirm(`"${serial}" মুছতে চান?`)) return;
    try { await axios.delete(`/api/records/${id}`); toast.success('মুছে ফেলা হয়েছে'); fetchRecords(); }
    catch { toast.error('মুছতে সমস্যা'); }
  };

  const handlePublish = async (id) => {
    try {
      const r = await axios.patch(`/api/records/${id}/publish`);
      toast.success(`প্রকাশিত হয়েছে ✓ ${r.data.serial_number || ''}`);
      fetchRecords();
    }
    catch { toast.error('সমস্যা হয়েছে'); }
  };

  const downloadPDF = async (type, id, serial, rows = 6) => {
    const key = `${type}-${id}`;
    setPdfLoad(p => ({ ...p, [key]: true }));
    try {
      const isSignal = type === 'transit' && rows === 'signal';
      const params = type === 'transit' ? (isSignal ? { mode: 'signal' } : { rows }) : {};
      const res = await axios.get(`/api/pdf/${type}/${id}`, { responseType: 'blob', params });
      const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      const a   = document.createElement('a');
      const suffix = isSignal ? '-signal' : (type === 'transit' && rows !== 6 ? `-${rows}row` : '');
      a.href = url; a.download = `${type}${suffix}-${serial}.pdf`; a.click();
      URL.revokeObjectURL(url);
      toast.success('PDF ডাউনলোড শুরু হয়েছে');
    } catch (err) { toast.error(await errMessage(err, 'PDF তৈরিতে সমস্যা')); }
    finally { setPdfLoad(p => ({ ...p, [key]: false })); }
  };

  const saveDesc = async () => {
    if (!editDesc) return;
    try {
      await axios.patch(`/api/records/${editDesc.id}/description`, { description: editDesc.value });
      toast.success('বিবরণ আপডেট হয়েছে');
      setEditDesc(null); fetchRecords();
    } catch { toast.error('সমস্যা হয়েছে'); }
  };

  const toggleEnvSelect = (id) => setEnvSelected(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);

  const downloadMergedEnvelope = async (ids) => {
    if (!ids || ids.length === 0) { toast.error('কমপক্ষে একটি রেকর্ড নির্বাচন করুন'); return; }
    setMerging(true);
    try {
      const res = await axios.post('/api/pdf/envelope/merge', { record_ids: ids }, { responseType: 'blob' });
      const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      const a   = document.createElement('a');
      a.href = url; a.download = `merged-envelope-${ids.length}records.pdf`; a.click();
      URL.revokeObjectURL(url);
      toast.success(`${toBanglaNumber(ids.length)} টি রেকর্ডের ইনভেলাপ ডাউনলোড হচ্ছে`);
      setEnvSelected([]);
    } catch (err) { toast.error(await errMessage(err, 'মার্জ ইনভেলাপ তৈরিতে সমস্যা')); }
    finally { setMerging(false); }
  };

  const toggleTransitSelect = (id) => setTransitSelected(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);

  const downloadMergedTransit = async () => {
    if (transitSelected.length === 0) { toast.error('কমপক্ষে একটি রেকর্ড নির্বাচন করুন'); return; }
    setMergingTransit(true);
    try {
      const body = { record_ids: transitSelected };
      if (transitRows === 'signal') body.mode = 'signal'; else body.rows = transitRows;
      const res = await axios.post('/api/pdf/transit/merge', body, { responseType: 'blob' });
      const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      const a   = document.createElement('a');
      a.href = url; a.download = `merged-transit-${transitSelected.length}records.pdf`; a.click();
      URL.revokeObjectURL(url);
      toast.success(`${toBanglaNumber(transitSelected.length)} টি রেকর্ড একটি ট্রানজিটে ডাউনলোড হচ্ছে`);
      setTransitSelected([]);
    } catch { toast.error('মার্জ ট্রানজিট তৈরিতে সমস্যা'); }
    finally { setMergingTransit(false); }
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const fromN = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const toN   = Math.min(page * pageSize, total);

  return (
    <div className="fade-in">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">📋 ড্যাশবোর্ড</h1>
          <p className="text-gray-500 text-sm mt-1">মোট রেকর্ড: {toBanglaNumber(total)} টি</p>
        </div>
        <Link to="/create"
          className="bg-[#1e3a5f] hover:bg-[#0f2744] text-white px-6 py-2.5 rounded-xl font-medium transition-all shadow-md flex items-center gap-2">
          <span className="text-lg">➕</span> নতুন ট্রানজিট তৈরি
        </Link>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 mb-4">
        <form onSubmit={handleSearch} className="flex gap-3">
          <input type="text" value={searchInput} onChange={e => setInput(e.target.value)}
            className="flex-1 border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
            placeholder="🔍  স্মারক নম্বর, ঠিকানা, ট্রানজিট নং, এলাকা বা বিবরণ দিয়ে খুঁজুন..." />
          <button type="submit" className="bg-[#1e3a5f] text-white px-5 py-2.5 rounded-xl font-medium hover:bg-[#0f2744] transition-all">খুঁজুন</button>
          {search && (
            <button type="button" onClick={() => { setSearch(''); setInput(''); setPage(1); }}
              className="bg-gray-100 text-gray-600 px-4 py-2.5 rounded-xl hover:bg-gray-200 transition-all">✕</button>
          )}
        </form>
      </div>

      {search && !loading && (
        <div className="mb-3 text-sm text-gray-600 flex items-center gap-2 flex-wrap">
          <span className="bg-blue-50 text-blue-700 px-3 py-1 rounded-lg font-medium">🔍 “{search}”</span>
          <span>এর জন্য {toBanglaNumber(total)} টি রেকর্ড পাওয়া গেছে — শুধু মিল থাকা সারিগুলো দেখানো হচ্ছে</span>
        </div>
      )}


      {/* Transit checkbox merge bar */}
      {transitSelected.length > 0 && (
        <div className="bg-blue-700 text-white rounded-2xl p-3 mb-4 flex items-center justify-between gap-4 flex-wrap shadow-lg">
          <div className="flex items-center gap-3">
            <span className="bg-white/20 px-3 py-1 rounded-lg font-bold">{toBanglaNumber(transitSelected.length)}</span>
            <span className="font-medium text-sm">টি রেকর্ড নির্বাচিত — সব ঠিকানা একটি ট্রানজিটে ডাউনলোড করুন</span>
          </div>
          <div className="flex gap-3 items-center flex-wrap">
            <select value={transitRows} onChange={e => setTransitRows(e.target.value === 'signal' ? 'signal' : Number(e.target.value))}
              className="bg-white text-blue-800 text-xs font-semibold px-2 py-1.5 rounded-lg outline-none">
              {TRANSIT_ROW_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              <option value="signal">📡 Signal Transit</option>
            </select>
            <button onClick={() => setTransitSelected([])} className="bg-white/20 hover:bg-white/30 text-white text-xs px-3 py-1.5 rounded-lg transition-all">✕ বাতিল</button>
            <button onClick={downloadMergedTransit} disabled={mergingTransit}
              className="bg-white text-blue-700 font-bold text-xs px-4 py-1.5 rounded-lg hover:bg-blue-50 transition-all disabled:opacity-50 flex items-center gap-2 shadow">
              {mergingTransit ? <><div className="w-3 h-3 border-2 border-blue-200 border-t-blue-700 rounded-full animate-spin"></div> তৈরি হচ্ছে...</> : '📄 ডাউনলোড করুন'}
            </button>
          </div>
        </div>
      )}

      {/* Envelope checkbox merge bar */}
      {envSelected.length > 0 && (
        <div className="bg-indigo-600 text-white rounded-2xl p-3 mb-4 flex items-center justify-between gap-4 flex-wrap shadow-lg">
          <div className="flex items-center gap-3">
            <span className="bg-white/20 px-3 py-1 rounded-lg font-bold">{toBanglaNumber(envSelected.length)}</span>
            <span className="font-medium text-sm">টি ইনভেলাপ নির্বাচিত — একটি PDF এ ডাউনলোড করুন</span>
          </div>
          <div className="flex gap-3">
            <button onClick={() => setEnvSelected([])} className="bg-white/20 hover:bg-white/30 text-white text-xs px-3 py-1.5 rounded-lg transition-all">✕ বাতিল</button>
            <button onClick={() => downloadMergedEnvelope(envSelected)} disabled={merging}
              className="bg-white text-indigo-700 font-bold text-xs px-4 py-1.5 rounded-lg hover:bg-indigo-50 transition-all disabled:opacity-50 flex items-center gap-2 shadow">
              {merging ? <><div className="w-3 h-3 border-2 border-indigo-200 border-t-indigo-700 rounded-full animate-spin"></div> তৈরি হচ্ছে...</> : '✉️ ডাউনলোড করুন'}
            </button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>ক্রমিক</th>
                <th>ট্রানজিট নং</th>
                <th>তারিখ</th>
                <th>বিতরণ এলাকা</th>
                <th>বিবরণ</th>
                <th className="text-center">ট্রানজিট</th>
                <th className="text-center">ইনভেলাপ</th>
                <th className="text-center">ইডিট / ম্যানেজ</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} className="text-center py-16">
                  <div className="spinner mx-auto mb-3"></div>
                  <p className="text-gray-400">লোড হচ্ছে...</p>
                </td></tr>
              ) : records.length === 0 ? (
                <tr><td colSpan={8} className="text-center py-16 text-gray-400">
                  <div className="text-5xl mb-3">📭</div>
                  <div>কোনো রেকর্ড পাওয়া যায়নি</div>
                </td></tr>
              ) : records.map((rec, idx) => (
                <tr key={rec.id} className="area-row"
                  style={{ '--area-bg': (envSelected.includes(rec.id) || transitSelected.includes(rec.id)) ? 'rgba(99,102,241,0.18)' : areaStyle(rec.distribution_area).bg,
                           '--area-solid': areaStyle(rec.distribution_area).solid }}>
                  <td className="font-bold text-blue-800 text-center w-16">{toBanglaNumber((page-1)*pageSize + idx + 1)}</td>
                  <td className="whitespace-nowrap">
                    {rec.status === 'draft'
                      ? <span className="text-xs text-orange-600 font-semibold bg-white/70 border border-orange-200 px-2 py-1 rounded-lg">প্রকাশের পর আইডি হবে</span>
                      : <span className="font-mono font-bold text-[#1e3a5f] text-sm bg-white/70 border border-gray-200 px-2 py-1 rounded-lg">{rec.serial_number}</span>}
                  </td>
                  <td className="whitespace-nowrap w-36">
                    <div className="flex flex-col gap-1">
                      <span className="bg-blue-50 text-blue-700 px-2 py-1 rounded-lg text-xs font-medium">{rec.date}</span>
                      {rec.status === 'draft' && <span className="bg-orange-100 text-orange-700 px-2 py-0.5 rounded-lg text-xs font-bold">📝 ড্রাফট</span>}
                    </div>
                  </td>
                  <td className="w-36">
                    <span className="px-2 py-1 rounded-lg text-xs font-semibold text-white" style={{ backgroundColor: areaStyle(rec.distribution_area).solid }}>{rec.distribution_area}</span>
                  </td>
                  <td className="max-w-[180px]">
                    {editDesc?.id === rec.id ? (
                      <div className="flex gap-1">
                        <input autoFocus value={editDesc.value} onChange={e => setEditDesc({ ...editDesc, value: e.target.value })}
                          className="flex-1 border border-blue-300 rounded px-2 py-1 text-xs outline-none"
                          onKeyDown={e => { if(e.key==='Enter') saveDesc(); if(e.key==='Escape') setEditDesc(null); }} />
                        <button onClick={saveDesc} className="text-green-600 hover:text-green-700 font-bold text-sm">✓</button>
                        <button onClick={() => setEditDesc(null)} className="text-red-400 hover:text-red-600 text-sm">✕</button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1 group">
                        <span className="text-gray-600 text-xs truncate">{rec.description || '—'}</span>
                        {isAdmin && (
                          <button onClick={() => setEditDesc({ id: rec.id, value: rec.description || '' })}
                            className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-blue-600 text-xs transition-opacity flex-shrink-0">✎</button>
                        )}
                      </div>
                    )}
                  </td>

                  {/* Transit with row dropdown */}
                  <td className="text-center whitespace-nowrap">
                    {rec.status === 'draft' ? (
                      <button onClick={() => handlePublish(rec.id)}
                        className="inline-flex items-center gap-1 bg-orange-500 hover:bg-orange-600 text-white text-xs px-3 py-1.5 rounded-lg transition-all">
                        🚀 প্রকাশ করুন
                      </button>
                    ) : (
                      <div className="inline-flex items-center gap-1.5">
                        <TransitRowDropdown recId={rec.id} recSerial={rec.serial_number} pdfLoading={pdfLoading} onDownload={downloadPDF} />
                        <input type="checkbox"
                          checked={transitSelected.includes(rec.id)}
                          onChange={() => toggleTransitSelect(rec.id)}
                          title="একত্রে একটি ট্রানজিটের জন্য নির্বাচন করুন"
                          className="w-3.5 h-3.5 rounded cursor-pointer accent-blue-600 flex-shrink-0" />
                      </div>
                    )}
                  </td>

                  {/* Envelope + checkbox + preview */}
                  <td className="text-center whitespace-nowrap">
                    {rec.status !== 'draft' && (
                      <div className="inline-flex items-center gap-1.5">
                        <button onClick={() => downloadPDF('envelope', rec.id, rec.serial_number)}
                          disabled={pdfLoading[`envelope-${rec.id}`]}
                          className="inline-flex items-center gap-1 whitespace-nowrap bg-purple-600 hover:bg-purple-700 text-white text-xs px-3 py-1.5 rounded-lg transition-all disabled:opacity-50">
                          {pdfLoading[`envelope-${rec.id}`]
                            ? <div className="w-3 h-3 border border-white/30 border-t-white rounded-full animate-spin"></div>
                            : '✉️'} ইনভেলাপ
                        </button>
                        <input type="checkbox"
                          checked={envSelected.includes(rec.id)}
                          onChange={() => toggleEnvSelect(rec.id)}
                          title="একত্রে ডাউনলোডের জন্য নির্বাচন করুন"
                          className="w-3.5 h-3.5 rounded cursor-pointer accent-indigo-600 flex-shrink-0" />
                        <button
                          onClick={() => setPreviewRec(rec)}
                          title="ঠিকানা প্রিভিউ"
                          className="inline-flex items-center justify-center bg-teal-500 hover:bg-teal-600 text-white rounded-lg transition-all flex-shrink-0 shadow-sm"
                          style={{ width: '26px', height: '26px' }}>
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" style={{ width: '13px', height: '13px' }}>
                            <path d="M10 12.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5z" />
                            <path fillRule="evenodd" d="M.664 10.59a1.651 1.651 0 010-1.186A10.004 10.004 0 0110 3c4.257 0 7.893 2.66 9.336 6.41.147.381.146.804 0 1.186A10.004 10.004 0 0110 17c-4.257 0-7.893-2.66-9.336-6.41z" clipRule="evenodd" />
                          </svg>
                        </button>
                      </div>
                    )}
                  </td>

                  <td className="text-center w-36">
                    <div className="flex items-center justify-center gap-2">
                      <button onClick={() => navigate(`/edit/${rec.id}`)}
                        className="bg-amber-500 hover:bg-amber-600 text-white text-xs px-3 py-1.5 rounded-lg transition-all">
                        ✏️ ইডিট
                      </button>
                      {isAdmin && (
                        <button onClick={() => handleDelete(rec.id, rec.serial_number)}
                          className="bg-red-500 hover:bg-red-600 text-white text-xs px-3 py-1.5 rounded-lg transition-all">
                          🗑️
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between gap-3 flex-wrap px-6 py-4 border-t border-gray-100">
          <div className="flex items-center gap-3 flex-wrap">
            <p className="text-sm text-gray-500">
              মোট {toBanglaNumber(total)} টির মধ্যে {toBanglaNumber(fromN)}–{toBanglaNumber(toN)}
            </p>
            <select value={pageSize}
              onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }}
              title="প্রতি পেজে কতটি দেখাবে"
              className="px-3 py-1.5 rounded-lg border text-sm bg-white outline-none focus:ring-2 focus:ring-blue-200">
              {[15, 20, 30, 50, 100].map(n => <option key={n} value={n}>{toBanglaNumber(n)} টি</option>)}
            </select>
          </div>
          {totalPages > 1 && (
            <div className="flex gap-2">
              <button onClick={() => setPage(p=>Math.max(1,p-1))} disabled={page===1}
                className="px-3 py-1.5 rounded-lg border text-sm disabled:opacity-40 hover:bg-gray-50">← আগে</button>
              {(() => {
                let start = Math.max(1, Math.min(page - 2, totalPages - 4));
                let end   = Math.min(totalPages, start + 4);
                return Array.from({ length: end - start + 1 }, (_, i) => {
                  const p = start + i;
                  return <button key={p} onClick={() => setPage(p)}
                    className={`px-3 py-1.5 rounded-lg text-sm transition-all ${page===p?'bg-[#1e3a5f] text-white':'border hover:bg-gray-50'}`}>
                    {toBanglaNumber(p)}</button>;
                });
              })()}
              <button onClick={() => setPage(p=>Math.min(totalPages,p+1))} disabled={page===totalPages}
                className="px-3 py-1.5 rounded-lg border text-sm disabled:opacity-40 hover:bg-gray-50">পরে →</button>
            </div>
          )}
        </div>
      </div>

      {envSelected.length === 0 && transitSelected.length === 0 && (
        <div className="text-center text-xs text-gray-400 mt-4 space-y-1">
          <p>📄 ট্রানজিটের পাশের ছোট চেকবক্সে একাধিক রেকর্ড বেছে একটি ট্রানজিটে ডাউনলোড করুন</p>
          <p>✉️ ইনভেলাপের পাশের ছোট চেকবক্সে নির্দিষ্ট ইনভেলাপ একত্রে একটি PDF ডাউনলোড করুন</p>
          <p>👁️ প্রিভিউ বাটনে ক্লিক করে ডাউনলোড ছাড়াই ঠিকানা দেখুন</p>
        </div>
      )}

      {/* ── Envelope Preview Modal ── */}
      {previewRec && <EnvelopePreviewModal rec={previewRec} onClose={() => setPreviewRec(null)} />}
    </div>
  );
}
