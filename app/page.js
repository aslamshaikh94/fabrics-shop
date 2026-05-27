import Shell from './components/Shell';
import AuthGuard from './components/AuthGuard';

export const dynamic = 'force-dynamic';

export default function Page() {
  return (
    <AuthGuard>
      <Shell />
    </AuthGuard>
  );
}
