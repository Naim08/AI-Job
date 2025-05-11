import React, { useState } from 'react';
import ReactDOM from 'react-dom/client';
import AppLayout, { PageName } from './components/AppLayout';
import HistoryPage from './pages/HistoryPage';
import ActivityPage from './pages/ActivityPage';
import SettingsPage from './pages/SettingsPage';
import { AuthGate } from './components/AuthGate';
import './index.css'; // Ensure Tailwind/DaisyUI styles are imported

function App() {
  const [activePage, setActivePage] = useState<PageName>('history');

  const renderPage = () => {
    switch (activePage) {
      case 'history':
        return <HistoryPage />;
      case 'activity':
        return <ActivityPage />;
      case 'settings':
        return <SettingsPage />;
      default:
        return null;
    }
  };

  return (
    <AuthGate>
      {(user, logout) => (
        <AppLayout 
          user={user} 
          onLogout={logout} 
          activePage={activePage} 
          onPageChange={setActivePage}
        >
          {renderPage()}
        </AppLayout>
      )}
    </AuthGate>
  );
}

// Ensure there's an element to render into, or create one.
let rootElement = document.getElementById('root');
if (!rootElement) {
  rootElement = document.createElement('div');
  rootElement.id = 'root';
  document.body.appendChild(rootElement);
}

const root = ReactDOM.createRoot(rootElement);

root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
); 