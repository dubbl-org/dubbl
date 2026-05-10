import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { scan, type Locale } from "@dubbl/ocr";
import { wrapTool } from "@/lib/mcp/errors";
import type { AuthContext } from "@/lib/api/auth-context";

const MAX_BYTES = 10 * 1024 * 1024;

const LOCALE_VALUES = [
  "en-US",
  "en-GB",
  "en-AU",
  "en-CA",
  "de-DE",
  "fr-FR",
  "es-ES",
  "it-IT",
  "nl-NL",
  "pt-PT",
  "pt-BR",
  "sv-SE",
  "da-DK",
  "nb-NO",
  "fi-FI",
  "pl-PL",
  "hu-HU",
] as const;

export function registerOcrTools(server: McpServer, ctx: AuthContext) {
  server.tool(
    "scan_receipt",
    "Run deterministic OCR on a base64-encoded receipt or invoice image and return parsed fields with per-field confidence (0..1). Amounts are returned in integer cents. Use this to extract vendor, date, total, subtotal, tax, tax rate, currency, payment method, receipt number, and line items from a photo. Always present the result to the user for confirmation before persisting; the parser is regex-based and may misread.",
    {
      imageBase64: z
        .string()
        .min(1)
        .describe(
          "Base64-encoded image bytes (with or without 'data:image/...;base64,' prefix). Max 10 MB. JPG, PNG, or WebP."
        ),
      locale: z
        .enum(LOCALE_VALUES)
        .optional()
        .default("en-US")
        .describe(
          "Locale hint for date format, decimal separator, and tax/payment keywords. Defaults to en-US."
        ),
    },
    (params) =>
      wrapTool(ctx, async () => {
        const stripped = params.imageBase64.replace(
          /^data:image\/[^;]+;base64,/,
          ""
        );
        const buffer = Buffer.from(stripped, "base64");
        if (buffer.byteLength === 0) {
          throw new Error("imageBase64 is empty or invalid");
        }
        if (buffer.byteLength > MAX_BYTES) {
          throw new Error(`Image too large (max ${MAX_BYTES} bytes)`);
        }

        const result = await scan(new Uint8Array(buffer), {
          locale: params.locale as Locale,
          rawInput: true,
        });

        return {
          vendor: result.fields.vendor.value,
          date: result.fields.date.value,
          total: result.fields.total.value,
          subtotal: result.fields.subtotal.value,
          tax: result.fields.tax.value,
          taxRate: result.fields.taxRate.value,
          currency: result.fields.currency.value,
          paymentMethod: result.fields.paymentMethod.value,
          receiptNumber: result.fields.receiptNumber.value,
          lineItems: result.fields.lineItems.map((li) => ({
            description: li.description.value,
            quantity: li.quantity.value,
            unitPrice: li.unitPrice.value,
            amount: li.amount.value,
          })),
          fieldConfidence: {
            vendor: result.fields.vendor.confidence,
            date: result.fields.date.confidence,
            total: result.fields.total.confidence,
            subtotal: result.fields.subtotal.confidence,
            tax: result.fields.tax.confidence,
            taxRate: result.fields.taxRate.confidence,
            currency: result.fields.currency.confidence,
            paymentMethod: result.fields.paymentMethod.confidence,
            receiptNumber: result.fields.receiptNumber.confidence,
          },
          overallConfidence: result.overallConfidence,
          warnings: result.warnings,
          durationMs: result.durationMs,
        };
      })
  );
}
