import React, { useState, useEffect } from "react";
import ReactDOM from "react-dom/client";
import AppLayout, { PageName } from "./components/AppLayout";
import HistoryPage from "./pages/HistoryPage";
import ActivityPage from "./pages/ActivityPage";
import SettingsPage from "./pages/SettingsPage";
import { AuthGate } from "./components/AuthGate";
import "./index.css"; // Ensure Tailwind/DaisyUI styles are imported
import CaptchaModal from "./components/CaptchaModal";
import { ActivityProvider } from "./contexts/ActivityContext"; // Import ActivityProvider
import { supabase } from "./lib/supabaseClient.ts"; // Changed to .ts

function App() {
  const [activePage, setActivePage] = useState<PageName>("history");
  const [showCaptchaModal, setShowCaptchaModal] = useState(false);

  useEffect(() => {
    // Set up listener for captcha detection events from main process
    const handleCaptchaDetected = () => {
      console.log("LinkedIn checkpoint detected, showing CAPTCHA modal");
      setShowCaptchaModal(true);
    };
    window.addEventListener("captcha-detected", handleCaptchaDetected);

    // --- Supabase session synchronization ---
    const sendSessionToMainViaAPI = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session && window.electronAPI) {
        console.log(
          "[Renderer] Sending session to main process via electronAPI.updateAuthSession:",
          {
            accessToken: session.access_token,
            refreshToken: session.refresh_token,
          }
        );
        try {
          const result = await window.electronAPI.updateAuthSession({
            accessToken: session.access_token,
            refreshToken: session.refresh_token,
          });
          if (result.success) {
            console.log(
              "[Renderer] Supabase session successfully set in main process via API."
            );
          } else {
            console.error(
              "[Renderer] Failed to set Supabase session in main process via API:",
              result.error
            );
          }
        } catch (error) {
          console.error(
            "[Renderer] Error calling electronAPI.updateAuthSession:",
            error
          );
        }
      } else if (!session) {
        console.log("[Renderer] No active session to send to main process.");
      } else if (!window.electronAPI) {
        console.warn(
          "[Renderer] window.electronAPI is not available. Ensure preload script is working."
        );
      }
    };

    sendSessionToMainViaAPI(); // Initial call on component mount

    const { data: authListener } = supabase.auth.onAuthStateChange(
      (event, session) => {
        console.log("[Renderer] Auth state changed:", event);
        if (
          (event === "SIGNED_IN" ||
            event === "TOKEN_REFRESHED" ||
            event === "INITIAL_SESSION") &&
          session
        ) {
          sendSessionToMainViaAPI();
        } else if (event === "SIGNED_OUT") {
          console.log(
            "[Renderer] User signed out. Main process session might need clearing."
          );
          if (window.electronAPI?.clearAuthSession) {
            window.electronAPI
              .clearAuthSession()
              .then((result) => {
                if (result.success)
                  console.log("[Renderer] Main process session cleared.");
                else
                  console.error(
                    "[Renderer] Failed to clear main process session:",
                    result.error
                  );
              })
              .catch((error) =>
                console.error(
                  "[Renderer] Error calling clearAuthSession:",
                  error
                )
              );
          }
        }
      }
    );
    // --- End Supabase session synchronization ---

    // Clean up captcha listener and auth listener
    return () => {
      window.removeEventListener("captcha-detected", handleCaptchaDetected);
      if (authListener?.subscription) {
        authListener.subscription.unsubscribe();
      }
    };
  }, []);

  const renderPage = () => {
    switch (activePage) {
      case "history":
        return <HistoryPage />;
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
