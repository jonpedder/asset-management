const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

function compareValues(left, right) {
  const leftMissing = left == null || String(left).trim() === "";
  const rightMissing = right == null || String(right).trim() === "";
  if (leftMissing || rightMissing) return leftMissing === rightMissing ? 0 : leftMissing ? 1 : -1;
  if (typeof left === "number" && typeof right === "number") return left - right;
  return collator.compare(String(left), String(right));
}

export function sortRows(records, sort, accessors = {}) {
  if (!sort?.key) return [...records];
  const accessor = accessors[sort.key] || ((record) => record?.[sort.key]);
  const multiplier = sort.direction === "desc" ? -1 : 1;
  return records.map((record, index) => ({ record, index })).sort((left, right) => {
    const compared = compareValues(accessor(left.record), accessor(right.record));
    return compared ? compared * multiplier : left.index - right.index;
  }).map(({ record }) => record);
}
