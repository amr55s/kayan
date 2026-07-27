export async function sharePlace(
  title: string,
  phone: string,
  pageUrl?: string
): Promise<boolean> {
  const url = pageUrl || (typeof window !== 'undefined' ? window.location.href : '');
  const text = `${title}\n${phone}\nعبر خدمات الكيان\n${url}`;

  if (typeof navigator !== 'undefined' && navigator.share) {
    try {
      await navigator.share({ title: `${title} — خدمات الكيان`, text, url });
      return true;
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return false;
      fallbackWhatsApp(text);
      return true;
    }
  }

  fallbackWhatsApp(text);
  return true;
}

function fallbackWhatsApp(text: string): void {
  const encoded = encodeURIComponent(text);
  window.open(`https://wa.me/?text=${encoded}`, '_blank');
}
