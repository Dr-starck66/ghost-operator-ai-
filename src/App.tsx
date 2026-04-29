import { Routes, Route } from 'react-router-dom';
import LandingPage from './pages/LandingPage';
import DashboardLayout from './components/DashboardLayout';
import TaskBuilder from './pages/TaskBuilder';
import JobLogs from './pages/JobLogs';
import JobsList from './pages/JobsList';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/dashboard" element={<DashboardLayout />}>
        <Route index element={<JobsList />} />
        <Route path="build" element={<TaskBuilder />} />
        <Route path="jobs/:id" element={<JobLogs />} />
      </Route>
    </Routes>
  );
}
