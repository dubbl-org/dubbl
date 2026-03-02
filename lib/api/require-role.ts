import { hasPermission } from "@/lib/plans";
import { AuthContext, AuthError } from "./auth-context";

export function requireRole(ctx: AuthContext, permission: string) {
  if (!hasPermission(ctx.role, permission)) {
    throw new AuthError("Insufficient permissions", 403);
  }
}
