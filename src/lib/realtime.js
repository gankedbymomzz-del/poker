// Nghe tín hiệu "bàn vừa đổi" từ Supabase Realtime.
// Tín hiệu chỉ có mã bàn + số phiên bản; nhận được thì hỏi máy chủ để lấy đúng phần mình được xem.
let clientP = null;

function getClient() {
  if (!clientP) {
    clientP = (async () => {
      const r = await fetch('/api/poker?action=config');
      const cfg = await r.json();
      if (!cfg.url || !cfg.publishableKey) return null;
      const { createClient } = await import('@supabase/supabase-js');
      return createClient(cfg.url, cfg.publishableKey, { auth: { persistSession: false, autoRefreshToken: false } });
    })().catch(() => null);
  }
  return clientP;
}

export async function subscribeRoom(code, onChange, onStatus) {
  const sb = await getClient();
  if (!sb) { onStatus?.('off'); return () => {}; }
  const ch = sb
    .channel(`poker-${code}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'poker_signals', filter: `code=eq.${code}` }, () => onChange())
    .subscribe((status) => onStatus?.(status));
  return () => { sb.removeChannel(ch); };
}
