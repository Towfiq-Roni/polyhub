/** Single email normalization rule (trim + lowercase). No unicode folding, no plus/dot handling. */
export const normalizeEmail = (raw: string): string => raw.trim().toLowerCase();
