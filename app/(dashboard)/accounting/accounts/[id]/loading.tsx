import { TableSkeleton } from "@/components/dashboard/skeletons";

// Commits the tap immediately; the detail layout stays on screen, so only the
// panel below the tabs needs a placeholder.
export default function Loading() {
  return <TableSkeleton />;
}
