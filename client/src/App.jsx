/**
 * @file App.jsx
 * @description The route table: maps every URL to its page component and mounts
 * the persistent bottom navigation. Page logic does NOT belong here — only
 * routing structure.
 */
import { createBrowserRouter, RouterProvider, Outlet } from 'react-router-dom'

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
import RouteErrorPage from './pages/RouteErrorPage'
import RunDetailPage from './pages/RunDetailPage'

/**
 * Shared chrome rendered on every route: the active page via Outlet, plus the
 * fixed bottom nav.
 *
 * @component
 * @returns {JSX.Element}
 */
function RootLayout() {
  return (
    // paddingBottom matches BottomNav's fixed 60px height so page content
    // can never be hidden underneath it. Change one → change both.
    <div style={{ paddingBottom: '60px' }}>
      <Outlet />
      <BottomNav />
    </div>
  )
}

// Module-level so it's built once, not recreated every render. A data router
// (rather than <BrowserRouter>) is required for useBlocker (NewRunPage.jsx)
// to intercept browser Back/Forward navigation, not just in-app link clicks.
const router = createBrowserRouter([
  {
    element: <RootLayout />,
    // At the root, not per page: an errorElement replaces the element of the route
    // it sits on, so this one gives up BottomNav on the error screen in exchange for
    // also catching a crash inside RootLayout or BottomNav themselves. Without it,
    // any uncaught render error shows React Router's built-in screen — stack trace
    // included, in production builds too.
    errorElement: <RouteErrorPage />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: 'operators', element: <OperatorsPage /> },
      { path: 'machines', element: <MachinesPage /> },
      { path: 'products', element: <ProductsPage /> },
      { path: 'products/:productId', element: <ProductDetailPage /> },
      { path: 'materials', element: <MaterialsPage /> },
      { path: 'parameters', element: <ParametersPage /> },
      { path: 'recipes', element: <RecipesPage /> },
      { path: 'recipes/:recipeId', element: <RecipeDetailPage /> },
      { path: 'runs', element: <ProductionRunsPage /> },
      // runs/new must be declared before runs/:id conceptually — React
      // Router v7 ranks static segments above params automatically, but the
      // order here keeps that intent readable.
      { path: 'runs/new', element: <NewRunPage /> },
      { path: 'admin', element: <AdminPage /> },
      { path: 'admin/machines/:machineId', element: <MachineDetailPage /> },
      { path: 'runs/:id', element: <RunDetailPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
])

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
  return <RouterProvider router={router} />
}

export default App
