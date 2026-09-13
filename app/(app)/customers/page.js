import dynamic from "next/dynamic";

const Customers = dynamic(() => import("../../components/Customers"), {
  loading: () => (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary-200 border-t-primary-600"></div>
    </div>
  ),
});

export default function CustomersPage() {
  return <Customers />;
}
