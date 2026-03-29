import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/auth'
import AppLayout from './views/AppLayout'
import LoginView from './views/LoginView'
import RegisterView from './views/RegisterView'
import { MasteringTab } from './components/tabs/MasteringTab'
import { StemsTab } from './components/tabs/StemsTab'
import { AIETab } from './components/tabs/AIETab'

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuthStore()
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" replace />
}

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
          <Route index       element={<MasteringTab />} />
          <Route path="stems"   element={<StemsTab />} />
          <Route path="aie"     element={<AIETab />} />
          <Route path="library" element={<div className="p-4 text-rain-dim font-mono text-sm">LIBRARY — PART-6</div>} />
          <Route path="release" element={<div className="p-4 text-rain-dim font-mono text-sm">RELEASE — PART-9</div>} />
          <Route path="settings" element={<div className="p-4 text-rain-dim font-mono text-sm">SETTINGS — PART-12</div>} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
