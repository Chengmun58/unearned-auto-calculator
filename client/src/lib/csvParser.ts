/**
 * CSV Parser for Aoikumo and Sequoia files
 * Handles parsing, matching, and classification logic
 */

export interface AoikumoRecord {
  customer_ref: string;
  item: string;
  owing: number;
  unearned: number;
}

export interface SequoiaRecord {
  customer_ref: string;
  item: string;
  balance: number;
  unearned: number;
}

export interface MatchedRecord {
  customer_ref: string;
  item: string;
  aoikumo_owing: number;
  aoikumo_unearned: number;
  sequoia_balance: number;
  sequoia_unearned: number;
  status: 'A' | 'B' | 'C' | 'D';
  status_label: string;
  exclude_default: boolean;
  manual_exclude?: boolean;
  manual_settle?: boolean;
  settle_pct?: number;
}

export interface SummaryResult {
  total_records: number;
  total_exposure: number;
  by_status: Record<string, { count: number; amount: number }>;
  excluded_amount: number;
  after_exclusion: number;
  settlement_amount: number;
  final_remaining: number;
}

/**
 * Parse CSV text to array of objects
 */
export function parseCSV(csvText: string): Record<string, any>[] {
  const lines = csvText.trim().split('\n');
  if (lines.length < 2) return [];

  const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
  const records: Record<string, any>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map(v => v.trim());
    if (values.length !== headers.length) continue;

    const record: Record<string, any> = {};
    headers.forEach((header, idx) => {
      const val = values[idx];
      record[header] = isNaN(Number(val)) ? val : Number(val);
    });
    records.push(record);
  }

  return records;
}

/**
 * Classify record status based on Sequoia and Aoikumo data
 */
function classifyStatus(
  aoikumo: AoikumoRecord | null,
  sequoia: SequoiaRecord | null
): { status: 'A' | 'B' | 'C' | 'D'; label: string; exclude_default: boolean } {
  if (!aoikumo) {
    return {
      status: 'C',
      label: 'Customer Ref not found in Sequoia Show 0',
      exclude_default: false,
    };
  }

  if (!sequoia) {
    return {
      status: 'B',
      label: 'Customer exists in Sequoia Show 0, but this item not found',
      exclude_default: false,
    };
  }

  // Status A: Sequoia item is ZERO in Show 0, but Aoikumo still open
  if (sequoia.balance === 0 && sequoia.unearned === 0 && aoikumo.owing > 0) {
    return {
      status: 'A',
      label: 'Sequoia item is ZERO in Show 0, but Aoikumo still open',
      exclude_default: true,
    };
  }

  // Status D: Sequoia item still has unearned/balance
  return {
    status: 'D',
    label: 'Sequoia item still has unearned/balance',
    exclude_default: false,
  };
}

/**
 * Match Aoikumo and Sequoia records and classify
 */
export function matchAndClassify(
  aoikumoRecords: AoikumoRecord[],
  sequoiaRecords: SequoiaRecord[]
): MatchedRecord[] {
  const sequoiaMap = new Map<string, SequoiaRecord>();
  sequoiaRecords.forEach(r => {
    sequoiaMap.set(`${r.customer_ref}|${r.item}`, r);
  });

  const matched: MatchedRecord[] = [];

  aoikumoRecords.forEach(aoikumo => {
    const sequoia = sequoiaMap.get(`${aoikumo.customer_ref}|${aoikumo.item}`);
    const { status, label, exclude_default } = classifyStatus(aoikumo, sequoia ?? null);

    matched.push({
      customer_ref: aoikumo.customer_ref,
      item: aoikumo.item,
      aoikumo_owing: aoikumo.owing,
      aoikumo_unearned: aoikumo.unearned,
      sequoia_balance: sequoia?.balance ?? 0,
      sequoia_unearned: sequoia?.unearned ?? 0,
      status,
      status_label: label,
      exclude_default,
    });
  });

  return matched;
}

/**
 * Calculate summary based on matched records and exclusion/settlement flags
 */
export function calculateSummary(
  records: MatchedRecord[],
  excludeMap: Map<string, boolean>,
  settleMap: Map<string, boolean>,
  settlePctMap: Map<string, number>
): SummaryResult {
  const by_status: Record<string, { count: number; amount: number }> = {
    A: { count: 0, amount: 0 },
    B: { count: 0, amount: 0 },
    C: { count: 0, amount: 0 },
    D: { count: 0, amount: 0 },
  };

  let total_exposure = 0;
  let excluded_amount = 0;
  let settlement_amount = 0;

  records.forEach(record => {
    const key = `${record.customer_ref}|${record.item}`;
    const should_exclude =
      excludeMap.get(key) !== undefined
        ? excludeMap.get(key)
        : record.exclude_default;
    const should_settle = settleMap.get(key) ?? false;
    const settle_pct = settlePctMap.get(key) ?? 1.0;

    const exposure = record.aoikumo_owing;
    total_exposure += exposure;

    by_status[record.status].count += 1;
    by_status[record.status].amount += exposure;

    if (should_exclude) {
      excluded_amount += exposure;
    } else if (should_settle) {
      settlement_amount += exposure * settle_pct;
    }
  });

  const after_exclusion = total_exposure - excluded_amount;
  const final_remaining = after_exclusion - settlement_amount;

  return {
    total_records: records.length,
    total_exposure,
    by_status,
    excluded_amount,
    after_exclusion,
    settlement_amount,
    final_remaining: Math.max(0, final_remaining),
  };
}
