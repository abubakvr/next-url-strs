import { AdminDashboard } from "@/components/admin-dashboard";

export default function AdminPage() {
  return (
    <div className="flex flex-1 flex-col items-center px-4 py-16 sm:py-24">
      <div className="mb-8 max-w-xl text-center">
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
          Admin
        </h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          View all short links, click counts, and recent visits. For local testing, sign in with the
          password shown below (override with <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-900">ADMIN_TOKEN</code> in production).
        </p>
      </div>
      <AdminDashboard />
    </div>
  );
}
