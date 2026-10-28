import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { organization, users } from "@/lib/db/schema";
import type { AuthContext } from "@/lib/api/auth-context";
import { wrapTool } from "@/lib/mcp/errors";
import { locales } from "@/lib/i18n/locales";

/** Locale preferences use BCP 47 tags and are restricted to shipped catalogs. */
export function registerLocalizationTools(server: McpServer, ctx: AuthContext) {
  server.tool(
    "get_locale_preferences",
    "Get the caller's UI language preference and the organization's customer-facing document language. Returns supported locale tags: en, fr, fr-CA.",
    {},
    () => wrapTool(ctx, async () => {
      const [user, org] = await Promise.all([
        db.query.users.findFirst({ where: eq(users.id, ctx.userId), columns: { locale: true } }),
        db.query.organization.findFirst({ where: eq(organization.id, ctx.organizationId), columns: { documentLocale: true } }),
      ]);
      return { userLocale: user?.locale ?? "en", documentLocale: org?.documentLocale ?? "en" };
    })
  );

  server.tool(
    "update_locale_preferences",
    "Update the caller's UI language and/or the organization's customer-facing document language. Use BCP 47 locale tags en, fr, or fr-CA. Returns the resulting preferences.",
    {
      userLocale: z.enum(locales).optional().describe("UI language for the authenticated user: en, fr, or fr-CA"),
      documentLocale: z.enum(locales).optional().describe("Default language for organization customer-facing documents: en, fr, or fr-CA"),
    },
    (params) => wrapTool(ctx, async () => {
      if (params.userLocale !== undefined) {
        await db.update(users).set({ locale: params.userLocale }).where(eq(users.id, ctx.userId));
      }
      if (params.documentLocale !== undefined) {
        await db.update(organization).set({ documentLocale: params.documentLocale, updatedAt: new Date() }).where(eq(organization.id, ctx.organizationId));
      }
      const [user, org] = await Promise.all([
        db.query.users.findFirst({ where: eq(users.id, ctx.userId), columns: { locale: true } }),
        db.query.organization.findFirst({ where: eq(organization.id, ctx.organizationId), columns: { documentLocale: true } }),
      ]);
      return { userLocale: user?.locale ?? "en", documentLocale: org?.documentLocale ?? "en" };
    })
  );
}
