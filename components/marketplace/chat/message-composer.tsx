'use client';

import { Button, Label, TextArea } from '@heroui/react';
import { cloneElement, useState, type FormEvent, type ReactElement } from 'react';
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
}: MessageComposerProps) {
  const [body, setBody] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
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
