import { redirect } from "next/navigation";
import { getServerContext } from "@/lib/server/context";
import { resolveTaxModuleForOrg } from "@/lib/tax/registry";

/**
 * The VAT return now lives at /tax/returns/<kind>, driven by the jurisdiction
 * module. This path is kept only so old bookmarks and links land somewhere real.
 */
export default async function Page() {
  const ctx = await getServerContext();
  const module = await resolveTaxModuleForOrg(ctx.organizationId);
  redirect(`/tax/returns/${module.returns[0]?.kind ?? "vat100"}`);
}
