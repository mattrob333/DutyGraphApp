/** A review hint only: source speech is untrusted, and the human still decides. */
export function hasInstructionLikeQuote(quote: string): boolean {
  if (!quote.trim()) return false;
  return (
    /\b(?:ignore|disregard|override)\s+(?:(?:all|any|previous|prior|above|system|developer)\s+){0,3}(?:instructions?|rules?|prompts?|polic(?:y|ies))\b/i.test(quote) ||
    /\b(?:system|developer|assistant)\s*(?:role|prompt|message)\s*[:=]/i.test(quote) ||
    /["'](?:role|instructions?|system|developer)["']\s*:/i.test(quote) ||
    /<\s*\/?(?:system|developer|assistant)\s*>/i.test(quote) ||
    /```(?:json|prompt)?\s*[\[{]/i.test(quote) ||
    /\b(?:approve|authorize)\s+\$[\d,.]+\s*(?:[kmb]|million|billion)?\s+budget\b/i.test(quote)
  );
}
