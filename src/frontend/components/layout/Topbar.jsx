import { useApp } from '../../context/AppContext'
import Icon from '../ui/Icon'

export default function Topbar({ route, setRoute, jobTitle, onNewJob }) {
  const { settings, saveSetting } = useApp()
  const isDark = settings.theme === 'dark'

  const crumbs = () => {
    if (route === 'dash')     return <><span className="now">Dashboard</span></>
    if (route === 'board')    return <><span className="now">Board</span></>
    if (route === 'chat')     return <><span className="now">Chat</span></>
    if (route === 'settings') return <><span className="now">Settings</span></>
    if (route === 'detail')   return <>
      <span onClick={() => setRoute('board')}>Board</span>
      <span className="sep">/</span>
      <span className="now">{jobTitle || 'Job'}</span>
    </>
    return null
  }

  return (
    <div className="topbar">
      <div className="crumbs">{crumbs()}</div>
      <div className="topbar-right">
        <button
          className="btn btn-ghost icon-btn"
          title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          onClick={() => saveSetting('theme', isDark ? 'light' : 'dark')}
        >
          <Icon name={isDark ? 'sun' : 'moon'} size={14} />
        </button>
        {route !== 'settings' && (
          <button className="btn btn-sm" onClick={onNewJob}>
            <Icon name="plus" size={11} /> New job
          </button>
        )}
      </div>
    </div>
  )
}
