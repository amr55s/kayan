'use server';

import { revalidatePath } from 'next/cache';
import {
  markAllMyMarketplaceNotificationsRead,
  markMyMarketplaceNotificationRead,
} from '@/lib/commerce/notifications';

export async function markNotificationReadAction(formData: FormData) {
  const id = formData.get('notificationId');
  if (typeof id !== 'string') return;
  await markMyMarketplaceNotificationRead(id);
  revalidatePath('/account/notifications');
}

export async function markAllNotificationsReadAction() {
  await markAllMyMarketplaceNotificationsRead();
  revalidatePath('/account/notifications');
}
