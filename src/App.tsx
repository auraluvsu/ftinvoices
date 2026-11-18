import { createBrowserRouter, Navigate } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { AppDataProvider } from './store';
import { AuthGate } from './auth';
import { Layout } from './Layout';

const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      // Each page loads as its own chunk the first time it's opened.
      { index: true, lazy: async () => ({ Component: (await import('./pages/HomePage')).HomePage }) },
      { path: 'receipts', lazy: async () => ({ Component: (await import('./pages/ReceiptsPage')).ReceiptsPage }) },
      { path: '*', element: <Navigate to="/" replace /> },
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
