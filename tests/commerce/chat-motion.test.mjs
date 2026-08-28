import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  CHAT_MOTION_DURATION_MS,
  CHAT_MOTION_EASING,
  MessageAnimationTracker,
  chatMessageEntrance,
  chatOptimisticAck,
  chatPresenceDot,
  chatRetryNotice,
  chatUnreadIndicator,
} from '../../lib/commerce/chat/motion.ts';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

test('MessageAnimationTracker suppresses entrance animation for initial batch and duplicate renders', () => {
  const tracker = new MessageAnimationTracker();

  // 1. Initial page load batch should be registered without animating
  assert.equal(tracker.shouldAnimate('m-1', true), false);
  assert.equal(tracker.shouldAnimate('m-2', true), false);
  assert.equal(tracker.size, 2);

  // 2. Already seen messages on re-render / reconciliation must never animate again
  assert.equal(tracker.shouldAnimate('m-1', false), false);
  assert.equal(tracker.shouldAnimate('m-2', false), false);

  // 3. Newly arrived message must animate exactly once
  assert.equal(tracker.shouldAnimate('m-3', false), true);
  assert.equal(tracker.shouldAnimate('m-3', false), false); // Subsequent render -> false

  // 4. Invalid keys are safely rejected
  assert.equal(tracker.shouldAnimate('', false), false);
  assert.equal(tracker.shouldAnimate(null, false), false);

  // 5. Reset clears tracking for fresh conversation mount
  tracker.reset();
  assert.equal(tracker.size, 0);
  assert.equal(tracker.shouldAnimate('m-1', false), true);
});

test('motion variants enforce restrained durations between 120ms and 220ms using GPU transforms', () => {
  const presets = [
    { name: 'messageEntrance', preset: chatMessageEntrance },
    { name: 'optimisticAck', preset: chatOptimisticAck },
    { name: 'retryNotice', preset: chatRetryNotice },
    { name: 'unreadIndicator', preset: chatUnreadIndicator },
    { name: 'presenceDot', preset: chatPresenceDot },
  ];

  for (const { name, preset } of presets) {
    const duration = preset.animate.transition.duration;
    assert.ok(
      duration >= 0.12 && duration <= 0.22,
      `${name} duration ${duration}s is not within the 120-220ms range`,
    );

    // Ensure animate only targets GPU properties (opacity, y, scale)
    const animateKeys = Object.keys(preset.animate).filter((key) => key !== 'transition');
    for (const key of animateKeys) {
      assert.ok(
        ['opacity', 'y', 'x', 'scale'].includes(key),
        `${name} animate property '${key}' is not GPU-accelerated`,
      );
    }
  }

  assert.ok(CHAT_MOTION_DURATION_MS >= 120 && CHAT_MOTION_DURATION_MS <= 220);
  assert.deepEqual(CHAT_MOTION_EASING, [0.16, 1, 0.3, 1]);
});

test('motion variants provide immediate duration: 0 fallbacks for prefers-reduced-motion', () => {
  const presets = [
    chatMessageEntrance,
    chatOptimisticAck,
    chatRetryNotice,
    chatUnreadIndicator,
    chatPresenceDot,
  ];

  for (const preset of presets) {
    assert.equal(preset.reduced.transition.duration, 0);
    assert.equal(preset.reduced.opacity, 1);
    if ('y' in preset.reduced) assert.equal(preset.reduced.y, 0);
    if ('scale' in preset.reduced) assert.equal(preset.reduced.scale, 1);
  }
});

test('marketplace CSS stylesheet enforces prefers-reduced-motion overrides', () => {
  const css = read('components/marketplace/marketplace.module.css');
  assert.match(css, /@media\s*\(\s*prefers-reduced-motion:\s*reduce\s*\)/);
  assert.match(css, /transition-duration:\s*0\.01ms\s*!important/);
  assert.match(css, /animation-duration:\s*0\.01ms\s*!important/);
  assert.match(css, /transition:\s*background-color\s*160ms/);
});
