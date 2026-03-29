import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/auth'
import { lazy, Suspense } from 'react'
import AppLayout from './views/AppLayout'
import LoginView from './views/LoginView'
import RegisterView from './views/RegisterView'

// Tab pages — lazy loaded for fast initial render
const MasteringTab  = lazy(() => import('@/components/tabs/MasteringTab'))
const StemsTab      = lazy(() => import('@/components/tabs/StemsTab'))
const ReferenceTab  = lazy(() => import('@/components/tabs/ReferenceTab'))
const RepairTab     = lazy(() => import('@/components/tabs/RepairTab'))
const SpatialTab    = lazy(() => import('@/components/tabs/SpatialTab'))
const QCTab         = lazy(() => import('@/components/tabs/QCTab'))
const ExportTab     = lazy(() => import('@/components/tabs/ExportTab'))
const DistributeTab = lazy(() => import('@/components/tabs/DistributeTab'))
const CollabTab     = lazy(() => import('@/components/tabs/CollabTab'))
const AnalyticsTab  = lazy(() => import('@/components/tabs/AnalyticsTab'))
const RoadmapTab    = lazy(() => import('@/components/tabs/RoadmapTab'))
const DocsTab       = lazy(() => import('@/components/tabs/DocsTab'))
const SettingsTab   = lazy(() => import('@/components/tabs/SettingsTab'))

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuthStore()
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" replace />
}

function TabFallback() {
  return (
    <div className="flex items-center justify-center h-64">
      <div className="flex flex-col items-center gap-3">
        <div className="w-6 h-6 border-2 border-rain-purple border-t-transparent rounded-full animate-spin" />
        <span className="text-[9px] font-mono text-rain-dim tracking-widest">LOADING MODULE...</span>
      </div>
    </div>
  )
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const S = (C: React.LazyExoticComponent<React.ComponentType<any>>) => (
  <Suspense fallback={<TabFallback />}><C /></Suspense>
)

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login"    element={<LoginView />} />
        <Route path="/register" element={<RegisterView />} />
        <Route
          path="/*"
          element={
            <PrivateRoute>
              <AppLayout />
            </PrivateRoute>
          }
        >
          {/* 13-tab suite — beats Aurora's 12-tab app */}
          <Route index          element={S(MasteringTab)} />
          <Route path="stems"      element={S(StemsTab)} />
          <Route path="reference"  element={S(ReferenceTab)} />
          <Route path="repair"     element={S(RepairTab)} />
          <Route path="spatial"    element={S(SpatialTab)} />
          <Route path="qc"         element={S(QCTab)} />
          <Route path="export"     element={S(ExportTab)} />
          <Route path="distribute" element={S(DistributeTab)} />
          <Route path="collab"     element={S(CollabTab)} />
          <Route path="analytics"  element={S(AnalyticsTab)} />
          <Route path="roadmap"    element={S(RoadmapTab)} />
          <Route path="docs"       element={S(DocsTab)} />
          <Route path="settings"   element={S(SettingsTab)} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
