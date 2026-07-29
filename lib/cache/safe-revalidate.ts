import 'server-only';

import { revalidatePath, revalidateTag } from 'next/cache';

type PathEntry = string | readonly [path: string, type: 'layout' | 'page'];

export function safeRevalidatePaths(...entries: PathEntry[]) {
  for (const entry of entries) {
    try {
      if (typeof entry === 'string') {
        revalidatePath(entry);
      } else {
        revalidatePath(entry[0], entry[1]);
      }
    } catch (error) {
      // Cache refresh is best-effort after a committed mutation. It must never
      // turn a successful write into a failure response shown to the user.
      console.warn('Post-mutation path refresh was deferred:', entry, error);
    }
  }
}

export function safeRevalidateTags(...tags: string[]) {
  for (const tag of tags) {
    try {
      revalidateTag(tag, 'max');
    } catch (error) {
      console.warn('Post-mutation tag refresh was deferred:', tag, error);
    }
  }
}
