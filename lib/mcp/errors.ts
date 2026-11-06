import { z } from "zod";
import { AuthError } from "@/lib/api/auth-context";
import type { AuthContext } from "@/lib/api/auth-context";
import { LimitExceededError } from "@/lib/api/check-limit";
import { BillingError } from "@/lib/api/billing-checkout";
import { BackupRestoreError } from "@/lib/api/backup-errors";
import { safeStringify } from "@/lib/api/redact";
import { ApprovalError } from "@/lib/approvals/errors";
import { PeriodLockedError } from "@/lib/api/period-lock";
import { RevenueScheduleError } from "@/lib/api/revenue-schedules";
import { PaymentAllocationError } from "@/lib/api/payment-allocate";
import { LineReferenceError } from "@/lib/api/line-stock-refs";
import { InvoiceVoidError } from "@/lib/api/invoice-void";
import { InvoiceSendError } from "@/lib/api/invoice-send";
import { BillPaymentError } from "@/lib/api/bill-payment";
import { MissingExchangeRateError } from "@/lib/currency/converter";

type ToolResult = {
  content: { type: "text"; text: string }[];
  isError?: boolean;
};

export function wrapTool<T>(
  ctx: AuthContext,
  handler: (ctx: AuthContext) => Promise<T>
): Promise<ToolResult> {
  return handler(ctx)
    .then((result) => ({
      content: [{ type: "text" as const, text: safeStringify(result) }],
    }))
    .catch((err) => {
      if (err instanceof AuthError) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ error: err.message, status: err.status }),
            },
          ],
          isError: true,
        };
      }
      if (err instanceof z.ZodError) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                error: "Validation error",
                details: err.issues.map((i) => i.message),
              }),
            },
          ],
          isError: true,
        };
      }
      if (err instanceof LimitExceededError) {
        // Surface plan-limit messages (e.g. multi-currency) to the agent
        // instead of masking them as a generic internal error.
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ error: err.message, status: 403 }),
            },
          ],
          isError: true,
        };
      }
      if (err instanceof BackupRestoreError) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ error: err.message, status: err.status }),
            },
          ],
          isError: true,
        };
      }
      if (err instanceof BillingError) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ error: err.message, status: err.status }),
            },
          ],
          isError: true,
        };
      }
      if (err instanceof ApprovalError || err instanceof PeriodLockedError) {
        // Approval rules (not the current approver, still needs approval, ...)
        // and period locks are actionable: tell the agent what went wrong.
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                error: err.message,
                status: err instanceof ApprovalError ? err.status : 422,
              }),
            },
          ],
          isError: true,
        };
      }
      if (err instanceof BillPaymentError || err instanceof MissingExchangeRateError) {
        // A bill that can't take the payment (status, amount, bank account
        // currency) or a missing FX rate: actionable, so say why.
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                error: err.message,
                status: err instanceof BillPaymentError ? err.status : 422,
              }),
            },
          ],
          isError: true,
        };
      }
      if (err instanceof RevenueScheduleError || err instanceof PaymentAllocationError || err instanceof InvoiceVoidError || err instanceof InvoiceSendError || err instanceof LineReferenceError) {
        return {
          content: [
            { type: "text" as const, text: JSON.stringify({ error: err.message, status: err.status }) },
          ],
          isError: true,
        };
      }
      if (isUserFacingError(err)) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ error: err.message, status: err instanceof ToolError ? err.status : 400 }),
            },
          ],
          isError: true,
        };
      }
      console.error("MCP tool error:", err);
      return {
        content: [
          { type: "text" as const, text: JSON.stringify({ error: "Internal error" }) },
        ],
        isError: true,
      };
    });
}

/**
 * An expected, explainable failure in a tool ("Only draft bills can be
 * edited"). Its message goes back to the client as is.
 */
export class ToolError extends Error {
  constructor(
    message: string,
    public status = 400
  ) {
    super(message);
    this.name = "ToolError";
  }
}

/**
 * Whether an error's message is meant for the client: a ToolError, or a plain
 * `new Error("...")` thrown by tool code for a validation or state check.
 * Database errors, driver errors and bugs (TypeError and the like) are
 * subclasses, so they stay "Internal error"; a message that carries SQL is
 * never shown either.
 */
export function isUserFacingError(err: unknown): err is Error {
  if (err instanceof ToolError) return true;
  if (!(err instanceof Error) || err.constructor !== Error) return false;
  if ("cause" in err && err.cause !== undefined) return false;
  return !/failed query|\bselect\b.+\bfrom\b|\binsert into\b|\bupdate\b.+\bset\b|violates|syntax error|duplicate key/i.test(err.message);
}
