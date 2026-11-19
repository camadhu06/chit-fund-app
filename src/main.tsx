import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, NavLink, Route, Routes } from 'react-router';
import './index.css';
import Dashboard from './pages/Dashboard';
import Members from './pages/Members';
import MemberDetail from './pages/MemberDetail';
import Groups from './pages/Groups';
import GroupDetail from './pages/GroupDetail';
import Payments from './pages/Payments';
import Reports from './pages/Reports';
import SqlLab from './pages/SqlLab';

const nav = [
  { to: '/', label: 'Dashboard', icon: '◧' },
  { to: '/groups', label: 'Chit Groups', icon: '◎' },
  { to: '/members', label: 'Members', icon: '◉' },
  { to: '/payments', label: 'Payments', icon: '₹' },
  { to: '/reports', label: 'Reports', icon: '▤' },
  { to: '/sql', label: 'SQL Lab', icon: '⌘' },
];

function Layout() {
  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <aside className="flex shrink-0 flex-col border-b border-slate-800 bg-ink text-slate-300 md:sticky md:top-0 md:h-screen md:w-60 md:border-b-0">
        <div className="flex items-center gap-2.5 px-5 py-5">
          <div className="grid h-9 w-9 place-items-center rounded-lg bg-brand-500 text-lg font-bold text-white">₹</div>
          <div>
            <div className="font-semibold text-white">ChitBook</div>
            <div className="text-xs text-slate-400">Chit Fund Manager</div>
          </div>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-3 pb-3 md:flex-col md:pb-0">
          {nav.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition ${
                  isActive ? 'bg-white/10 text-white' : 'hover:bg-white/5 hover:text-white'}`}>
              <span className="w-4 text-center opacity-80">{n.icon}</span>{n.label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto hidden px-5 py-4 text-xs text-slate-500 md:block">DBMS Project · PostgreSQL</div>
      </aside>
      <main className="min-w-0 flex-1 p-4 md:p-8">
        <div className="mx-auto max-w-6xl">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/groups" element={<Groups />} />
            <Route path="/groups/:id" element={<GroupDetail />} />
            <Route path="/members" element={<Members />} />
            <Route path="/members/:id" element={<MemberDetail />} />
            <Route path="/payments" element={<Payments />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/sql" element={<SqlLab />} />
          </Routes>
        </div>
      </main>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter><Layout /></BrowserRouter>
  </StrictMode>,
);
