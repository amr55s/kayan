import { MerchantStoreSettingsPanel, setupErrors, setupMessages, StoreOnboardingPanel } from '@/components/marketplace/operational-setup-panels';
import styles from '@/components/marketplace/operational-setup.module.css';
import { getMerchantOperationalSetup } from '@/lib/commerce/operational-setup';
import { getMyStoreContact, type StoreContact } from '@/lib/commerce/wallet';
import {
  createMarketplaceStoreAction,
  deleteMarketplaceStoreImageAction,
  reorderMarketplaceStoreImagesAction,
  saveStoreDeliveryConfigurationAction,
  saveStoreBranchAction,
  deleteStoreBranchAction,
  saveBranchDeliveryConfigurationAction,
  saveStoreContactAction,
  submitMarketplaceStoreAction,
  undoMarketplaceStoreImageDeletionAction,
  updateMarketplaceStoreAction,
} from '@/app/merchant/marketplace/setup-actions';

function single(value: string | string[] | undefined) { return typeof value === 'string' ? value : ''; }

export default async function MerchantMarketplaceSettingsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const setup = await getMerchantOperationalSetup(single(params.store) || null);
  // The contact table arrives with the wallet migration; older schemas render without it.
  const contact: StoreContact = setup.selected
    ? await getMyStoreContact(setup.selected.id).catch(() => null)
    : null;
  const notice = setupMessages[single(params.notice)];
  const error = setupErrors[single(params.error)];
  return <div className={styles.page}>
    <header className={styles.header}><div><h1>إعداد المتجر والتوصيل</h1><p>بيانات تشغيل واضحة ومناطق توصيل فعلية قبل استقبال الطلبات.</p></div></header>
    {notice ? <p role="status" className={styles.notice}>{notice}</p> : null}
    {error ? <p role="alert" className={styles.error}>{error}</p> : null}
    {setup.selected && setup.delivery
      ? <MerchantStoreSettingsPanel stores={setup.stores} merchants={setup.merchants} selected={setup.selected} delivery={setup.delivery} branches={setup.branches} contact={contact} actions={{ saveContact: saveStoreContactAction,  create: createMarketplaceStoreAction, update: updateMarketplaceStoreAction, submit: submitMarketplaceStoreAction, saveDelivery: saveStoreDeliveryConfigurationAction, saveBranch: saveStoreBranchAction, deleteBranch: deleteStoreBranchAction, saveBranchDelivery: saveBranchDeliveryConfigurationAction, reorderImages: reorderMarketplaceStoreImagesAction, deleteImage: deleteMarketplaceStoreImageAction, undoDeleteImage: undoMarketplaceStoreImageDeletionAction }} />
      : <StoreOnboardingPanel merchants={setup.merchants} action={createMarketplaceStoreAction} />}
  </div>;
}
