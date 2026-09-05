import { ArrowLeftRight, Clock, Home, User } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';

const ITEMS = [
  { path: '/home', label: 'Home', icon: Home, kind: 'regular' },
  { path: '/send', label: 'Send', icon: ArrowLeftRight, kind: 'send' },
  { path: '/history', label: 'History', icon: Clock, kind: 'regular' },
  { path: '/profile', label: 'Profile', icon: User, kind: 'regular' },
];

export function BottomNav() {
  const navigate = useNavigate();
  const { pathname } = useLocation();

  return (
    <nav className="bottom-nav">
      {ITEMS.map(({ path, label, icon: Icon, kind }) => {
        const active = pathname.startsWith(path);
        return (
          <button
            key={path}
            className={`nav-item ${active ? 'active' : ''} ${kind === 'send' ? 'nav-item--send' : ''}`}
            onClick={() => navigate(path)}
          >
            <span className="nav-pill">
              <Icon size={kind === 'send' ? 20 : 19} />
            </span>
            <span>{label}</span>
          </button>
        );
      })}
    </nav>
  );
}