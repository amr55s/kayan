'use client';

import { Button, Label, TextArea } from '@heroui/react';
import { cloneElement, useRef, useState, type ChangeEvent, type FormEvent, type ReactElement } from 'react';
import type { ChatRole } from '@/lib/commerce/chat/contracts';
import { getChatErrorMessage } from '@/lib/commerce/chat/copy';
import type {
  MarketplaceChatComposerContract,
  MarketplaceChatSendInput,
} from '@/hooks/useMarketplaceChat';
import type { ChatOptimisticMessage } from '@/lib/commerce/chat/reconcile';
import { ChatComposerStatus } from './presentational/chat-composer-status';
import styles from './chat.module.css';

export type MessageComposerProps = {
  conversationId: string;
  senderRole: Exclude<ChatRole, 'system'>;
  composerRef: MarketplaceChatComposerContract['ref'];
  onComposerInput: MarketplaceChatComposerContract['onInput'];
  onComposerBlur: MarketplaceChatComposerContract['onBlur'];
  disabledReason: string | null;
  replyTo: ChatOptimisticMessage | null;
  failedMessage: ChatOptimisticMessage | null;
  onCancelReply: () => void;
  onSend: (input: MarketplaceChatSendInput) => Promise<string | null>;
  onRetry: (clientMessageId: string) => Promise<void>;
  /** Only order conversations with an active delivery may opt into this. */
  allowLocationShare?: boolean;
};

function RestrainedComposerStatus(props: Parameters<typeof ChatComposerStatus>[0]) {
  const status = ChatComposerStatus(props);
  if (!status) return null;
  const announcesFailure = props.status === 'failed';
  return cloneElement(status as ReactElement<{ role?: string; 'aria-live'?: 'polite' }>, {
    role: announcesFailure ? 'status' : undefined,
    'aria-live': announcesFailure ? 'polite' : undefined,
  });
}

export function MessageComposer({
  conversationId,
  senderRole,
  composerRef,
  onComposerInput,
  onComposerBlur,
  disabledReason,
  replyTo,
  failedMessage,
  onCancelReply,
  onSend,
  onRetry,
  allowLocationShare = false,
}: MessageComposerProps) {
  const [body, setBody] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const isDisabled = Boolean(disabledReason);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = body.trim();
    if (trimmed.length === 0) {
      setValidationError('اكتب رسالة قبل الإرسال.');
      composerRef.current?.focus();
      return;
    }
    if (trimmed.length > 5000) {
      setValidationError('يجب ألا تزيد الرسالة عن 5000 حرف.');
      return;
    }
    if (isDisabled || isPending) return;
    setValidationError(null);
    setIsPending(true);
    try {
      const clientMessageId = await onSend({
        kind: 'text',
        body: trimmed,
        replyToId: replyTo?.id ?? null,
        card: null,
        attachmentId: null,
        senderRole,
      });
      if (clientMessageId) {
        setBody('');
        onCancelReply();
      } else {
        setValidationError(getChatErrorMessage('service_unavailable'));
      }
    } finally {
      setIsPending(false);
    }
  };

  const retry = async () => {
    if (!failedMessage?.clientMessageId || isRetrying) return;
    setIsRetrying(true);
    try {
      await onRetry(failedMessage.clientMessageId);
    } finally {
      setIsRetrying(false);
    }
  };

  const sendImage = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || isDisabled || isUploading) return;
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/avif'].includes(file.type) || file.size > 8 * 1024 * 1024) {
      setValidationError('الصورة يجب أن تكون JPEG أو PNG أو WebP أو AVIF وبحد أقصى 8 ميغابايت.');
      return;
    }
    setIsUploading(true);
    setValidationError(null);
    let attachmentId: string | null = null;
    try {
      const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
      const sha256 = Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
      const begin = await fetch('/api/marketplace/chat/attachments', {
        method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'begin', conversationId, contentType: file.type, sizeBytes: file.size, sha256 }),
      });
      const prepared = await begin.json() as { attachmentId?: string; uploadUrl?: string; requiredHeaders?: Record<string, string> };
      if (!begin.ok || !prepared.attachmentId || !prepared.uploadUrl) throw new Error('attachment_begin_failed');
      attachmentId = prepared.attachmentId;
      const upload = await fetch(prepared.uploadUrl, { method: 'PUT', headers: prepared.requiredHeaders, body: file });
      if (!upload.ok) throw new Error('attachment_upload_failed');
      const complete = await fetch('/api/marketplace/chat/attachments', {
        method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'complete', attachmentId }),
      });
      if (!complete.ok) throw new Error('attachment_complete_failed');
      const clientMessageId = await onSend({ kind: 'image', body: null, replyToId: replyTo?.id ?? null, card: null, attachmentId, senderRole });
      if (!clientMessageId) throw new Error('image_message_failed');
      onCancelReply();
    } catch {
      if (attachmentId) void fetch('/api/marketplace/chat/attachments', {
        method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'delete', attachmentId }),
      });
      setValidationError('تعذر رفع الصورة بشكل آمن. حاول مرة أخرى.');
    } finally { setIsUploading(false); }
  };

  const shareLocation = () => {
    if (!allowLocationShare || !navigator.geolocation) {
      setValidationError('مشاركة الموقع متاحة للطلبات النشطة فقط.');
      return;
    }
    const accepted = window.confirm('هل تريد مشاركة موقعك الحالي مرة واحدة لهذه المحادثة؟ لن يتم تتبعك في الخلفية.');
    if (!accepted) return;
    navigator.geolocation.getCurrentPosition((position) => {
      void onSend({ kind: 'location', body: null, replyToId: replyTo?.id ?? null, card: {
        type: 'location', latitude: position.coords.latitude, longitude: position.coords.longitude,
      }, attachmentId: null, senderRole });
    }, () => setValidationError('تعذر الوصول إلى موقعك. تحقق من الإذن وحاول مجددًا.'), { enableHighAccuracy: false, timeout: 10_000, maximumAge: 0 });
  };

  return (
    <form className={styles.composer} onSubmit={submit} aria-describedby="chat-composer-help chat-composer-feedback">
      {replyTo ? (
        <div className={styles.replyDraft}>
          <span>الرد على: {replyTo.body?.trim().slice(0, 80) || 'رسالة سابقة'}</span>
          <Button type="button" variant="ghost" onPress={onCancelReply} isDisabled={isPending}>
            إلغاء الرد
          </Button>
        </div>
      ) : null}

      <Label htmlFor="chat-body" isRequired isDisabled={isDisabled || isPending || isRetrying} isInvalid={Boolean(validationError)}>
        اكتب رسالة
      </Label>
      <div className={styles.composerRow}>
        <TextArea
          ref={composerRef}
          id="chat-body"
          name="body"
          value={body}
          rows={2}
          maxLength={5000}
          required
          disabled={isDisabled || isPending || isRetrying}
          aria-invalid={Boolean(validationError)}
          aria-errormessage={validationError ? 'chat-composer-feedback' : undefined}
          onInput={onComposerInput}
          onBlur={onComposerBlur}
          onChange={(event) => {
            setBody(event.target.value);
            if (validationError) setValidationError(null);
          }}
          placeholder="اكتب استفسارك هنا…"
          className={styles.composerInput}
        />
        <Button
          type="submit"
          variant="primary"
          isPending={isPending}
          isDisabled={isDisabled || isPending || body.trim().length === 0}
          className={styles.sendButton}
        >
          {isPending ? 'جارٍ الإرسال…' : 'إرسال'}
        </Button>
      </div>
      <div className={styles.composerHelpRow}>
        <small id="chat-composer-help">نص عادي فقط · {body.length}/5000</small>
        {disabledReason ? <small>{disabledReason}</small> : null}
      </div>
      <div className={styles.composerHelpRow}>
        <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/avif" onChange={sendImage} hidden />
        <Button type="button" variant="ghost" isDisabled={isDisabled || isUploading} onPress={() => fileInputRef.current?.click()}>
          {isUploading ? 'جارٍ رفع الصورة…' : 'إرفاق صورة'}
        </Button>
        {allowLocationShare ? <Button type="button" variant="ghost" isDisabled={isDisabled || isUploading} onPress={shareLocation}>مشاركة موقعي مرة واحدة</Button> : null}
      </div>

      <div id="chat-composer-feedback">
        {validationError ?? ''}
      </div>
      <RestrainedComposerStatus
        status={isRetrying ? 'retrying' : failedMessage ? 'failed' : isPending ? 'sending' : 'idle'}
        errorMessage={failedMessage?.failureCode ? getChatErrorMessage(failedMessage.failureCode) : undefined}
        onRetry={failedMessage ? () => void retry() : undefined}
      />
    </form>
  );
}
