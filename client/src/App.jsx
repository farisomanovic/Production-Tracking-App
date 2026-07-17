/**
 * @file App.jsx
 * @description The route table: maps every URL to its page component and mounts
 * the persistent bottom navigation. Page logic does NOT belong here — only
 * routing structure.
 */
import { BrowserRouter, Routes, Route } from 'react-router-dom'

import BottomNav from './components/BottomNav'

import DashboardPage from './pages/DashboardPage'
import OperatorsPage from './pages/OperatorsPage'
import MachinesPage from './pages/MachinesPage'
import MachineDetailPage from './pages/MachineDetailPage'
import ProductsPage from './pages/ProductsPage'
import ProductDetailPage from './pages/ProductDetailPage'
import MaterialsPage from './pages/MaterialsPage'
import ParametersPage from './pages/ParametersPage'
import RecipesPage from './pages/RecipesPage'
import RecipeDetailPage from './pages/RecipeDetailPage'
import ProductionRunsPage from './pages/ProductionRunsPage'
import AdminPage from './pages/AdminPage'
import NewRunPage from './pages/NewRunPage'
import NotFoundPage from './pages/NotFoundPage'
import RunDetailPage from './pages/RunDetailPage'

/**
 * Renders the router tree with a fixed bottom nav on every page.
 *
 * @component
 * @returns {JSX.Element}
 *
 * @example
 * <App />
 */
function App() {
  return (
    <BrowserRouter>
      {/* paddingBottom matches BottomNav's fixed 60px height so page content
          can never be hidden underneath it. Change one → change both. */}
      <div style={{ paddingBottom: '60px' }}>
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/operators" element={<OperatorsPage />} />
          <Route path="/machines" element={<MachinesPage />} />
          <Route path="/products" element={<ProductsPage />} />
          <Route path="/products/:productId" element={<ProductDetailPage />} />
          <Route path="/materials" element={<MaterialsPage />} />
          <Route path="/parameters" element={<ParametersPage />} />
          <Route path="/recipes" element={<RecipesPage />} />
          <Route path="/recipes/:recipeId" element={<RecipeDetailPage />} />
          <Route path="/runs" element={<ProductionRunsPage />} />
          {/* /runs/new must be declared before /runs/:id conceptually — React
              Router v7 ranks static segments above params automatically, but the
              order here keeps that intent readable. */}
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
