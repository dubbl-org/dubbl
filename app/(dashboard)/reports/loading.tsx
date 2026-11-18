import { ReportSkeleton } from "@/components/dashboard/skeletons";

// Route transition placeholder: mirrors the module's layout so the screen
// does not jump when the data arrives. Replaces the old centred spinner.
export default function Loading() {
  return (
    <div className="p-4 sm:p-6">
      <ReportSkeleton />
    </div>
  );
}
