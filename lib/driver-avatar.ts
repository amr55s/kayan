const DRIVER_AVATAR_TONES = [
  'border-slate-200 bg-gradient-to-br from-slate-50 to-slate-200 text-slate-700',
  'border-stone-200 bg-gradient-to-br from-stone-50 to-stone-200 text-stone-700',
  'border-sky-200 bg-gradient-to-br from-sky-50 to-slate-200 text-sky-800',
  'border-violet-200 bg-gradient-to-br from-violet-50 to-slate-200 text-violet-800',
  'border-rose-200 bg-gradient-to-br from-rose-50 to-stone-200 text-rose-800',
  'border-teal-200 bg-gradient-to-br from-teal-50 to-slate-200 text-teal-800',
] as const;

export function driverAvatarTone(id: string): string {
  const hash = Array.from(id).reduce((total, character) => total + character.charCodeAt(0), 0);
  return DRIVER_AVATAR_TONES[hash % DRIVER_AVATAR_TONES.length];
}
