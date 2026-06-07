import Shell from './components/Shell';
import AuthGuard from './components/AuthGuard';

export default function Page() {
  return (
    <AuthGuard>
      <Shell />
    </AuthGuard>
  );
}
