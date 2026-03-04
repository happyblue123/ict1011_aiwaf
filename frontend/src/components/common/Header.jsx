// src/components/common/Header.jsx
import React from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Search, Bell, LogOut } from "lucide-react";

export default function Header() {
  const location = useLocation();
  const navigate = useNavigate();

  const getTitle = () => {
    switch (location.pathname) {
      case "/dashboard":
        return "Dashboard Overview";
      case "/traffic":
        return "Traffic Analysis";
      case "/ddos":
        return "DDoS Mitigation";
      case "/events":
        return "Security Events";
      default:
        return "Neuro-WAF";
    }
  };

  const handleLogout = async () => {
    try {
      await fetch("/api/logout", {
        method: "POST",
        credentials: "include",
      });
    } catch (e) {
      // even if network fails, still force user out on UI side
      console.warn("logout failed:", e);
    } finally {
      navigate("/login", { replace: true });
    }
  };

  return (
    <header className="bg-white h-16 border-b border-gray-200 flex items-center justify-between px-6 shadow-sm z-10">
      <h1 className="text-xl font-bold text-gray-800 tracking-tight">{getTitle()}</h1>

      <div className="flex items-center gap-6">
        {/* Notifications */}
        <button className="relative p-2 text-gray-500 hover:bg-gray-100 rounded-full transition-colors">
          <Bell size={20} />
          <span className="absolute top-1.5 right-2 h-2 w-2 bg-red-500 rounded-full border border-white"></span>
        </button>

        {/* Logout */}
        <button
          onClick={handleLogout}
          className="flex items-center gap-2 px-4 py-2 bg-red-50 text-red-600 hover:bg-red-100 rounded-full transition font-semibold"
        >
          <LogOut size={18} />
          Logout
        </button>

        {/* User Profile */}
        <div className="h-8 w-8 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-full flex items-center justify-center text-white text-xs font-bold shadow-md cursor-pointer">
          JD
        </div>
      </div>
    </header>
  );
}
