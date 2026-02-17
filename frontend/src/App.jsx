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
