import KanbanBoard from '../components/kanban/KanbanBoard'

export default function Board({ setRoute, setDetailJobId }) {
  return <KanbanBoard setRoute={setRoute} setDetailJobId={setDetailJobId} />
}
