import { BrowserRouter, Routes, Route } from 'react-router-dom'

import BottomNav from './components/BottomNav'

import DashboardPage from './pages/DashboardPage'
import OperatorsPage from './pages/OperatorsPage'
import MachinesPage from './pages/MachinesPage'
import MachineDetailPage from './pages/MachineDetailPage'
import ProductsPage from './pages/ProductsPage'
import MaterialsPage from './pages/MaterialsPage'
import ParametersPage from './pages/ParametersPage'
import RecipesPage from './pages/RecipesPage'
import ProductionRunsPage from './pages/ProductionRunsPage'
import AdminPage from './pages/AdminPage'
import NewRunPage from './pages/NewRunPage'
import NotFoundPage from './pages/NotFoundPage'
import RunDetailPage from './pages/RunDetailPage'

function App() {
  return (
    <BrowserRouter>
      <div style={{ paddingBottom: '60px' }}>
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/operators" element={<OperatorsPage />} />
          <Route path="/machines" element={<MachinesPage />} />
          <Route path="/products" element={<ProductsPage />} />
          <Route path="/materials" element={<MaterialsPage />} />
          <Route path="/parameters" element={<ParametersPage />} />
          <Route path="/recipes" element={<RecipesPage />} />
          <Route path="/runs" element={<ProductionRunsPage />} />
          <Route path="/runs/new" element={<NewRunPage />} />
          <Route path="/admin" element={<AdminPage />} />
          <Route path="/admin/machines/:machineId" element={<MachineDetailPage />} />
          <Route path='/runs/:id' element={<RunDetailPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
        <BottomNav />
      </div>
    </BrowserRouter>
  )
}

export default App
