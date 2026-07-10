import dynamic from "next/dynamic";
import LoadingSpinner from "../../components/shared/LoadingSpinner";

const Reports = dynamic(() => import("../../components/Reports"), {
  loading: () => (
    <div className="flex items-center justify-center h-64">
      <LoadingSpinner size="lg" text="Loading reports..." />
    </div>
  ),
});

export default function ReportsPage() {
  return <Reports />;
}
