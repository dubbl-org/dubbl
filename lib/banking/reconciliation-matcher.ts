/**
 * Fuzzy matching engine for bank reconciliation.
 * Matches bank transactions against invoices, bills, and journal entries.
 */

export interface BankTransactionForMatch {
  id: string;
  date: string;
  description: string;
  amount: number; // cents
  reference?: string | null;
}

export interface MatchCandidate {
  type: "invoice" | "bill" | "journal_entry";
  id: string;
  date: string;
  description: string;
  amount: number; // cents
  reference?: string | null;
}

export interface MatchResult {
  transactionId: string;
  candidate: MatchCandidate;
  confidence: number; // 0-100
  reasons: string[];
}

/**
 * Find potential matches for a bank transaction.
 * Returns matches sorted by confidence score (highest first).
 */
export function findMatches(
  transaction: BankTransactionForMatch,
  invoices: MatchCandidate[],
  bills: MatchCandidate[],
  entries: MatchCandidate[]
): MatchResult[] {
  const allCandidates = [...invoices, ...bills, ...entries];
  const results: MatchResult[] = [];

  for (const candidate of allCandidates) {
    const { confidence, reasons } = scoreMatch(transaction, candidate);
    if (confidence >= 30) {
      results.push({
        transactionId: transaction.id,
        candidate,
        confidence,
        reasons,
      });
    }
  }

  // Sort by confidence descending
  results.sort((a, b) => b.confidence - a.confidence);

  // Return top 5 matches
  return results.slice(0, 5);
}

function scoreMatch(
  transaction: BankTransactionForMatch,
  candidate: MatchCandidate
): { confidence: number; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];

  // Exact amount match (most important)
  if (Math.abs(transaction.amount) === Math.abs(candidate.amount)) {
    score += 40;
    reasons.push("Exact amount match");
  } else {
    // Close amount match (within 1%)
    const diff = Math.abs(Math.abs(transaction.amount) - Math.abs(candidate.amount));
    const maxAmt = Math.max(Math.abs(transaction.amount), Math.abs(candidate.amount));
    if (maxAmt > 0 && diff / maxAmt < 0.01) {
      score += 25;
      reasons.push("Amount within 1%");
    } else if (maxAmt > 0 && diff / maxAmt < 0.05) {
      score += 10;
      reasons.push("Amount within 5%");
    }
  }

  // Date matching
  const txDate = new Date(transaction.date);
  const candDate = new Date(candidate.date);
  const daysDiff = Math.abs(
    (txDate.getTime() - candDate.getTime()) / (1000 * 60 * 60 * 24)
  );

  if (daysDiff === 0) {
    score += 25;
    reasons.push("Same date");
  } else if (daysDiff <= 1) {
    score += 20;
    reasons.push("Within 1 day");
  } else if (daysDiff <= 3) {
    score += 15;
    reasons.push("Within 3 days");
  } else if (daysDiff <= 7) {
    score += 8;
    reasons.push("Within 7 days");
  }

  // Reference matching
  if (transaction.reference && candidate.reference) {
    const txRef = normalizeString(transaction.reference);
    const candRef = normalizeString(candidate.reference);

    if (txRef === candRef) {
      score += 30;
      reasons.push("Exact reference match");
    } else if (txRef.includes(candRef) || candRef.includes(txRef)) {
      score += 20;
      reasons.push("Partial reference match");
    }
  }

  // Description matching
  const txDesc = normalizeString(transaction.description);
  const candDesc = normalizeString(candidate.description);

  if (txDesc && candDesc) {
    if (txDesc === candDesc) {
      score += 15;
      reasons.push("Exact description match");
    } else {
      // Word overlap scoring
      const txWords = new Set(txDesc.split(/\s+/).filter((w) => w.length > 2));
      const candWords = new Set(candDesc.split(/\s+/).filter((w) => w.length > 2));
      let overlap = 0;
      for (const word of txWords) {
        if (candWords.has(word)) overlap++;
      }
      const total = Math.max(txWords.size, candWords.size);
      if (total > 0) {
        const ratio = overlap / total;
        if (ratio >= 0.5) {
          score += 10;
          reasons.push("Strong description overlap");
        } else if (ratio >= 0.25) {
          score += 5;
          reasons.push("Some description overlap");
        }
      }
    }

    // Check if candidate reference appears in transaction description
    if (candidate.reference) {
      const ref = normalizeString(candidate.reference);
      if (txDesc.includes(ref)) {
        score += 15;
        reasons.push("Reference found in description");
      }
    }
  }

  // Direction check: credits should match invoices, debits should match bills
  const isCredit = transaction.amount > 0;
  if (
    (isCredit && candidate.type === "invoice") ||
    (!isCredit && candidate.type === "bill")
  ) {
    score += 5;
    reasons.push("Direction matches type");
  }

  // Cap at 100
  const confidence = Math.min(100, score);

  return { confidence, reasons };
}

function normalizeString(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
