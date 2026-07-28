// Публичные, доступные из браузера значения — это ОК, это не секреты.
// anon key даёт доступ только на чтение (см. schema.sql -> Row Level Security).
window.AI_DIGEST_CONFIG = {
  SUPABASE_URL: "https://xxxxx.supabase.co",
  SUPABASE_ANON_KEY: "PASTE_YOUR_ANON_PUBLIC_KEY_HERE",
};
