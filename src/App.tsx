import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore }       from './stores/authStore'
import { useThemeStore }      from './stores/themeStore'
import { LoginPage }          from './pages/LoginPage'
import { RegisterPage }       from './pages/RegisterPage'
import { UnlockPage }         from './pages/UnlockPage'
import { ResetPasswordPage }  from './pages/ResetPasswordPage'
import { DeleteAccountPage }  from './pages/DeleteAccountPage'
import { DashboardPage }      from './pages/DashboardPage'
import { InventoryPage }      from './pages/InventoryPage'
import { UnassignedPage }     from './pages/UnassignedPage'
import { AddItemPage }        from './pages/AddItemPage'
import { CategoriesPage }     from './pages/CategoriesPage'
import { LocationsPage }      from './pages/LocationsPage'
import { SettingsPage }       from './pages/SettingsPage'
import { AdminPage }          from './pages/AdminPage'
import { AppLayout }          from './components/Layout/AppLayout'

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, cryptoReady } = useAuthStore()
  if (!isAuthenticated) return <Navigate to="/login" replace />
  if (!cryptoReady)     return <Navigate to="/unlock" replace />
  return <>{children}</>
}

function RequireAdmin({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, cryptoReady, isAdmin } = useAuthStore()
  if (!isAuthenticated || !cryptoReady) return <Navigate to="/login" replace />
  if (!isAdmin) return <Navigate to="/" replace />
  return <>{children}</>
}

export default function App() {
  const { initSession }     = useAuthStore()
  const { init: initTheme } = useThemeStore()
  useEffect(() => { initSession(); initTheme() }, [initSession, initTheme])

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login"          element={<LoginPage />} />
        <Route path="/register"       element={<RegisterPage />} />
        <Route path="/unlock"         element={<UnlockPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/delete-account" element={<DeleteAccountPage />} />
        <Route path="/" element={<RequireAuth><AppLayout /></RequireAuth>}>
          <Route index              element={<DashboardPage />} />
          <Route path="inventory"   element={<InventoryPage />} />
          <Route path="unassigned"  element={<UnassignedPage />} />
          <Route path="add"         element={<AddItemPage />} />
          <Route path="edit/:id"    element={<AddItemPage />} />
          <Route path="categories"  element={<CategoriesPage />} />
          <Route path="locations"   element={<LocationsPage />} />
          <Route path="settings"    element={<SettingsPage />} />
        </Route>
        <Route path="/admin" element={<RequireAdmin><AdminPage /></RequireAdmin>} />
        <Route path="*"      element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
