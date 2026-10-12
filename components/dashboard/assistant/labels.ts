/* Human labels for what Tilly is doing. */

const VERBS: Record<string, [string, string]> = {
  list: ["Looking up", "Looked up"],
  get: ["Checking", "Checked"],
  check: ["Checking", "Checked"],
  search: ["Searching", "Searched"],
  create: ["Creating", "Created"],
  update: ["Updating", "Updated"],
  delete: ["Deleting", "Deleted"],
  send: ["Sending", "Sent"],
  resend: ["Resending", "Resent"],
  pay: ["Recording payment on", "Recorded payment on"],
  void: ["Voiding", "Voided"],
  approve: ["Approving", "Approved"],
  reject: ["Rejecting", "Rejected"],
  record: ["Recording", "Recorded"],
  apply: ["Applying", "Applied"],
  post: ["Posting", "Posted"],
  convert: ["Converting", "Converted"],
  mark: ["Marking", "Marked"],
  match: ["Matching", "Matched"],
  categorize: ["Categorizing", "Categorized"],
  reconcile: ["Reconciling", "Reconciled"],
  import: ["Importing", "Imported"],
  link: ["Linking", "Linked"],
};

const SPECIAL: Record<string, [string, string]> = {
  find_tools: ["Finding the right tools", "Found the right tools"],
  search_everything: ["Searching everywhere", "Searched everywhere"],
  link_document_to_record: ["Attaching the file", "Attached the file"],
};

export function stepLabel(name: string, done: boolean) {
  const special = SPECIAL[name];
  if (special) return special[done ? 1 : 0];
  const [verb, ...rest] = name.split("_");
  const pair = VERBS[verb];
  if (pair) return `${pair[done ? 1 : 0]} ${rest.join(" ")}`;
  return `${done ? "Read" : "Reading"} the ${name.replace(/_/g, " ")} report`;
}

export function actionTitle(name: string) {
  if (name === "link_document_to_record") return "Attach the file to the record";
  const s = name.replace(/_/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function fieldLabel(key: string) {
  const s = key
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .replace(/\bid\b/i, "")
    .trim()
    .toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1) || key;
}

const MONEY = /amount|price|total|cost|balance|subtotal|fee/i;

/** Money in cents (when the tool says so) or as a plain decimal. */
export function formatField(key: string, value: unknown, cents: Set<string>): string {
  if (typeof value === "number" && MONEY.test(key)) {
    const n = cents.has(key) ? value / 100 : value;
    return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
  }
  if (value && typeof value === "object") return JSON.stringify(value).slice(0, 80);
  const s = String(value ?? "");
  return s.length > 120 ? `${s.slice(0, 120)}…` : s;
}

export function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function fileKind(mime: string, name: string) {
  if (mime.startsWith("image/")) return "image";
  if (mime === "application/pdf" || name.toLowerCase().endsWith(".pdf")) return "pdf";
  if (/csv|tab-separated/.test(mime) || /\.(csv|tsv)$/i.test(name)) return "sheet";
  return "text";
}
