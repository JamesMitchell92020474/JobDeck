import { useState } from 'react'
import { AppProvider } from './context/AppContext'
import Sidebar    from './components/layout/Sidebar'
import Topbar     from './components/layout/Topbar'
import Dashboard  from './pages/Dashboard'
import Board      from './pages/Board'
import Chat       from './pages/Chat'
import Settings   from './pages/Settings'
import CardDetail from './components/cards/CardDetail'

function AppInner() {
  const [route,       setRoute]       = useState('dash')
  const [detailJobId, setDetailJobId] = useState(null)

  const navigate = (r) => setRoute(r)

  const openDetail = (id) => {
    if (id) { setDetailJobId(id); setRoute('detail') }
  }

  const topbarTitle = route === 'detail' ? 'Job Detail' : ''

  return (
    <div className="app">
      <Sidebar route={route} setRoute={navigate} />
      <main className="main">
        <Topbar route={route} setRoute={navigate} jobTitle={topbarTitle} />

        {route === 'dash'  && (
          <Dashboard setRoute={navigate} setDetailJobId={openDetail} />
        )}
        {route === 'board' && (
          <Board setRoute={navigate} setDetailJobId={openDetail} />
        )}
        {route === 'detail' && detailJobId && (
          <CardDetail jobId={detailJobId} setRoute={navigate} />
        )}
        {route === 'chat' && <Chat />}
        {route === 'settings' && <Settings />}
      </main>
    </div>
  )
}

export default function App() {
  return (
    <AppProvider>
      <AppInner />
    </AppProvider>
  )
}
