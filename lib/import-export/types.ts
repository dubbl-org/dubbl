export type SourceSystem = "quickbooks" | "xero" | "freshbooks" | "wave" | "custom";

export type ImportEntity =
  | "accounts"
  | "contacts"
  | "invoices"
  | "bills"
  | "entries"
  | "products"
  | "bank-transactions";

export interface ColumnAlias {
  targetField: string;
  aliases: string[];
}

export interface SourceMapping {
  source: SourceSystem;
  entity: ImportEntity;
  aliases: ColumnAlias[];
  typeNormalizer?: (value: string) => string;
}
