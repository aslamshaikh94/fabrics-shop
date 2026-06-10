import AuthGuard from "../components/AuthGuard";
import Shell from "../components/Shell";

export default function AppLayout({ children }) {
  return (
    <AuthGuard>
      <Shell>{children}</Shell>
    </AuthGuard>
  );
}
