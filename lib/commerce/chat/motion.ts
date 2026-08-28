/**
 * Restrained micro-animation presets and deduplication tracking for DAIRTAK chat interactions.
 * Strictly enforces 120-220ms durations, GPU-accelerated opacity/transform, and complete reduced-motion fallbacks.
 */

export const CHAT_MOTION_DURATION_MS = 160;
export const CHAT_MOTION_EASING = [0.16, 1, 0.3, 1] as const;

/** Motion variants for incoming and newly dispatched message bubbles. */
export const chatMessageEntrance = {
  initial: { opacity: 0, y: 6 },
  animate: {
    opacity: 1,
    y: 0,
    transition: { duration: CHAT_MOTION_DURATION_MS / 1000, ease: CHAT_MOTION_EASING },
  },
  reduced: { opacity: 1, y: 0, transition: { duration: 0 } },
};

/** Micro-transition for optimistic message status resolving to confirmed. */
export const chatOptimisticAck = {
  initial: { scale: 0.98, opacity: 0.85 },
  animate: {
    scale: 1,
    opacity: 1,
    transition: { duration: 140 / 1000, ease: CHAT_MOTION_EASING },
  },
  reduced: { scale: 1, opacity: 1, transition: { duration: 0 } },
};

/** Feedback transition when an optimistic message fails and reveals retry controls. */
export const chatRetryNotice = {
  initial: { opacity: 0, y: -4 },
  animate: {
    opacity: 1,
    y: 0,
    transition: { duration: 180 / 1000, ease: CHAT_MOTION_EASING },
  },
  reduced: { opacity: 1, y: 0, transition: { duration: 0 } },
};

/** Floating unread messages indicator badge pill. */
export const chatUnreadIndicator = {
  initial: { opacity: 0, scale: 0.92, y: 8 },
  animate: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { duration: 150 / 1000, ease: CHAT_MOTION_EASING },
  },
  exit: {
    opacity: 0,
    scale: 0.92,
    y: 8,
    transition: { duration: 120 / 1000 },
  },
  reduced: { opacity: 1, scale: 1, y: 0, transition: { duration: 0 } },
};

/** Online presence indicator dot transition. */
export const chatPresenceDot = {
  initial: { scale: 0.8, opacity: 0 },
  animate: {
    scale: 1,
    opacity: 1,
    transition: { duration: 120 / 1000, ease: CHAT_MOTION_EASING },
  },
  reduced: { scale: 1, opacity: 1, transition: { duration: 0 } },
};

/**
 * MessageAnimationTracker tracks message keys across state reconciliation cycles.
 * Ensures incoming, reconciled, or paginated older messages never re-trigger entrance animations.
 */
export class MessageAnimationTracker {
  private readonly seenKeys = new Set<string>();

  /**
   * Evaluates if a message should animate on entrance.
   *
   * @param key - The unique identifier (server ID or clientMessageId).
   * @param isInitialBatch - If true (e.g. initial conversation load), registers keys without animating.
   * @returns true if the message is new and should animate, false if previously seen or initial batch.
   */
  public shouldAnimate(key: string, isInitialBatch = false): boolean {
    if (!key || typeof key !== 'string') return false;
    if (isInitialBatch) {
      this.seenKeys.add(key);
      return false;
    }
    if (this.seenKeys.has(key)) return false;
    this.seenKeys.add(key);
    return true;
  }

  /**
   * Resets the tracker when switching conversations.
   */
  public reset(): void {
    this.seenKeys.clear();
  }

  /** Current count of tracked message keys. */
  public get size(): number {
    return this.seenKeys.size;
  }
}
