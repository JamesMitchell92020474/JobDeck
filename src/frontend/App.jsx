import { useState, useEffect } from 'react'
import { AppProvider } from './context/AppContext'
import { useApp } from './context/AppContext'
import Sidebar      from './components/layout/Sidebar'
import Topbar       from './components/layout/Topbar'
import Dashboard    from './pages/Dashboard'
import Board        from './pages/Board'
import Chat         from './pages/Chat'
import Settings     from './pages/Settings'
import CardDetail   from './components/cards/CardDetail'
import AddJobModal  from './components/cards/AddJobModal'
import SetupWizard  from './pages/SetupWizard'

function AppInner() {
  const [route,       setRoute]       = useState('dash')
  const [detailJobId, setDetailJobId] = useState(null)
  const [addingJob,   setAddingJob]   = useState(false)
  const { setJobs } = useApp()

  const navigate = (r) => setRoute(r)

  const openDetail = (id) => {
    if (id) { setDetailJobId(id); setRoute('detail') }
  }

  const topbarTitle = route === 'detail' ? 'Job Detail' : ''

  return (
    <div className="app">
      <Sidebar route={route} setRoute={navigate} />
      <main className="main">
        <Topbar
          route={route}
          setRoute={navigate}
          jobTitle={topbarTitle}
          onNewJob={() => setAddingJob(true)}
        />

        {route === 'dash'  && (
          <Dashboard setRoute={navigate} setDetailJobId={openDetail} onNewJob={() => setAddingJob(true)} />
        )}
        {route === 'board' && (
          <Board setRoute={navigate} setDetailJobId={openDetail} />
        )}
        {route === 'detail' && detailJobId && (
          <CardDetail jobId={detailJobId} setRoute={navigate} />
        )}
        {route === 'chat' && <Chat />}
        {route === 'settings' && <Settings />}
        {addingJob && (
          <AddJobModal
            initialStatus="Interested"
            onSaved={job => { setJobs(prev => [...prev, job]); setAddingJob(false); openDetail(job.id) }}
            onCancel={() => setAddingJob(false)}
          />
        )}
      </main>
    </div>
  )
}

export default function App() {
  const [setup, setSetup] = useState(null) // null = checking

  useEffect(() => {
    fetch('/api/setup/status')
      .then(r => r.json())
      .then(d => setSetup(d))
      .catch(() => setSetup({ needed: false }))

    const handler = () => {
      fetch('/api/setup/status')
        .then(r => r.json())
        .then(d => setSetup({ ...d, needed: false, forced: true }))
        .catch(() => {})
    }
    window.addEventListener('preview-wizard', handler)
    return () => window.removeEventListener('preview-wizard', handler)
  }, [])

  if (setup === null) return null // brief check, no flash
  if (setup.needed) return <SetupWizard defaults={setup.defaults} />
  if (setup.forced) return <SetupWizard defaults={setup.defaults} onDismiss={() => setSetup(s => ({ ...s, forced: false }))} />

  return (
    <AppProvider>
      <AppInner />
    </AppProvider>
  )
}
