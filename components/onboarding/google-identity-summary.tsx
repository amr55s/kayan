import Image from 'next/image';
import { Avatar } from '@heroui/react/avatar';
import { googleAvatarForPresentation, profileInitials } from '@/lib/onboarding/google-profile-presentation';
import styles from './onboarding.module.css';

export function GoogleIdentitySummary({ displayName, email, avatarUrl }: {
  displayName: string;
  email: string;
  avatarUrl: unknown;
}) {
  const image = googleAvatarForPresentation(avatarUrl);
  return (
    <section className={styles.identity} aria-label="حساب Google المستخدم للانضمام">
      <Avatar size="lg" className={styles.identityAvatar} aria-hidden="true">
        {image ? <Avatar.Image src={image} asChild>
          <Image src={image} width={48} height={48} sizes="48px" alt="" unoptimized referrerPolicy="no-referrer" />
        </Avatar.Image> : null}
        <Avatar.Fallback>{profileInitials(displayName)}</Avatar.Fallback>
      </Avatar>
      <div className={styles.identityText}>
        <span className={styles.muted}>مسجل باستخدام Google</span>
        <strong>{displayName || 'حسابك في ديرتك'}</strong>
        <bdi dir="ltr">{email}</bdi>
      </div>
    </section>
  );
}
