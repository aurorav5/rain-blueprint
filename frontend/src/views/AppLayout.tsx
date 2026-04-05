import { useEffect } from 'react'
import { Outlet } from 'react-router-dom'
import { TopBar } from '@/components/layout/TopBar'
import { Sidebar } from '@/components/layout/Sidebar'
import { RightSidebar } from '@/components/layout/RightSidebar'

export default function AppLayout() {
  useEffect(() => {
    // Add roon-mode class to body for global backgrounds
    document.body.classList.add('roon-mode')
    return () => {
      document.body.classList.remove('roon-mode')
    }
  }, [])

  return (
    <div className="relative flex h-screen w-full overflow-hidden text-zinc-100 p-4">
      {/* Receding Cyan Cyber-Grid */}
      <div className="crystal-cyan-grid" />
      
      {/* Primary Container: Heavy, deep, 3D polished glass frame */}
      <div className="crystal-glass relative z-10 w-full h-full flex flex-col rounded-[24px] overflow-hidden">
        
        {/* Header / Control Bar */}
        <TopBar />

        {/* Main 3-pane layout */}
        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* Left Vertical Navigation Column */}
          <Sidebar />

          {/* Main Content Workspace */}
          <main className="flex-1 relative z-10 overflow-hidden flex flex-col">
            <div className="flex-1 overflow-auto page-enter h-full w-full relative p-6">
              <Outlet />
            </div>
          </main>

          {/* Metering and Platforms Panel */}
          <RightSidebar />
        </div>
      </div>
    </div>
  )
}
