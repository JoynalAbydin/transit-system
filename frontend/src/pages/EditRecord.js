import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import toast from 'react-hot-toast';
import { DISTRIBUTION_AREAS, toBanglaNumber } from '../utils/helpers';

function LetterNumInput({ value, onChange, placeholder }) {
  const [sugs, setSugs] = useState([]);
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const h = e => { if (!ref.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h);
  }, []);
  const fetchSugs = async q => {
    try { const r = await axios.get('/api/suggestions/letters', { params: { q } }); setSugs(r.data); setOpen(r.data.length > 0); } catch {}
  };
  return (
    <div className="relative" ref={ref}>
      <input type="text" value={value} onChange={e => { onChange(e.target.value); fetchSugs(e.target.value); }}
        onFocus={() => fetchSugs(value)}
        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
        placeholder={placeholder} />
      {open && sugs.length > 0 && (
        <ul className="suggestions-list">
          {sugs.map((s, i) => <li key={i} onMouseDown={() => { onChange(s.letter_number); setOpen(false); }}>{s.letter_number}</li>)}
        </ul>
      )}
    </div>
  );
}

function AddressBox({ value, onChange }) {
  const [sugs, setSugs] = useState([]);
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const h = e => { if (!ref.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h);
  }, []);
  const fetchSugs = async q => {
    try { const r = await axios.get('/api/suggestions/addresses', { params: { q } }); setSugs(r.data); setOpen(r.data.length > 0); } catch {}
  };
  return (
    <div className="relative" ref={ref}>
      <textarea value={value} onChange={e => { onChange(e.target.value); fetchSugs(e.target.value.split('\n')[0]); }}
        onFocus={() => fetchSugs(value.split('\n')[0])} rows={3}
        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 resize-none font-[inherit]"
        placeholder={"মহাপরিচালক\nএনটিএমসি\nতেজগাঁও, ঢাকা।"} />
      {open && sugs.length > 0 && (
        <ul className="suggestions-list" style={{ zIndex:100 }}>
          {sugs.map((s, i) => <li key={i} onMouseDown={() => { onChange(s.address_text); setOpen(false); }} style={{ whiteSpace:'pre-line' }}>{s.address_text.split('\n').join(' / ')}</li>)}
        </ul>
      )}
    </div>
  );
}

const LETTER_TYPES = [
  { value: '', label: 'চিঠির ধরন বাছাই করুন' },
  { value: 'গোপনীয়', label: 'গোপনীয়' },
  { value: 'গোপনীয় আবরণ সীমিত', label: 'গোপনীয় আবরণ সীমিত' },
  { value: 'গোপনীয় আবরণ সীমিত/ ভাঁজ করা নিষেধ', label: 'গোপনীয় আবরণ সীমিত/ ভাঁজ করা নিষেধ' },
  { value: 'গোপনীয়/ ভাঁজ করা নিষেধ', label: 'গোপনীয়/ ভাঁজ করা নিষেধ' },
  { value: 'অতি গোপনীয়', label: 'অতি গোপনীয়' },
  { value: 'জরুরি', label: 'জরুরি' },
  { value: 'অতিব জরুরি', label: 'অতিব জরুরি' },
  { value: 'অতি জরুরি', label: 'অতি জরুরি' },
  { value: 'Restricted', label: 'Restricted' },
  { value: 'Confidential', label: 'Confidential' },
  { value: 'Secret', label: 'Secret' },
  { value: 'Top Secret', label: 'Top Secret' },
];

const emptyGroup = () => ({ letter_numbers: [''], letter_dates: [''], addresses: [''], letter_type: '' });

export default function EditRecord() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [meta, setMeta] = useState({ date: '', distribution_area: [], description: '' });
  const [entries, setEntries] = useState([]);
  const [group, setGroup] = useState(emptyGroup());
  const [editingIdx, setEditingIdx] = useState(null);

  useEffect(() => {
    axios.get(`/api/records/${id}`)
      .then(res => {
        const r = res.data;
        setMeta({
          date: r.date,
          distribution_area: r.distribution_area ? r.distribution_area.split(', ') : [],
          description: r.description || '',
          status: r.status || 'published'
        });
        setEntries((r.letters || []).map(l => {
          const nums  = (l.letter_numbers && l.letter_numbers.length > 0)
            ? l.letter_numbers
            : (l.letter_number ? l.letter_number.split('\n').filter(Boolean) : ['']);
          const dates = (l.letter_dates && l.letter_dates.length > 0)
            ? l.letter_dates
            : (l.letter_date ? l.letter_date.split('\n').filter(Boolean) : ['']);
          return {
            letter_numbers: nums,
            letter_dates:   dates,
            addresses:      (l.addresses || []).map(a => a.address_text),
            letter_type:    (l.letter_types && l.letter_types[0]) || '',
            envelope_done:  l.envelope_done ? 1 : 0
          };
        }));
      })
      .catch(() => { toast.error('রেকর্ড পাওয়া যায়নি'); navigate('/'); })
      .finally(() => setLoading(false));
  }, [id, navigate]);

  const toggleArea = a => setMeta(p => ({
    ...p,
    distribution_area: p.distribution_area.includes(a) ? p.distribution_area.filter(x=>x!==a) : [...p.distribution_area, a]
  }));

  const addLetterNum    = () => setGroup(g => ({ ...g, letter_numbers: [...g.letter_numbers,''], letter_dates:[...g.letter_dates,''] }));
  const removeLetterNum = i  => setGroup(g => ({ ...g, letter_numbers: g.letter_numbers.filter((_,j)=>j!==i), letter_dates: g.letter_dates.filter((_,j)=>j!==i) }));
  const setLetterNum    = (i,v) => setGroup(g => { const a=[...g.letter_numbers]; a[i]=v; return {...g,letter_numbers:a}; });
  const setLetterDate   = (i,v) => setGroup(g => { const a=[...g.letter_dates];   a[i]=v; return {...g,letter_dates:a}; });
  const addAddress      = () => setGroup(g => ({ ...g, addresses: ['', ...g.addresses] }));
  const removeAddress   = i  => setGroup(g => ({ ...g, addresses:g.addresses.filter((_,j)=>j!==i) }));
  const setAddress      = (i,v) => setGroup(g => { const a=[...g.addresses]; a[i]=v; return {...g,addresses:a}; });

  const addEntry = () => {
    if (!group.letter_numbers[0].trim()) { toast.error('পত্র নং দিন'); return; }
    if (!group.letter_dates[0])          { toast.error('তারিখ দিন');  return; }
    if (!group.addresses.some(a=>a.trim())) { toast.error('ঠিকানা দিন'); return; }
    setEntries(p => [...p, {
      letter_numbers: group.letter_numbers.filter(n=>n.trim()),
      letter_dates:   group.letter_dates.filter(d=>d.trim()),
      addresses:      group.addresses.filter(a=>a.trim()),
      letter_type:    group.letter_type
    }]);
    setGroup(emptyGroup());
    toast.success('এন্ট্রি যোগ হয়েছে');
  };

  const removeEntry = i => setEntries(p => p.filter((_,j)=>j!==i));

  const editEntry = (idx) => {
    const e = entries[idx];
    setGroup({
      letter_numbers: [...e.letter_numbers],
      letter_dates:   [...e.letter_dates],
      addresses:      [...e.addresses],
      letter_type:    e.letter_type || ''
    });
    setEditingIdx(idx);
    setTimeout(() => document.getElementById('entry-form')?.scrollIntoView({ behavior: 'smooth' }), 100);
  };

  const updateEntry = () => {
    if (!group.letter_numbers[0]?.trim()) { toast.error('পত্র নং দিন'); return; }
    if (!group.letter_dates[0])           { toast.error('তারিখ দিন');  return; }
    if (!group.addresses.some(a=>a.trim())) { toast.error('ঠিকানা দিন'); return; }
    setEntries(p => p.map((e, i) => i === editingIdx ? {
      letter_numbers: group.letter_numbers.filter(n=>n.trim()),
      letter_dates:   group.letter_dates.filter(d=>d.trim()),
      addresses:      group.addresses.filter(a=>a.trim()),
      letter_type:    group.letter_type,
      envelope_done:  e.envelope_done || 0
    } : e));
    setGroup(emptyGroup());
    setEditingIdx(null);
    toast.success('এন্ট্রি আপডেট হয়েছে ✓');
  };

  const cancelEdit = () => { setGroup(emptyGroup()); setEditingIdx(null); };

  const handleSubmit = async (status = 'published') => {
    if (!meta.date)                     { toast.error('তারিখ দিন'); return; }
    if (!meta.distribution_area.length) { toast.error('বিতরণ এলাকা নির্বাচন করুন'); return; }
    setSaving(status);
    try {
      const res = await axios.put(`/api/records/${id}`, {
        date: meta.date,
        distribution_area: meta.distribution_area.join(', '),
        description: meta.description,
        status,
        letters: entries.map(e => ({
          letter_numbers: e.letter_numbers,
          letter_dates:   e.letter_dates,
          addresses:      e.addresses,
          letter_type:    e.letter_type || '',
          envelope_done:  e.envelope_done || 0
        }))
      });
      if (status === 'draft') toast.success(isDraftRec ? 'ড্রাফট আপডেট হয়েছে ✓' : 'ড্রাফট সংরক্ষিত হয়েছে — প্রকাশ করলে ট্রানজিট নম্বর তৈরি হবে');
      else toast.success(isDraftRec ? `প্রকাশিত হয়েছে: ${res.data.serial_number}` : `আপডেট হয়েছে: ${res.data.serial_number}`);
      navigate('/');
    } catch { toast.error('সমস্যা হয়েছে'); }
    finally { setSaving(false); }
  };

  const totalAddr = entries.reduce((s,e)=>s+e.addresses.length,0);
  const isDraftRec = meta.status === 'draft';   // ড্রাফট = একই রেকর্ডে আপডেট, সিরিয়াল প্রকাশের সময়

  if (loading) return <div className="flex items-center justify-center py-20"><div className="spinner"></div></div>;

  return (
    <div className="fade-in max-w-4xl mx-auto space-y-5 pb-10">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/')} className="text-gray-400 hover:text-gray-600 text-xl">←</button>
        <div>
          <h1 className="text-2xl font-bold text-gray-800">রেকর্ড সম্পাদনা</h1>
          <p className="text-gray-500 text-sm">সম্পাদনার পর নতুন এন্ট্রি হিসেবে যুক্ত হবে</p>
        </div>
      </div>

      {/* META */}
      <div className="card">
        <h2 className="section-title">📌 মূল তথ্য</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div><label className="lbl">তারিখ *</label>
            <input type="date" value={meta.date} onChange={e=>setMeta({...meta,date:e.target.value})} className="inp" /></div>
          <div><label className="lbl">বিবরণ</label>
            <input type="text" value={meta.description} onChange={e=>setMeta({...meta,description:e.target.value})} className="inp" placeholder="—" /></div>
        </div>
        <div>
          <label className="lbl mb-2">বিতরণ এলাকা *</label>
          <div className="flex flex-wrap gap-5 mt-2">
            {DISTRIBUTION_AREAS.map(area => (
              <label key={area} className="flex items-center gap-2 cursor-pointer" onClick={()=>toggleArea(area)}>
                <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all
                  ${meta.distribution_area.includes(area)?'bg-[#1e3a5f] border-[#1e3a5f]':'border-gray-300'}`}>
                  {meta.distribution_area.includes(area)&&<span className="text-white text-xs font-bold">✓</span>}
                </div>
                <span className={`text-sm font-medium ${meta.distribution_area.includes(area)?'text-blue-800':'text-gray-600'}`}>{area}</span>
              </label>
            ))}
          </div>
        </div>
      </div>

      {/* EXISTING ENTRIES */}
      {entries.length > 0 && (
        <div className="card">
          <div className="flex items-center justify-between mb-3 pb-2 border-b border-gray-100">
            <h2 className="font-bold text-gray-700">📝 বিদ্যমান এন্ট্রি</h2>
            <span className="text-xs bg-blue-50 text-blue-600 px-2.5 py-1 rounded-lg">{toBanglaNumber(entries.length)} গ্রুপ · {toBanglaNumber(totalAddr)} ঠিকানা</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border border-gray-200 rounded-lg overflow-hidden">
              <thead><tr className="bg-gray-50">
                <th className="px-3 py-2 text-left font-semibold text-gray-600 border-b">#</th>
                <th className="px-3 py-2 text-left font-semibold text-gray-600 border-b">পত্র নং</th>
                <th className="px-3 py-2 text-left font-semibold text-gray-600 border-b">তারিখ</th>
                <th className="px-3 py-2 text-left font-semibold text-gray-600 border-b">ঠিকানা</th>
                <th className="px-3 py-2 text-left font-semibold text-gray-600 border-b">ধরন</th>
                <th className="px-3 py-2 border-b"></th>
              </tr></thead>
              <tbody>
                {entries.map((e,idx)=>(
                  <tr key={idx} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-3 py-2 text-center font-bold text-blue-800">{toBanglaNumber(idx+1)}</td>
                    <td className="px-3 py-2">{e.letter_numbers.map((n,i)=><div key={i} className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded mb-0.5">{n}</div>)}</td>
                    <td className="px-3 py-2 text-xs text-gray-600">{e.letter_dates.map((d,i)=><div key={i}>{d}</div>)}</td>
                    <td className="px-3 py-2">{e.addresses.map((a,i)=><div key={i} className="text-xs bg-green-50 text-green-700 px-2 py-0.5 rounded mb-0.5 whitespace-pre-line">{a}</div>)}</td>
                    <td className="px-3 py-2 text-xs text-gray-500">{e.letter_type || '—'}</td>
                    <td className="px-3 py-2 text-center">
                      <div className="flex gap-1 justify-center">
                        <button onClick={()=>editEntry(idx)} title="সম্পাদন"
                          className="text-xs bg-amber-50 hover:bg-amber-100 text-amber-700 px-2 py-1 rounded-lg transition-all">✎</button>
                        <button onClick={()=>removeEntry(idx)} title="মুছুন"
                          className="text-red-400 hover:text-red-600 text-lg leading-none px-1">×</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ADD/EDIT FORM */}
      <div className="card" id="entry-form">
        <h2 className="section-title">{editingIdx !== null ? `✎ এন্ট্রি ${toBanglaNumber(editingIdx+1)} সম্পাদনা করুন` : "➕ নতুন গ্রুপ যোগ করুন"}</h2>

        {/* 3-col header: label | dropdown | button */}
        <div className="mb-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="flex-none">
              <label className="lbl mb-0">পত্র নং ও তারিখ</label>
            </div>
            <div className="flex-1 flex justify-center">
              <select
                value={group.letter_type}
                onChange={e => setGroup(g => ({ ...g, letter_type: e.target.value }))}
                className="border border-gray-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-blue-200 bg-white max-w-[220px] w-full"
              >
                {LETTER_TYPES.map(t => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
            <div className="flex-none">
              <button onClick={addLetterNum} className="text-xs bg-blue-50 hover:bg-blue-100 text-blue-700 px-3 py-1 rounded-lg font-medium whitespace-nowrap">＋ আরেকটি পত্র নং</button>
            </div>
          </div>
          <div className="space-y-2">
            {group.letter_numbers.map((num,i)=>(
              <div key={i} className="flex gap-2 items-start">
                <div className="w-5 h-5 bg-[#1e3a5f] text-white rounded-full flex items-center justify-center text-xs flex-shrink-0 mt-2">{toBanglaNumber(i+1)}</div>
                <div className="flex-1"><LetterNumInput value={num} onChange={v=>setLetterNum(i,v)} placeholder={`পত্র নং ${toBanglaNumber(i+1)}`} /></div>
                <div className="w-40 flex-shrink-0">
                  <input type="date" value={group.letter_dates[i]||''} onChange={e=>setLetterDate(i,e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" />
                </div>
                {group.letter_numbers.length>1&&<button onClick={()=>removeLetterNum(i)} className="text-red-400 hover:text-red-600 text-xl mt-1 flex-shrink-0">×</button>}
              </div>
            ))}
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="lbl">ঠিকানা</label>
            <button onClick={addAddress} className="text-xs bg-green-50 hover:bg-green-100 text-green-700 px-3 py-1 rounded-lg font-medium">＋ আরেকটি</button>
          </div>
          <div className="space-y-2">
            {group.addresses.map((addr,i)=>(
              <div key={i} className="flex gap-2 items-start">
                <div className="w-5 h-5 bg-green-600 text-white rounded-full flex items-center justify-center text-xs flex-shrink-0 mt-2">{toBanglaNumber(i+1)}</div>
                <div className="flex-1"><AddressBox value={addr} onChange={v=>setAddress(i,v)} /></div>
                {group.addresses.length>1&&<button onClick={()=>removeAddress(i)} className="text-red-400 hover:text-red-600 text-xl mt-1 flex-shrink-0">×</button>}
              </div>
            ))}
          </div>
        </div>

        {editingIdx !== null ? (
          <div className="flex gap-3 mt-4">
            <button onClick={cancelEdit} className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-700 font-bold py-3 rounded-xl transition-all">✕ বাতিল</button>
            <button onClick={updateEntry} className="flex-1 bg-amber-500 hover:bg-amber-600 text-white font-bold py-3 rounded-xl transition-all">✎ আপডেট করুন</button>
          </div>
        ) : (
          <button onClick={addEntry} className="w-full mt-4 bg-green-600 hover:bg-green-700 text-white font-bold py-3 rounded-xl transition-all">✅ যোগ করুন</button>
        )}
      </div>

      {/* SAVE */}
      <div className="bg-gradient-to-r from-[#0f2744] to-[#1e3a5f] rounded-2xl p-6 text-white">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h3 className="font-bold text-lg">{isDraftRec ? 'ড্রাফট সংরক্ষণ / প্রকাশ করুন' : 'নতুন রেকর্ড হিসেবে সংরক্ষণ করুন'}</h3>
            <p className="text-blue-300 text-sm mt-1">{isDraftRec ? 'ড্রাফট যতবার ইচ্ছা আপডেট করা যাবে; প্রকাশ করলেই ট্রানজিট নম্বর তৈরি হবে' : 'পুরনো রেকর্ড থাকবে, নতুনটি তালিকার শুরুতে যুক্ত হবে'}</p>
          </div>
          <div className="flex gap-3 flex-wrap">
            <button onClick={() => handleSubmit('draft')} disabled={!!saving || !meta.date}
              className="bg-white/20 hover:bg-white/30 text-white font-bold px-6 py-3 rounded-xl transition-all disabled:opacity-50 border border-white/40 flex items-center gap-2">
              {saving === 'draft' ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>সংরক্ষণ...</> : isDraftRec ? '📝 ড্রাফট আপডেট করুন' : '📝 ড্রাফট করুন'}
            </button>
            <button onClick={() => handleSubmit('published')} disabled={!!saving || !entries.length}
              className="bg-yellow-400 hover:bg-yellow-300 text-blue-900 font-bold px-8 py-3 rounded-xl transition-all disabled:opacity-50 shadow-lg flex items-center gap-2">
              {saving === 'published' ? <><div className="w-4 h-4 border-2 border-blue-900/30 border-t-blue-900 rounded-full animate-spin"></div>সংরক্ষণ...</> : isDraftRec ? '🚀 প্রকাশ করুন' : '💾 সংরক্ষণ করুন'}
            </button>
          </div>
        </div>
      </div>

      <style>{`
        .card{background:white;border-radius:1rem;box-shadow:0 1px 3px rgba(0,0,0,.07);border:1px solid #f0f0f0;padding:1.5rem;}
        .section-title{font-weight:700;color:#374151;margin-bottom:1rem;padding-bottom:.5rem;border-bottom:1px solid #f3f4f6;font-size:.95rem;}
        .lbl{display:block;font-size:.8rem;font-weight:600;color:#4b5563;margin-bottom:.35rem;}
        .inp{width:100%;border:1px solid #e5e7eb;border-radius:.5rem;padding:.5rem .75rem;font-size:.875rem;outline:none;font-family:inherit;}
        .inp:focus{border-color:#93c5fd;box-shadow:0 0 0 3px rgba(147,197,253,.25);}
      `}</style>
    </div>
  );
}
