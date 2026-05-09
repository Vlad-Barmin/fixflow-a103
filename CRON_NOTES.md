# Cron Schedule Notes

## /api/cron/overdue
- **Текущее:** `0 9 * * *` (раз в день, 9:00 UTC = 12:00 МСК)
- **Желаемое:** `0 * * * *` (каждый час)
- **Причина текущего:** Vercel Hobby plan лимитирует cron одним запуском в день.
- **TODO:** После апгрейда на Vercel Pro — вернуть `0 * * * *` в vercel.json.
