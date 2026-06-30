import { Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { DocsView } from './views/DocsView';
import { SkillsView } from './views/SkillsView';
import { AgentsView } from './views/AgentsView';
import { SessionView } from './views/SessionView';
import { WorkflowView } from './views/WorkflowView';
import './App.css';

function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Navigate to="/docs" replace />} />
        <Route path="/docs" element={<DocsView />} />
        <Route path="/skills" element={<SkillsView />} />
        <Route path="/agents" element={<AgentsView />} />
        <Route path="/session" element={<SessionView />} />
        <Route path="/workflow" element={<WorkflowView />} />
        <Route path="*" element={<Navigate to="/docs" replace />} />
      </Routes>
    </Layout>
  );
}

export default App;
