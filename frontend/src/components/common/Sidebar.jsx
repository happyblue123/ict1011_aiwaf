// src/components/common/Sidebar.jsx
import React, { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { 
  LayoutDashboard, 
  Activity, 
  ShieldAlert, 
  FileText,
  ListChecks, 
  Settings, 
  HelpCircle,
  Hexagon 
} from "lucide-react";

const Sidebar = () => {
  const location = useLocation();
  const [isExpanded, setIsExpanded] = useState(false); // Default to collapsed

  // Define navigation items
  const navItems = [
    { name: "Overview", path: "/dashboard", icon: LayoutDashboard },
    { name: "Traffic Analysis", path: "/traffic", icon: Activity },
    { name: "DDoS Mitigation", path: "/ddos", icon: ShieldAlert },
    { name: "Events Log", path: "/events", icon: FileText },
    { name: "Policy Rules", path: "/policy", icon: ListChecks },
  ];

  const bottomItems = [
    { name: "Settings", path: "/settings", icon: Settings },
    { name: "Support", path: "/support", icon: HelpCircle },
  ];

  // Helper to determine active style
  const isActive = (path) => {
    return location.pathname === path 
      ? "bg-blue-600 text-white shadow-md" 
      : "text-gray-400 hover:bg-gray-800 hover:text-white";
  };

  return (
    <div 
      className={`bg-gray-900 h-full flex flex-col border-r border-gray-800 transition-all duration-300 ease-in-out z-20 ${
        isExpanded ? "w-64" : "w-20"
      }`}
      onMouseEnter={() => setIsExpanded(true)}
      onMouseLeave={() => setIsExpanded(false)}
    >
      
      {/* 1. Logo / Branding */}
      <div className="h-16 flex items-center px-4 border-b border-gray-800 whitespace-nowrap overflow-hidden">
        <div className="bg-blue-600 p-2 rounded-lg min-w-[36px] flex items-center justify-center">
          <Hexagon fill="white" className="text-white" size={20} />
        </div>
        <span className={`text-white font-bold text-lg tracking-wide ml-3 transition-opacity duration-200 ${
          isExpanded ? "opacity-100" : "opacity-0"
        }`}>
          Neuro-WAF<span className="text-blue-500">.AI</span>
        </span>
      </div>

      {/* 2. Main Navigation */}
      <nav className="flex-1 px-3 py-6 space-y-2">
        <p className={`px-2 text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 transition-opacity duration-200 whitespace-nowrap ${
           isExpanded ? "opacity-100" : "opacity-0 h-0 overflow-hidden"
        }`}>
          Monitoring
        </p>
        
        {navItems.map((item) => (
          <Link
            key={item.path}
            to={item.path}
            className={`flex items-center px-3 py-3 rounded-xl transition-all duration-200 font-medium text-sm whitespace-nowrap ${isActive(item.path)}`}
          >
            {/* Icon Wrapper to keep it centered when collapsed */}
            <div className="min-w-[24px] flex items-center justify-center">
              <item.icon size={20} />
            </div>
            
            <span className={`ml-3 transition-all duration-200 overflow-hidden ${
              isExpanded ? "opacity-100 w-auto" : "opacity-0 w-0"
            }`}>
              {item.name}
            </span>
          </Link>
        ))}
      </nav>

      {/* 3. Bottom/System Navigation */}
      <div className="px-3 py-6 border-t border-gray-800 space-y-2">
        <p className={`px-2 text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 transition-opacity duration-200 whitespace-nowrap ${
           isExpanded ? "opacity-100" : "opacity-0 h-0 overflow-hidden"
        }`}>
          System
        </p>

        {bottomItems.map((item) => (
          <Link
            key={item.path}
            to={item.path}
            className={`flex items-center px-3 py-3 rounded-xl transition-all duration-200 font-medium text-sm whitespace-nowrap ${isActive(item.path)}`}
          >
            <div className="min-w-[24px] flex items-center justify-center">
              <item.icon size={20} />
            </div>
            <span className={`ml-3 transition-all duration-200 overflow-hidden ${
              isExpanded ? "opacity-100 w-auto" : "opacity-0 w-0"
            }`}>
              {item.name}
            </span>
          </Link>
        ))}
      </div>

      {/* 4. User Profile Snippet */}
      <div className="p-4 border-t border-gray-800 whitespace-nowrap overflow-hidden">
        <div className="flex items-center gap-3">
          <div className="min-w-[32px] h-8 rounded-full bg-gradient-to-tr from-blue-500 to-purple-500 border border-gray-700"></div>
          <div className={`transition-opacity duration-200 ${
            isExpanded ? "opacity-100" : "opacity-0"
          }`}>
            <p className="text-sm font-bold text-white">Admin User</p>
            <p className="text-xs text-gray-500">SOC Analyst</p>
          </div>
        </div>
      </div>
      
    </div>
  );
};

export default Sidebar;