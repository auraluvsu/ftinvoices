import { createBrowserRouter, Navigate } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { AppDataProvider } from './store';
import { Layout } from './Layout';
import { ReceiptsPage } from './pages/ReceiptsPage';

const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { index: true, element: <Navigate to="/receipts" replace /> },
      { path: 'receipts', element: <ReceiptsPage /> },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
]);

export default function App() {
  return (
    <AppDataProvider>
      <RouterProvider router={router} />
    </AppDataProvider>
  );
}
