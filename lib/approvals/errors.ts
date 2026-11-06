/**
 * An approval-workflow rule was broken (not the current approver, nothing
 * pending, a record that still needs approval, ...). Carries the HTTP status
 * the REST layer should answer with; MCP tools surface the message as-is.
 */
export class ApprovalError extends Error {
  constructor(
    message: string,
    public status: number = 400
  ) {
    super(message);
    this.name = "ApprovalError";
  }
}
