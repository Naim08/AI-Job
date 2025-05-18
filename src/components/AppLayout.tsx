import React from "react";
import {
  BarChart2,
  History,
  Settings as SettingsIcon,
  LogOut,
} from "lucide-react";
import { User } from "@supabase/supabase-js";
import ApplyToggle from "./ApplyToggle";

export type PageName = "history" | "activity" | "settings";

export interface AppLayoutProps {
  activePage: PageName;
  onPageChange: (page: PageName) => void;
  children: React.ReactNode;
  user: User | null;
  onLogout: () => Promise<void>;
}

const pageTitles: Record<PageName, string> = {
  history: "History",
  activity: "Activity Log",
  settings: "Settings",
};

const AppLayout: React.FC<AppLayoutProps> = ({
  activePage,
  onPageChange,
  children,
  user,
  onLogout,
}) => {
  const menuItems = (
    <>
      <li>
        <a
          onClick={() => onPageChange("history")}
          className={activePage === "history" ? "active" : ""}
        >
          <History size={18} /> History
        </a>
      </li>
      <li>
        <a
          onClick={() => onPageChange("activity")}
          className={activePage === "activity" ? "active" : ""}
        >
          <BarChart2 size={18} /> Activity
        </a>
      </li>
      <li>
        <a
          onClick={() => onPageChange("settings")}
          className={activePage === "settings" ? "active" : ""}
        >
          <SettingsIcon size={18} /> Settings
        </a>
      </li>
    </>
  );

  const handleLogoutClick = async () => {
    await onLogout();
    // AuthGate will handle redirecting to login screen via onAuthStateChange
  };

  return (
    <>
      <div className="flex flex-col md:flex-row min-h-screen bg-base-200">
        {/* Top Navbar for small screens */}
        <div className="md:hidden navbar bg-base-100 shadow-lg">
          <div className="navbar-start">
            <div className="dropdown">
              <label tabIndex={0} className="btn btn-ghost md:hidden">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-5 w-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M4 6h16M4 12h16M4 18h16"
                  />
                </svg>
              </label>
              <ul
                tabIndex={0}
                className="menu menu-sm dropdown-content mt-3 z-[1] p-2 shadow bg-base-100 rounded-box w-52"
              >
                {menuItems}
                <li>
                  <hr className="my-2" />
                </li>
                <li>
                  <button
                    onClick={handleLogoutClick}
                    className="btn btn-ghost w-full justify-start"
                  >
                    <LogOut size={18} /> Logout
                  </button>
                </li>
              </ul>
            </div>
          </div>
          <div className="navbar-center">
            <a className="btn btn-ghost normal-case text-xl">
              {pageTitles[activePage]}
            </a>
          </div>
          <div className="navbar-end">
            {user && (
              <span className="text-sm mr-2 hidden sm:inline">
                {user.email}
              </span>
            )}
            <ApplyToggle />
          </div>
        </div>

        {/* Sidebar for medium and larger screens */}
        <aside className="hidden md:block w-64 bg-base-100 shadow-lg p-4 flex flex-col justify-between">
          <div>
            <div className="text-2xl font-bold mb-6 sticky top-4 px-4">
              My App
            </div>
            <ul className="menu">{menuItems}</ul>
          </div>
          <div>
            {user && (
              <div className="p-2 mb-2 text-center text-xs">
                <p>Signed in as:</p>
                <p className="font-semibold truncate">{user.email}</p>
              </div>
            )}
            <div className="p-2">
              <ApplyToggle />
            </div>
            <button
              onClick={handleLogoutClick}
              className="btn btn-ghost w-full justify-start text-red-500 hover:bg-red-500 hover:text-white"
            >
              <LogOut size={18} /> Logout
            </button>
          </div>
        </aside>

        {/* Page Content */}
        <main className="flex-1 p-6 overflow-y-auto">
          <h1 className="text-3xl font-bold mb-6 hidden md:block">
            {pageTitles[activePage]}
          </h1>
          {children}
        </main>
        <div></div>
      </div>
    </>
  );
};

export default AppLayout;
