const DRIVER_AVATAR_TONES = [
  'border-slate-200 bg-slate-100 text-slate-700',
  'border-stone-200 bg-stone-100 text-stone-700',
  'border-sky-200 bg-sky-50 text-sky-800',
  'border-violet-200 bg-violet-50 text-violet-800',
  'border-rose-200 bg-rose-50 text-rose-800',
  'border-teal-200 bg-teal-50 text-teal-800',
] as const;

export function driverAvatarTone(id: string): string {
  const hash = Array.from(id).reduce((total, character) => total + character.charCodeAt(0), 0);
  return DRIVER_AVATAR_TONES[hash % DRIVER_AVATAR_TONES.length];
}
