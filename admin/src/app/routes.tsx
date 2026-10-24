import { createBrowserRouter } from 'react-router'
import Layout, { RequirePerm } from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Events from './pages/Events'
import Bookings from './pages/Bookings'
import Machines from './pages/Machines'
import Templates from './pages/Templates'
import Readings from './pages/Readings'
import Team from './pages/Team'
import Reports from './pages/Reports'

const guard = (perm: Parameters<typeof RequirePerm>[0]['perm'], el: React.ReactNode) => <RequirePerm perm={perm}>{el}</RequirePerm>

export const router = createBrowserRouter([
  { path: '/login', Component: Login },
  {
    path: '/',
    Component: Layout,
    children: [
      { index: true, element: guard('dashboard', <Dashboard />) },
      { path: 'events', element: guard('events', <Events />) },
      { path: 'bookings', element: guard('bookings', <Bookings />) },
      { path: 'machines', element: guard('machines', <Machines />) },
      { path: 'templates', element: guard('templates', <Templates />) },
      { path: 'readings', element: guard('sessions', <Readings />) },
      { path: 'users', element: guard('sessions', <Readings />) },
      { path: 'team', element: guard('team', <Team />) },
      { path: 'reports', element: guard('reports', <Reports />) },
      { path: '*', element: guard('dashboard', <Dashboard />) },
    ],
  },
], { basename: import.meta.env.BASE_URL.replace(/\/$/, '') || '/' })
