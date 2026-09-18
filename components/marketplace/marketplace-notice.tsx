import { Alert } from '@heroui/react/alert';

export function MarketplaceNotice({
  tone,
  children,
}: {
  tone: 'success' | 'danger';
  children: string;
}) {
  return (
    <Alert
      status={tone === 'success' ? 'success' : 'danger'}
      className="mb-5"
      role={tone === 'danger' ? 'alert' : 'status'}
      aria-live={tone === 'danger' ? 'assertive' : 'polite'}
    >
      <Alert.Indicator />
      <Alert.Content>
        <Alert.Title>{children}</Alert.Title>
      </Alert.Content>
    </Alert>
  );
}
