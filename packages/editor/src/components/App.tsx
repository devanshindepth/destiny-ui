import { Header } from './Header';
import { Sidebar } from './layout/Sidebar';
import { DetailPanel } from './layout/DetailPanel';
import { PreviewSection } from './layout/PreviewSection';

export function App() {
  return (
    <div class="app-shell">
      <Header />
      <div class="app-body">
        <Sidebar />
        <DetailPanel />
        <PreviewSection />
      </div>
    </div>
  );
}
