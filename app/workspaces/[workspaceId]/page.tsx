import { notFound, redirect } from 'next/navigation';
import { z } from 'zod';
import { Button } from '@heroui/react';
import { cookies } from 'next/headers';
import { listMyActivityWorkspaces } from '@/lib/onboarding/repository';
import { Header } from '@/components/layout/Header';

export const dynamic = 'force-dynamic';

async function enterWorkspace(formData: FormData) {
  'use server';
  const id = z.uuid().parse(formData.get('workspaceId'));
  const workspace = (await listMyActivityWorkspaces()).find(item => item.id === id && item.canManage);
  if (!workspace) notFound();
  (await cookies()).set('dairtak_workspace', workspace.id, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 60 * 60 * 24 * 30 });
  redirect(workspace.activityKind === 'driver' ? '/driver' : workspace.storeId ? '/merchant/marketplace' : '/merchant');
}

export default async function WorkspacePage({ params }: { params: Promise<{ workspaceId: string }> }) {
  const id = z.uuid().safeParse((await params).workspaceId);
  if (!id.success) notFound();
  const workspace = (await listMyActivityWorkspaces()).find(item => item.id === id.data);
  if (!workspace) notFound();
  if (!workspace.canManage) redirect('/workspaces');
  return <><Header /><main id="main-content" className="dairtak-theme mx-auto max-w-xl p-6"><section className="dairtak-card p-6">
    <h1 className="text-2xl font-bold">{workspace.name}</h1><p className="my-4 leading-7">ستفتح لوحة هذا النشاط. تقدر ترجع لمساحات عملك وتبدّل النشاط في أي وقت.</p>
    <form action={enterWorkspace}><input type="hidden" name="workspaceId" value={workspace.id} /><Button type="submit" className="dairtak-button">دخول مساحة النشاط</Button></form>
  </section></main></>;
}
