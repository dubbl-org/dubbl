import { redirect } from "next/navigation";
import { getServerContext } from "@/lib/server/context";
import { resolveTaxModuleForOrg } from "@/lib/tax/registry";

/** Moved to /tax/returns/<kind>; module-driven, so this only redirects. */
export default async function Page() {
  const ctx = await getServerContext();
  const module = await resolveTaxModuleForOrg(ctx.organizationId);
  redirect(`/tax/returns/${module.returns[0]?.kind ?? "vat100"}`);
}
