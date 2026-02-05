// import React, { useState, useEffect } from "react";
// import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
// import MainLayout from "./layouts/MainLayout";
// import LoginPage from "./pages/LoginPage";
// import WAFSetup from "./pages/WAFSetup";

// // Dashboard Pages
// import Overview from "./pages/Overview";
// import TrafficAnalysis from "./pages/TrafficAnalysis";
// import DDoSDashboard from "./pages/DDoSDashboard";
// import EventsLog from "./pages/EventsLog";
// import HelpPage from "./pages/HelpPage";
// import SettingsPage from "./pages/SettingsPage";
// import HomePage from "./pages/HomePage";

// function App() {
//   const [isLoading, setIsLoading] = useState(true);
//   const [isWafSetup, setIsWafSetup] = useState(false); 
//   const [isAuthenticated, setIsAuthenticated] = useState(false);

//   useEffect(() => {
//     const initializeApp = async () => {
//       try {
//         // 1. Check if WAF is already configured in DB
//         // FIXED: Point to Port 5000 (Python Backend)
//         const response = await fetch("http://localhost:5000/api/setup/status");
        
//         if (response.ok) {
//           const data = await response.json();
//           setIsWafSetup(data.is_configured); // { is_configured: true/false }
//         } else {
//           // If server is down or error, default to false (force setup or error screen)
//           console.error("Setup check failed:", response.status);
//           setIsWafSetup(false);
//         }

//         // 2. Check local storage for existing session
//         const loggedInUser = localStorage.getItem("user");
//         if (loggedInUser) {
//           setIsAuthenticated(true);
//         }
//       } catch (error) {
//         console.error("Failed to check WAF status:", error);
//         setIsWafSetup(false);
//       } finally {
//         setIsLoading(false);
//       }
//     };

//     initializeApp();
//   }, []);

//   const handleLogin = (userData) => {
//     setIsAuthenticated(true);
//     localStorage.setItem("user", JSON.stringify(userData));
//   };

//   const handleSetupComplete = () => {
//     // This is called by WAFSetup.jsx when deployment finishes
//     setIsWafSetup(true); 
//   };

//   if (isLoading) {
//     return (
//       <div className="h-screen bg-gray-900 flex items-center justify-center text-white">
//         <div className="text-center">
//           <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
//           <p className="font-mono text-blue-400">Verifying Neuro-WAF Integrity...</p>
//         </div>
//       </div>
//     );
//   }

//   return (
//     <Router>
//       <Routes>
//         {/* CASE 1: WAF NOT SET UP -> Only allow /setup */}
//         {!isWafSetup ? (
//           <>
//             <Route 
//               path="/setup" 
//               element={<WAFSetup onComplete={handleSetupComplete} />} 
//             />
//             {/* Redirect everything else to /setup */}
//             <Route path="*" element={<Navigate to="/setup" replace />} />
//           </>
//         ) : (
//           /* CASE 2: WAF IS SET UP -> Check Authentication */
//           <>
//             {/* Login Route */}
//             <Route 
//               path="/login" 
//               element={
//                 !isAuthenticated ? (
//                   <LoginPage onLogin={handleLogin} />
//                 ) : (
//                   <Navigate to="/" replace />
//                 )
//               } 
//             />

//             {/* CASE 3: AUTHENTICATED -> Dashboard Access */}
//             {isAuthenticated ? (
//               <>
//                 <Route path="/" element={<MainLayout><Overview /></MainLayout>} />
//                 <Route path="/traffic" element={<MainLayout><TrafficAnalysis /></MainLayout>} />
//                 <Route path="/ddos" element={<MainLayout><DDoSDashboard /></MainLayout>} />
//                 <Route path="/events" element={<MainLayout><EventsLog /></MainLayout>} />
//                 <Route path="/settings" element={<MainLayout><SettingsPage /></MainLayout>} />
//                 <Route path="/support" element={<MainLayout><HelpPage /></MainLayout>} />
                
//                 {/* Catch-all: Redirect unknown URLs to Dashboard */}
//                 <Route path="*" element={<Navigate to="/" replace />} />
//               </>
//             ) : (
//               /* If WAF is setup but user is NOT logged in, redirect to /login */
//               <Route path="*" element={<Navigate to="/login" replace />} />
//             )}
//           </>
//         )}
//       </Routes>
//     </Router>
//   );
// }

// export default App;

import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import HomePage from "./pages/HomePage";
import LoginPage from "./pages/LoginPage";
import WAFSetup from "./pages/WAFSetup";
import MainLayout from "./layouts/MainLayout";

// Dashboard pages
import Overview from "./pages/Overview";
import TrafficAnalysis from "./pages/TrafficAnalysis";
import DDoSDashboard from "./pages/DDoSDashboard";
import EventsLog from "./pages/EventsLog";
import HelpPage from "./pages/HelpPage";
import SettingsPage from "./pages/SettingsPage";
import PolicyRules from "./pages/PolicyRules";

// Import functions
import RequireAuth from "./components/common/RequireAuth";

function App() {
  return (
    <Router>
      <Routes>
        {/* Public routes */}
        <Route path="/" element={<HomePage />} />
        <Route path="/setup" element={<WAFSetup />} />
        <Route path="/login" element={<LoginPage />} />

        {/* Protected route group */}
        <Route
          element={
            <RequireAuth>
              <MainLayout />
            </RequireAuth>
          }
        >
          <Route path="/dashboard" element={<Overview />} />
          <Route path="/traffic" element={<TrafficAnalysis />} />
          <Route path="/ddos" element={<DDoSDashboard />} />
          <Route path="/events" element={<EventsLog />} />
          <Route path="/policy" element={<PolicyRules />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/support" element={<HelpPage />} />
        </Route>

        {/* Catch-all */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
}

export default App;
