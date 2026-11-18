import { TableSkeleton } from "@/components/dashboard/skeletons";

// Commits the tap immediately: the account header is already on screen, so only
// the panel below it needs a placeholder while the page arrives.
export default function Loading() {
  return <TableSkeleton />;
}
