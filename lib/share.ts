export async function sharePlace(
  title: string,
  phone: string,
  pageUrl?: string
): Promise<boolean> {
  const url = pageUrl || (typeof window !== 'undefined' ? window.location.href : '');
  const text = `${title}\n${phone}\nعبر كيان سيتي سبوت`;

  if (typeof navigator !== 'undefined' && navigator.share) {
    try {
      await navigator.share({ title: `${title} — كيان سيتي سبوت`, text, url });
      return true;
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return false;
      fallbackWhatsApp(`${text}\n${url}`);
      return true;
    }
  }

  fallbackWhatsApp(`${text}\n${url}`);
  return true;
}

export async function shareDirectoryItem(
  title: string,
  pageUrl: string,
  description = 'شاهد التفاصيل وتواصل مباشرة بدون وسيط أو عمولات عبر كيان سيتي سبوت',
): Promise<boolean> {
  const text = `${title}\n${description}`;
  if (typeof navigator !== 'undefined' && navigator.share) {
    try {
      await navigator.share({
        title: `${title} — كيان سيتي سبوت`,
        text,
        url: pageUrl,
      });
      return true;
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return false;
    }
  }
  fallbackWhatsApp(`${text}\n${pageUrl}`);
  return true;
}

function fallbackWhatsApp(text: string): void {
  const encoded = encodeURIComponent(text);
  try {
    window.open(`https://wa.me/?text=${encoded}`, '_blank', 'noopener,noreferrer');
  } catch {
    // Sharing is optional and must never interrupt the directory.
  }
}
