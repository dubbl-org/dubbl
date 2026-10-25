import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError } from "@/lib/api/response";
import { buildFilingPackage } from "@/lib/reports/xbrl/assemble";
import { zipBuffer } from "@/lib/reports/xbrl/package";

/**
 * ACRA XBRL package for a financial year.
 *
 * `format=json` (default) returns the validation report: template chosen and why,
 * the mapping counts, and every issue with its ACRA rule id. `format=zip` returns
 * the filing package — the instance, the company extension and linkbases, and the
 * ACRA Taxonomy 2026 folder — ready to drop on BizFinx Validate (no CorpPass
 * needed to validate) and then upload.
 *
 * A genuine error blocks the zip: ACRA rejects it, so there is no point handing
 * over a file that cannot be filed. `force=1` downloads anyway for debugging.
 *
 * Query params: fiscalYearEnd (or fiscalYearStart + fiscalYearEnd),
 * template=sim|full, authorisationDate, auditOpinion, force.
 */
export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    requireRole(ctx, "view:data");
    const url = new URL(request.url);

    const fiscalYearEnd = url.searchParams.get("fiscalYearEnd");
    const fiscalYearStart =
      url.searchParams.get("fiscalYearStart") ||
      (fiscalYearEnd ? `${Number(fiscalYearEnd.slice(0, 4))}-01-01` : "");
    const format = (url.searchParams.get("format") || "json").toLowerCase();

    if (!fiscalYearEnd || !fiscalYearStart) {
      return NextResponse.json(
        { error: "fiscalYearEnd (YYYY-MM-DD) is required; fiscalYearStart defaults to 1 January" },
        { status: 400 }
      );
    }

    const templateParam = url.searchParams.get("template");
    const { input, templateReason, size, package: pkg } = await buildFilingPackage(
      ctx.organizationId,
      {
        fiscalYearStart,
        fiscalYearEnd,
        template: templateParam === "full" || templateParam === "sim" ? templateParam : null,
        authorisationDate: url.searchParams.get("authorisationDate"),
      }
    );

    const genuine = pkg.issues.filter((i) => i.severity === "genuine");
    const possible = pkg.issues.filter((i) => i.severity === "possible");

    if (format === "zip") {
      if (genuine.length > 0 && url.searchParams.get("force") !== "1") {
        return NextResponse.json(
          {
            error: `The package has ${genuine.length} error(s) ACRA would reject. Fix them, or pass force=1 to download anyway.`,
            issues: genuine,
          },
          { status: 409 }
        );
      }
      const zip = zipBuffer(pkg.files);
      return new NextResponse(new Uint8Array(zip), {
        headers: {
          "Content-Type": "application/zip",
          "Content-Disposition": `attachment; filename="${pkg.fileName}.zip"`,
        },
      });
    }

    return NextResponse.json({
      fileName: pkg.fileName,
      template: input.template,
      templateChosenBecause: templateReason,
      accountingStandard: input.company.accountingStandard,
      uen: input.company.uen,
      companyName: input.company.name,
      period: input.period,
      size,
      files: pkg.files.map((f) => f.name),
      issueCounts: { genuine: genuine.length, possible: possible.length },
      issues: pkg.issues,
      readyToDownload: genuine.length === 0,
      nextSteps: [
        "Download the package.",
        "Open BizFinx Validate (no CorpPass needed) and validate the instance.",
        "Fix anything flagged as a genuine error here, then re-download.",
        "Upload through BizFinx and file the annual return within 14 days.",
      ],
    });
  } catch (err) {
    return handleError(err);
  }
}
