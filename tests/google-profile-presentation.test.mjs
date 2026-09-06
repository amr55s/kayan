import assert from 'node:assert/strict';
import test from 'node:test';
import { googleAvatarForPresentation, profileInitials } from '../lib/onboarding/google-profile-presentation.ts';

test('Google avatar presentation accepts only bounded HTTPS Google image URLs', () => {
  assert.equal(googleAvatarForPresentation('https://lh3.googleusercontent.com/a/photo=s96-c'), 'https://lh3.googleusercontent.com/a/photo=s96-c');
  for (const input of [undefined, {}, 'javascript:alert(1)', 'data:image/svg+xml,test', 'http://lh3.googleusercontent.com/a', 'https://googleusercontent.com.evil.test/a', 'https://evilgoogleusercontent.com/a', 'https://user:secret@lh3.googleusercontent.com/a', 'https://lh3.googleusercontent.com:8443/a', 'https://lh3.googleusercontent.com/' + 'a'.repeat(2050)]) {
    assert.equal(googleAvatarForPresentation(input), null);
  }
});

test('avatar initials handle Arabic, blank metadata and non-BMP characters without replacement glyphs', () => {
  assert.equal(profileInitials('  أحمد محمد  علي '), 'أم');
  assert.equal(profileInitials(''), 'د');
  assert.equal(profileInitials('🙂 User'), '🙂U');
});
