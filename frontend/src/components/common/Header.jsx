// src/components/common/Header.jsx
import React, { useState, useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Search, Bell, LogOut, X, RefreshCw } from "lucide-react";

export default function Header() {
  const location = useLocation();
  const navigate = useNavigate();

  const [notifications, setNotifications] = useState([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [lastBlockCount, setLastBlockCount] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const refreshIntervalRef = useRef(null);

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

  // Poll for new threats
  useEffect(() => {
    const pollThreats = async () => {
      try {
        setIsRefreshing(true);
        const res = await fetch("/api/get-overview?range=24h&recent_limit=50", { credentials: "include" });
        if (res.ok) {
          const data = await res.json();
          const recentEvents = data.recent_events || [];
          const currentBlockCount = recentEvents.filter(event => event.raw_log?.decision?.action === "block").length;

          if (currentBlockCount > lastBlockCount) {
            const newBlocks = currentBlockCount - lastBlockCount;
            const newNotification = {
              id: Date.now(),
              message: `${newBlocks} new threat${newBlocks > 1 ? 's' : ''} blocked`,
              timestamp: new Date().toLocaleTimeString(),
            };
            setNotifications(prev => [newNotification, ...prev]);
            setLastBlockCount(currentBlockCount);

            // Browser notification if supported
            if (Notification.permission === "granted") {
              new Notification("Neuro-WAF Alert", {
                body: newNotification.message,
                icon: "/favicon.ico",
              });
            }
          }
        }
      } catch (error) {
        console.error("Failed to poll threats:", error);
      } finally {
        setIsRefreshing(false);
      }
    };

    // Request notification permission
    if (Notification.permission === "default") {
      Notification.requestPermission();
    }

    pollThreats();
    refreshIntervalRef.current = setInterval(pollThreats, 30000); // Poll every 30 seconds

    return () => {
      if (refreshIntervalRef.current) clearInterval(refreshIntervalRef.current);
    };
  }, [lastBlockCount]);

  // Manual refresh function
  const handleManualRefresh = async () => {
    if (isRefreshing) return;
    try {
      setIsRefreshing(true);
      const res = await fetch("/api/get-overview?range=24h&recent_limit=50", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        const recentEvents = data.recent_events || [];
        const currentBlockCount = recentEvents.filter(event => event.raw_log?.decision?.action === "block").length;

        if (currentBlockCount > lastBlockCount) {
          const newBlocks = currentBlockCount - lastBlockCount;
          const newNotification = {
            id: Date.now(),
            message: `${newBlocks} new threat${newBlocks > 1 ? 's' : ''} blocked`,
            timestamp: new Date().toLocaleTimeString(),
          };
          setNotifications(prev => [newNotification, ...prev]);
          setLastBlockCount(currentBlockCount);

          // Browser notification if supported
          if (Notification.permission === "granted") {
            new Notification("Neuro-WAF Alert", {
              body: newNotification.message,
              icon: "/favicon.ico",
            });
          }
        }
      }
    } catch (error) {
      console.error("Failed to refresh notifications:", error);
    } finally {
      setIsRefreshing(false);
    }
  };

  // Close notifications dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (showNotifications && !event.target.closest('.notification-dropdown')) {
        setShowNotifications(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showNotifications]);


  const clearAllNotifications = () => {
    setNotifications([]);
  };

  const toggleNotifications = () => {
    setShowNotifications(!showNotifications);
  };

  return (
    <header className="bg-white h-16 border-b border-gray-200 flex items-center justify-between px-6 shadow-sm z-10">
      <h1 className="text-xl font-bold text-gray-800 tracking-tight">{getTitle()}</h1>

      <div className="flex items-center gap-6">
        {/* Notifications */}
        <div className="relative">
          <button
            onClick={toggleNotifications}
            className="relative p-2 text-gray-500 hover:bg-gray-100 rounded-full transition-colors"
            title="Notifications (Auto-refresh every 30s)"
          >
            <Bell size={20} className={isRefreshing ? 'animate-pulse' : ''} />
            {notifications.length > 0 && (
              <span className="absolute top-1.5 right-2 h-2 w-2 bg-red-500 rounded-full border border-white"></span>
            )}
          </button>

          {/* Notification Dropdown */}
          {showNotifications && (
            <div className="notification-dropdown absolute right-0 mt-2 w-80 bg-white border border-gray-200 rounded-lg shadow-lg z-50">
              <div className="p-4 border-b border-gray-200">
                <div className="flex justify-between items-center">
                  <h3 className="text-sm font-semibold text-gray-800">Notifications</h3>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleManualRefresh}
                      disabled={isRefreshing}
                      className="p-1 text-gray-500 hover:text-blue-600 rounded hover:bg-gray-100 transition-colors disabled:opacity-50"
                      title="Refresh now"
                    >
                      <RefreshCw size={16} className={isRefreshing ? 'animate-spin' : ''} />
                    </button>
                    {notifications.length > 0 && (
                      <button
                        onClick={clearAllNotifications}
                        className="text-xs text-blue-600 hover:text-blue-800"
                      >
                        Clear All
                      </button>
                    )}
                  </div>
                </div>
              </div>
              <div className="max-h-64 overflow-y-auto">
                {notifications.length === 0 ? (
                  <div className="p-4 text-center text-gray-500 text-sm">
                    No new notifications
                  </div>
                ) : (
                  notifications.map((notif) => (
                    <div key={notif.id} className="p-3 border-b border-gray-100 hover:bg-gray-50">
                      <p className="text-sm text-gray-800">{notif.message}</p>
                      <p className="text-xs text-gray-500 mt-1">{notif.timestamp}</p>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

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
