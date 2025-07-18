import React, { useState, useEffect } from "react";
import ReactDOM from "react-dom/client";
import AppLayout, { PageName } from "./components/AppLayout";
import HistoryPage from "./pages/HistoryPage";
import EnhancedHistoryPage from "./pages/EnhancedHistoryPage";
import ActivityPage from "./pages/ActivityPage";
import SettingsPage from "./pages/SettingsPage";
import DashboardPage from "./pages/DashboardPage";
import { AuthGate } from "./components/AuthGate";
import "./index.css"; // Ensure Tailwind/DaisyUI styles are imported
import CaptchaModal from "./components/CaptchaModal";
import { ActivityProvider } from "./contexts/ActivityContext"; // Import ActivityProvider

function App() {
  const [activePage, setActivePage] = useState<PageName>("dashboard");
  const [showCaptchaModal, setShowCaptchaModal] = useState(false);
  const [useEnhancedHistory, setUseEnhancedHistory] = useState(true);

  useEffect(() => {
    // Set up listener for captcha detection events from main process
    const handleCaptchaDetected = () => {
      console.log("LinkedIn checkpoint detected, showing CAPTCHA modal");
      setShowCaptchaModal(true);
    };
    window.addEventListener("captcha-detected", handleCaptchaDetected);

    // Session management is now handled by AuthGate component
    console.log(
      "[Renderer] Session management is handled by AuthGate component"
    );

    return () => {
      window.removeEventListener("captcha-detected", handleCaptchaDetected);
    };
  }, []);

  const renderPage = () => {
    switch (activePage) {
      case "dashboard":
        return <DashboardPage />;
      case "history":
        return useEnhancedHistory ? <EnhancedHistoryPage /> : <HistoryPage />;
      case "activity":
        return <ActivityPage />;
      case "settings":
        return <SettingsPage />;
      default:
        return null;
    }
  };

  // Handler for when user clicks Resume on CaptchaModal
  const handleCaptchaResume = () => {
    setShowCaptchaModal(false);
    // Note: The actual resume-agent IPC call is handled inside the CaptchaModal component
  };

  return (
    <ActivityProvider>
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

      <CaptchaModal
        isOpen={showCaptchaModal}
        onClose={() => setShowCaptchaModal(false)}
        onResume={handleCaptchaResume}
      />
    </ActivityProvider>
  );
}

// Ensure there's an element to render into, or create one.
let rootElement = document.getElementById("root");
if (!rootElement) {
  rootElement = document.createElement("div");
  rootElement.id = "root";
  document.body.appendChild(rootElement);
}

const root = ReactDOM.createRoot(rootElement);

root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
