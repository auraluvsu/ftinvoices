import { createBrowserRouter, Navigate } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { AppDataProvider } from './store';
import { AuthGate } from './auth';
import { Layout } from './Layout';
import { ReceiptsPage } from './pages/ReceiptsPage';
import { HomePage } from './pages/HomePage';

const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'receipts', element: <ReceiptsPage /> },
      { path: '*', element: <Navigate to="/" replace /> },
      // Printable report for a date range (see ReportPage); loaded on demand.
      { path: 'report', lazy: async () => ({ Component: (await import('./pages/ReportPage')).ReportPage }) },
    ],
  },
]);

export default function App() {
  return (
    <AuthGate>
      <AppDataProvider>
        <RouterProvider router={router} />
      </AppDataProvider>
    </AuthGate>
  );
}
