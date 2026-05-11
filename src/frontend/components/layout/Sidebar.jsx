import { useApp } from '../../context/AppContext'
import Icon from '../ui/Icon'

export default function Sidebar({ route, setRoute }) {
  const { settings, columnCounts } = useApp()
  const total = Object.values(columnCounts).reduce((a, b) => a + b, 0)
  const name  = settings.display_name || 'James Mitchell'
  const email = settings.email || 'james@mitchell.nz'
  const initials = name.split(' ').map(w => w[0]).join('').slice(0, 2)

  const nav = [
    { id: 'dash',     label: 'Home',      icon: 'home'     },
    { id: 'board',    label: 'Job Board', icon: 'board',  badge: total },
    { id: 'chat',     label: 'Chat',      icon: 'chat'     },
    { id: 'settings', label: 'Settings',  icon: 'settings' },
  ]

  const isActive = (id) => route === id || (id === 'board' && route === 'detail')

  return (
    <aside className="sidebar">
      <div className="brand">
        <span className="brand-mark">
          Job<em style={{ fontStyle: 'italic' }}>Deck</em>
          <span className="dot">.</span>
        </span>
      </div>

      <nav className="nav">
        {nav.map(item => (
          <div
            key={item.id}
            className={`nav-item ${isActive(item.id) ? 'active' : ''}`}
            onClick={() => setRoute(item.id)}
          >
            <span className="nav-icon"><Icon name={item.icon} size={14} /></span>
            <span>{item.label}</span>
            {item.badge != null && (
              <span className="nav-num">{item.badge}</span>
            )}
          </div>
        ))}
      </nav>

      <div className="sidebar-foot">
        <div className="sidebar-foot-row">
          <div className="avatar">{initials}</div>
          <div>
            <div className="sidebar-foot-name">{name}</div>
            <div className="sidebar-foot-mail">{email}</div>
          </div>
        </div>
      </div>
    </aside>
  )
}
