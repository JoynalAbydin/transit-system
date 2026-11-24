import React, { useState } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

// ফুটারের পেজ (frontend/public/ এর html ফাইল) ও কপিরাইট টেক্সট — এখানে বদলান
const FOOTER_PAGES = [
  { label: 'About',   file: 'about.html' },
  { label: 'Blog',    file: 'blog.html' },
  { label: 'Contact', file: 'contact.html' },
];
const COPYRIGHT_TEXT = `© ${new Date().getFullYear()} ট্রানজিট ব্যবস্থাপনা। সর্বস্বত্ব সংরক্ষিত।`;

export default function Layout() {
  const { user, logout, isAdmin } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  const handleLogout = () => { logout(); navigate('/login'); };

  const navLinks = [
    { to: '/',        label: '📋 ড্যাশবোর্ড',   match: loc => loc === '/' },
    { to: '/create',  label: '➕ নতুন তৈরি',      match: loc => loc === '/create' },
    { to: '/entries', label: '✏️ এন্ট্রি সম্পাদন', match: loc => loc.startsWith('/entries') },
    ...(isAdmin ? [{ to: '/admin', label: '🛡️ মাই অ্যাডমিন', match: loc => loc.startsWith('/admin') }] : [])
  ];

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Navbar */}
      <nav className="bg-gradient-to-r from-[#0f2744] to-[#1e3a5f] shadow-lg sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <Link to="/" className="flex items-center gap-3">
              <div className="w-9 h-9 bg-yellow-400 rounded-lg flex items-center justify-center font-black text-blue-900 text-sm">এন</div>
              <div>
                <div className="text-white font-bold text-sm leading-tight">ট্রানজিট ব্যবস্থাপনা</div>
                <div className="text-blue-300 text-xs">অটোমোটেড সিস্টেম</div>
              </div>
            </Link>

            {/* Nav Links */}
            <div className="hidden md:flex items-center gap-1">
              {navLinks.map(link => (
                <Link key={link.to} to={link.to}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-all
                    ${link.match(location.pathname)
                      ? 'bg-white/20 text-white'
                      : 'text-blue-200 hover:text-white hover:bg-white/10'}`}>
                  {link.label}
                </Link>
              ))}
            </div>

            {/* User menu */}
            <div className="relative">
              <button onClick={() => setMenuOpen(!menuOpen)}
                className="flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white px-3 py-2 rounded-lg transition-all">
                <div className="w-7 h-7 bg-yellow-400 rounded-full flex items-center justify-center text-blue-900 font-bold text-xs">
                  {(user?.full_name || user?.username || 'U')[0]}
                </div>
                <span className="text-sm hidden sm:block">{user?.full_name || user?.username}</span>
                <span className="text-xs hidden sm:block bg-white/20 px-1.5 py-0.5 rounded">
                  {user?.role === 'ADMIN' ? 'অ্যাডমিন' : 'ইউজার'}
                </span>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {menuOpen && (
                <div className="absolute right-0 top-full mt-2 w-48 bg-white rounded-xl shadow-xl border border-gray-100 py-1 z-50">
                  <div className="px-4 py-2 border-b border-gray-100">
                    <div className="text-sm font-semibold text-gray-800">{user?.full_name || user?.username}</div>
                    <div className="text-xs text-gray-500">{user?.username}</div>
                  </div>
                  <button onClick={handleLogout}
                    className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors">
                    🚪 লগআউট
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </nav>

      {/* Mobile nav */}
      <div className="md:hidden bg-[#0f2744] border-t border-white/10 flex overflow-x-auto">
        {navLinks.map(link => (
          <Link key={link.to} to={link.to}
            className={`px-4 py-2.5 text-xs font-medium whitespace-nowrap transition-all
              ${link.match(location.pathname) ? 'bg-white/20 text-white' : 'text-blue-300 hover:text-white'}`}>
            {link.label}
          </Link>
        ))}
      </div>

      <main className="max-w-7xl w-full mx-auto px-4 py-6 flex-1">
        <Outlet />
      </main>

      {/* Footer: নেভিগেশন + কপিরাইট */}
      <footer className="border-t border-gray-200 bg-white mt-6">
        <div className="max-w-7xl mx-auto px-4 py-5 flex flex-col items-center gap-3">
          <nav className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm font-medium">
            <Link to="/" className="text-gray-600 hover:text-[#1e3a5f] transition-colors">Home</Link>
            {FOOTER_PAGES.map(p => (
              <a key={p.file} href={`${process.env.PUBLIC_URL || '.'}/${p.file}`}
                className="text-gray-600 hover:text-[#1e3a5f] transition-colors">{p.label}</a>
            ))}
          </nav>
          <p className="text-xs text-gray-400 text-center">{COPYRIGHT_TEXT}</p>
        </div>
      </footer>

      {menuOpen && <div className="fixed inset-0 z-30" onClick={() => setMenuOpen(false)} />}
    </div>
  );
}
