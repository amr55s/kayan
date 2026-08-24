'use client';

import { startTransition, useActionState, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { AlertCircle, CheckCircle2, Download, FileSpreadsheet, Upload } from 'lucide-react';
import { Alert } from '@heroui/react/alert';
import { Button } from '@heroui/react/button';
import { Spinner } from '@heroui/react/spinner';
import { ExcelJobStatusBadge } from './status-badge';
import type { MerchantExcelActions, MerchantExcelPanelViewModel } from './view-models';
import styles from './merchant-marketplace.module.css';

function formatJobDate(value: string | null) {
  if (!value) return 'غير متاح';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'غير متاح';
  return new Intl.DateTimeFormat('ar-EG', {
    dateStyle: 'medium', timeStyle: 'short', timeZone: 'Africa/Cairo',
  }).format(date);
}

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function MerchantExcelPanel({
  viewModel,
  actions = {},
}: {
  viewModel: MerchantExcelPanelViewModel;
  actions?: MerchantExcelActions;
}) {
  const fallbackAction = async (state: typeof viewModel.validation) => state;
  const [validation, processWorkbook, pending] = useActionState(
    actions.processWorkbookAction ?? fallbackAction,
    viewModel.validation,
  );
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [importIdempotencyKey] = useState(viewModel.importIdempotencyKey);
  const [stagedUpload, setStagedUpload] = useState<{
    fileId: string;
    filename: string;
    byteSize: number;
    checksumSha256: string;
  } | null>(null);
  const canUseStore = Boolean(viewModel.storeId);
  const canApply = validation.status === 'valid'
    && Boolean(validation.jobId)
    && Boolean(validation.jobUpdatedAt)
    && Boolean(actions.processWorkbookAction);

  async function uploadWorkbook(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!viewModel.storeId || !actions.processWorkbookAction || uploading || pending) return;
    const form = new FormData(event.currentTarget);
    const workbook = form.get('workbook');
    if (!(workbook instanceof File) || workbook.size < 1) return;
    setUploading(true);
    let preparedFileId: string | null = null;
    try {
      setUploadStatus('جارٍ حساب بصمة الملف…');
      const checksumSha256 = bytesToHex(new Uint8Array(await crypto.subtle.digest('SHA-256', await workbook.arrayBuffer())));
      let fileId = validation.status === 'error'
        && stagedUpload?.filename === workbook.name
        && stagedUpload.byteSize === workbook.size
        && stagedUpload.checksumSha256 === checksumSha256
        ? stagedUpload.fileId : null;
      if (!fileId) {
        setUploadStatus('جارٍ تجهيز رفع خاص وآمن…');
        const preparedResponse = await fetch('/api/catalog-imports/files', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            storeId: viewModel.storeId,
            byteSize: workbook.size,
            checksumSha256,
          }),
        });
        const prepared = await preparedResponse.json() as unknown;
        if (
          !preparedResponse.ok || typeof prepared !== 'object' || prepared === null
          || !('fileId' in prepared) || typeof prepared.fileId !== 'string'
          || !('uploadUrl' in prepared) || typeof prepared.uploadUrl !== 'string'
          || !('requiredHeaders' in prepared) || typeof prepared.requiredHeaders !== 'object'
          || prepared.requiredHeaders === null
        ) throw new Error('prepare_failed');
        preparedFileId = prepared.fileId;
        const headers = Object.fromEntries(
          Object.entries(prepared.requiredHeaders).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
        );
        setUploadStatus('جارٍ رفع الملف إلى التخزين الخاص…');
        const uploaded = await fetch(prepared.uploadUrl, { method: 'PUT', headers, body: workbook });
        if (!uploaded.ok) throw new Error('upload_failed');
        fileId = preparedFileId;
        setStagedUpload({ fileId, filename: workbook.name, byteSize: workbook.size, checksumSha256 });
      } else {
        setUploadStatus('جارٍ إعادة فحص النسخة المرفوعة بأمان…');
      }
      setUploadStatus('جارٍ فحص الصفوف على الخادم…');
      const request = new FormData();
      request.set('intent', 'validate-product-workbook');
      request.set('storeId', viewModel.storeId);
      request.set('idempotencyKey', importIdempotencyKey);
      request.set('fileId', fileId);
      request.set('filename', workbook.name);
      request.set('byteSize', String(workbook.size));
      request.set('checksumSha256', checksumSha256);
      startTransition(() => processWorkbook(request));
      setUploadStatus('اكتمل الرفع؛ يجري إظهار نتيجة الفحص…');
    } catch {
      if (preparedFileId) {
        await fetch('/api/catalog-imports/files', {
          method: 'DELETE',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ storeId: viewModel.storeId, fileId: preparedFileId }),
        }).catch(() => undefined);
        setStagedUpload(null);
      }
      setUploadStatus('تعذر رفع الملف. الملف المختار ما زال موجودًا؛ أعد المحاولة بعد لحظات.');
    } finally {
      setUploading(false);
    }
  }

  return (
    <div>
      <header className={styles.pageHeader}>
        <div>
          <p className={styles.eyebrow}>إدارة جماعية</p>
          <h1 className={styles.title}>استيراد وتصدير Excel</h1>
          <p className={styles.subtitle}>افحص الملف أولًا، أصلح الأخطاء، ثم طبّق العملية بعقد واحد قابل للتتبع.</p>
        </div>
        <Link href="/merchant/marketplace" className={styles.secondaryLink}>العودة للمنتجات</Link>
      </header>

      <Alert.Root status="warning" className={styles.alert}>
        <Alert.Content>
          <Alert.Title className={styles.alertTitle}>قواعد الاستيراد</Alert.Title>
          <Alert.Description className={styles.alertDescription}>
            ملف XLSX حتى 10 ميجابايت، وبحد أقصى 5,000 منتج و20,000 متغير و10 صور لكل منتج.
            المنتجات الجديدة تُحفظ كمسودة ثم تُرسل للمراجعة من صفحة المنتج.
          </Alert.Description>
        </Alert.Content>
      </Alert.Root>

      <div className={styles.excelGrid}>
        <div className={styles.editorMain}>
          <section className={styles.excelSection} aria-labelledby="excel-import-title">
            <div className={styles.sectionHeader}>
              <div>
                <h2 id="excel-import-title" className={styles.sectionTitle}>رفع وفحص الملف</h2>
                <p className={styles.helper}>المتجر: {viewModel.storeName || 'غير مربوط'}</p>
              </div>
              <FileSpreadsheet size={22} aria-hidden="true" />
            </div>
            <form onSubmit={uploadWorkbook} className={styles.uploadPanel}>
              <label className={styles.fieldGroup} htmlFor="merchant-product-workbook">
                <span className={styles.label}>ملف المنتجات</span>
                <input
                  id="merchant-product-workbook"
                  name="workbook"
                  type="file"
                  accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  required
                  disabled={!canUseStore || !actions.processWorkbookAction || pending || uploading}
                  className={styles.fileInput}
                />
              </label>
              <Button.Root
                type="submit"
                isDisabled={!canUseStore || !actions.processWorkbookAction || pending || uploading}
                className={styles.primaryButton}
              >
                {pending || uploading ? <Spinner.Root size="sm" aria-label="جارٍ فحص الملف" /> : <Upload size={16} aria-hidden="true" />}
                {uploading ? 'جارٍ الرفع…' : 'رفع وفحص الملف'}
              </Button.Root>
              {uploadStatus ? <p className={styles.helper} role="status" aria-live="polite">{uploadStatus}</p> : null}
            </form>
          </section>

          <section className={styles.excelSection} aria-labelledby="excel-validation-title">
            <div className={styles.sectionHeader}>
              <div>
                <h2 id="excel-validation-title" className={styles.sectionTitle}>نتيجة الفحص</h2>
                <p className={styles.helper}>{validation.filename || 'لم يُرفع ملف بعد'}</p>
              </div>
              {validation.status === 'valid'
                ? <CheckCircle2 size={22} color="#166534" aria-hidden="true" />
                : validation.status === 'processing'
                  ? <Spinner.Root size="sm" aria-label="جارٍ معالجة صور المنتجات" />
                : validation.status === 'invalid' || validation.status === 'error'
                  ? <AlertCircle size={22} color="#991b1b" aria-hidden="true" /> : null}
            </div>

            <div className={styles.metrics}>
              <div className={styles.metric}><span className={styles.metricValue}>{validation.productRows.toLocaleString('ar-EG')}</span><span className={styles.metricLabel}>منتجات</span></div>
              <div className={styles.metric}><span className={styles.metricValue}>{validation.variantRows.toLocaleString('ar-EG')}</span><span className={styles.metricLabel}>متغيرات</span></div>
              <div className={styles.metric}><span className={styles.metricValue}>{validation.imageRows.toLocaleString('ar-EG')}</span><span className={styles.metricLabel}>صور</span></div>
            </div>

            {validation.message ? (
              <Alert.Root
                status={validation.status === 'valid' ? 'success' : validation.status === 'processing' ? 'warning' : 'danger'}
                className={styles.alert}
              >
                <Alert.Content>
                  <Alert.Title className={styles.alertTitle}>
                    {validation.status === 'valid'
                      ? 'اكتملت العملية'
                      : validation.status === 'processing'
                        ? 'جارٍ معالجة الصور'
                        : 'تعذر إكمال العملية'}
                  </Alert.Title>
                  <Alert.Description className={styles.alertDescription}>{validation.message}</Alert.Description>
                </Alert.Content>
              </Alert.Root>
            ) : <p className={styles.helper}>ستظهر هنا نتيجة التحقق وأرقام الصفوف التي تحتاج إلى تصحيح.</p>}

            {validation.issues.length ? (
              <div className={styles.tablePanel}>
                <table className={styles.table}>
                  <caption className={styles.screenReaderOnly}>أخطاء وتحذيرات ملف المنتجات</caption>
                  <thead><tr><th scope="col">النوع</th><th scope="col">الورقة</th><th scope="col">الصف</th><th scope="col">العمود</th><th scope="col">التفاصيل</th></tr></thead>
                  <tbody>{validation.issues.map((issue) => (
                    <tr key={issue.id}>
                      <td className={issue.severity === 'error' ? styles.issueError : styles.issueWarning}>{issue.severity === 'error' ? 'خطأ' : 'تحذير'}</td>
                      <td>{issue.sheet}</td><td>{issue.row?.toLocaleString('ar-EG') || '—'}</td><td>{issue.column || '—'}</td><td>{issue.message}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            ) : null}

            {validation.jobId ? (
              <form action={processWorkbook} className={styles.formActions}>
                <input type="hidden" name="intent" value="apply-product-workbook" />
                <input type="hidden" name="storeId" value={viewModel.storeId || ''} />
                <input type="hidden" name="jobId" value={validation.jobId} />
                <input type="hidden" name="expectedUpdatedAt" value={validation.jobUpdatedAt || ''} />
                <Button.Root type="submit" isDisabled={!canApply || pending} className={styles.primaryButton}>
                  {pending ? <Spinner.Root size="sm" aria-label="جارٍ تطبيق الاستيراد" /> : <CheckCircle2 size={16} aria-hidden="true" />}
                  تطبيق الاستيراد
                </Button.Root>
              </form>
            ) : null}
          </section>
        </div>

        <aside className={styles.editorAside}>
          <section className={styles.excelSection} aria-labelledby="excel-export-title">
            <div className={styles.sectionHeader}>
              <div><h2 id="excel-export-title" className={styles.sectionTitle}>تصدير الكتالوج</h2><p className={styles.helper}>نزّل المنتجات والمتغيرات والصور بنفس عقد الاستيراد.</p></div>
              <Download size={21} aria-hidden="true" />
            </div>
            {viewModel.exportState.downloadUrl ? (
              <a href={viewModel.exportState.downloadUrl} className={styles.primaryLink}>
                <Download size={16} aria-hidden="true" /> تنزيل ملف المنتجات
              </a>
            ) : <p className={styles.helper}>اربط متجرًا أولًا لتصدير الكتالوج.</p>}
          </section>

          <section className={styles.excelSection} aria-labelledby="excel-jobs-title">
            <div className={styles.sectionHeader}><div><h2 id="excel-jobs-title" className={styles.sectionTitle}>آخر عمليات الاستيراد</h2><p className={styles.helper}>الحالة والنتيجة محفوظتان لكل عملية.</p></div></div>
            {viewModel.jobs.length ? <div className={styles.jobList}>{viewModel.jobs.map((job) => (
              <article key={job.id} className={styles.jobCard}>
                <div className={styles.jobHeader}><div><h3 className={styles.cardTitle}>{job.filename}</h3><p className={styles.meta}>{formatJobDate(job.createdAt)}</p></div><ExcelJobStatusBadge status={job.status} /></div>
                <div className={styles.jobStats}><span>{job.validRows.toLocaleString('ar-EG')} صالح</span><span>{job.invalidRows.toLocaleString('ar-EG')} غير صالح</span><span>{job.createdProducts.toLocaleString('ar-EG')} مطبق</span></div>
                {job.errorMessage ? <p className={styles.moderationNote}>{job.errorMessage}</p> : null}
                {job.completedAt ? <p className={styles.meta}>اكتملت: {formatJobDate(job.completedAt)}</p> : null}
              </article>
            ))}</div> : <p className={styles.helper}>لا توجد عمليات استيراد سابقة.</p>}
          </section>
        </aside>
      </div>
    </div>
  );
}
