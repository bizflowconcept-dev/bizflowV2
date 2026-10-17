import { RouterProvider } from 'react-router'
import { router } from './routes'
import PwaUi from './pwa/PwaUi'
import { ToastProvider } from './components/ui'

export default function App() {
  return (
    <ToastProvider>
      <RouterProvider router={router} />
      <PwaUi />
    </ToastProvider>
  )
}
