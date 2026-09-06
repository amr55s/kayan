import { GoogleSignInButton } from './GoogleSignInButton';

export function SwitchToGoogleButton() {
  return <GoogleSignInButton
    switchAccount
    label="تسجيل الخروج والمتابعة باستخدام Google"
    helper="سنغلق الجلسة الحالية على هذا الجهاز فقط. حسابك القديم وأنشطته محفوظة؛ لن ننقل بياناته أو نربطه تلقائيًا بحساب آخر."
  />;
}
