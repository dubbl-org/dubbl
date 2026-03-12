import { hasPermission } from "@/lib/plans";
import { AuthContext, AuthError } from "./auth-context";

export function requireRole(ctx: AuthContext, permission: string) {
  // If custom role permissions exist, check those
  if (ctx.permissions) {
    if (!hasPermission(ctx.permissions, permission)) {
      throw new AuthError("Insufficient permissions", 403);
    }
    return;
  }

  // Fall back to legacy role-based check
  if (!hasPermission(ctx.role, permission)) {
    throw new AuthError("Insufficient permissions", 403);
  }
}
