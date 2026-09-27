import { diffWordsWithSpace } from "diff";

type InputPair = {
  payload: {
    originalInput: string;
    challengeInput: string;
  };
};

export function controlledFacts(before: string, after: string) {
  const parts = diffWordsWithSpace(before, after);
  const removed = parts.filter((part) => part.removed).map((part) => part.value.trim()).filter(Boolean);
  const added = parts.filter((part) => part.added).map((part) => part.value.trim()).filter(Boolean);

  let original = removed.join(" ").replace(/[.,;:!?]+$/, "");
  let changed = added.join(" ").replace(/[.,;:!?]+$/, "");
  const lastChange = parts.reduce((index, part, partIndex) => part.added || part.removed ? partIndex : index, -1);
  const followingWord = parts.slice(lastChange + 1).find((part) => !part.added && !part.removed)?.value.trim().split(/\s+/)[0]?.replace(/[.,;:!?]+$/, "");

  if (/^\d+$/.test(original) && /^\d+$/.test(changed) && followingWord) {
    original = `${original} ${followingWord}`;
    changed = `${changed} ${followingWord}`;
  }

  return {
    original,
    changed,
    isSingleReplacement: removed.length === 1 && added.length === 1,
  };
}

export function selectHomepageRecord<T extends InputPair>(records: T[]) {
  return records.find((item) => {
    const fact = controlledFacts(item.payload.originalInput, item.payload.challengeInput);
    return fact.isSingleReplacement && fact.original.length > 0 && fact.changed.length > 0 && fact.original.length <= 32 && fact.changed.length <= 32;
  }) ?? null;
}
