export const CATEGORY_ALGORITHM_VERSION = 'category-v1';

export type CategoryAlias = {
  categoryId: string;
  phrase: string;
  normalizedPhrase: string;
  matchScope: 'any' | 'name' | 'brand' | 'description';
  weight: number;
};

export type CategorySuggestion = {
  categoryId: string;
  categoryName: string;
  confidence: number;
  signals: string[];
};

export function normalizeCategoryText(value: string): string {
  return value
    .toLocaleLowerCase('ar-EG')
    .replace(/[أإآٱ]/gu, 'ا')
    .replace(/ى/gu, 'ي')
    .replace(/ة/gu, 'ه')
    .replace(/ؤ/gu, 'و')
    .replace(/ئ/gu, 'ي')
    .replace(/ـ/gu, '')
    .replace(/[\u064B-\u065F\u0670]/gu, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function scopedText(
  scope: CategoryAlias['matchScope'],
  fields: Record<'name' | 'brand' | 'description', string>,
): Array<{ field: 'name' | 'brand' | 'description'; value: string; boost: number }> {
  const entries = [
    { field: 'name' as const, value: fields.name, boost: 1 },
    { field: 'brand' as const, value: fields.brand, boost: 0.72 },
    { field: 'description' as const, value: fields.description, boost: 0.42 },
  ];
  return scope === 'any' ? entries : entries.filter((entry) => entry.field === scope);
}

export function rankCategorySuggestions(input: {
  name: string;
  brand: string;
  description: string;
  categories: Array<{ id: string; name: string }>;
  aliases: CategoryAlias[];
  limit?: number;
}): CategorySuggestion[] {
  const fields = {
    name: normalizeCategoryText(input.name),
    brand: normalizeCategoryText(input.brand),
    description: normalizeCategoryText(input.description),
  };
  if (!fields.name && !fields.brand && !fields.description) return [];

  const categoryNames = new Map(input.categories.map((category) => [category.id, category.name]));
  const scored = new Map<string, { score: number; signals: string[] }>();
  for (const alias of input.aliases) {
    const phrase = alias.normalizedPhrase || normalizeCategoryText(alias.phrase);
    if (phrase.length < 2 || !categoryNames.has(alias.categoryId)) continue;
    const matches = scopedText(alias.matchScope, fields)
      .filter((entry) => entry.value.includes(phrase));
    if (!matches.length) continue;
    const strongest = Math.max(...matches.map((entry) => entry.boost));
    const exactNameBonus = fields.name === phrase ? 18 : 0;
    const contribution = Math.min(100, alias.weight * strongest + exactNameBonus);
    const current = scored.get(alias.categoryId) ?? { score: 0, signals: [] };
    current.score = Math.min(100, current.score + contribution * (current.score ? 0.25 : 1));
    for (const match of matches) {
      const signal = `${match.field}:${alias.phrase}`;
      if (!current.signals.includes(signal) && current.signals.length < 4) current.signals.push(signal);
    }
    scored.set(alias.categoryId, current);
  }

  return [...scored.entries()]
    .map(([categoryId, result]) => ({
      categoryId,
      categoryName: categoryNames.get(categoryId)!,
      confidence: Math.round(Math.min(1, result.score / 100) * 100) / 100,
      signals: result.signals,
    }))
    .filter((result) => result.confidence >= 0.2)
    .sort((left, right) => right.confidence - left.confidence || left.categoryName.localeCompare(right.categoryName, 'ar'))
    .slice(0, Math.min(Math.max(input.limit ?? 3, 1), 3));
}
