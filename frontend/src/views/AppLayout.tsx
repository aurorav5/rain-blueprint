import { Outlet } from 'react-router-dom'
import { TopBar } from '@/components/layout/TopBar'
import { TabBar } from '@/components/layout/TabBar'
import { TransportBar } from '@/components/transport/TransportBar'

export default function AppLayout() {
  return (
    <div className="min-h-screen h-screen bg-rain-bg text-rain-text flex flex-col overflow-hidden">
      <TopBar />
      <TabBar />
      <TransportBar />
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  )
}
