# AI Signal — ежедневный дайджест новостей об ИИ

Простой, полностью «serverless» проект:

- **GitHub Actions** каждое утро запускает скрипт (`scripts/generate-digest.mjs`)
- скрипт читает RSS источники из `sources.json`, берёт свежие за сутки материалы
- отправляет их **Claude API**, которая пишет связный дайджест на русском
- результат сохраняется в **Supabase** (бесплатная управляемая база данных)
- статический сайт (`site/`) читает базу напрямую из браузера и показывает список + статьи

Ничего не нужно администрировать: ни сервера, ни базы «руками» — всё на бесплатных тарифах.

## Шаг 1. Supabase (база данных)

1. Зайди на [supabase.com](https://supabase.com) → зарегистрируйся → New Project (бесплатный тариф достаточен).
2. Когда проект создан: **SQL Editor → New query**, вставь содержимое файла `schema.sql` и нажми Run.
3. Зайди в **Project Settings → API**. Тебе понадобятся:
   - `Project URL` → это `SUPABASE_URL`
   - `anon public` key → это `SUPABASE_ANON_KEY` (пойдёт в сайт, безопасен для браузера)
   - `service_role` key → это `SUPABASE_SERVICE_KEY` (секретный, только для GitHub Actions, даёт право писать)

## Шаг 2. Anthropic API key

1. Зайди на [console.anthropic.com](https://console.anthropic.com) → API Keys → Create Key.
2. Это и есть `ANTHROPIC_API_KEY`. Пополни баланс на пару долларов — ежедневная генерация одного дайджеста стоит центы.

## Шаг 3. Выложи код на GitHub

1. Создай новый **приватный или публичный** репозиторий на GitHub.
2. Загрузи туда содержимое этой папки (`git init`, `git add .`, `git commit`, `git push`, либо просто перетащи файлы через веб-интерфейс GitHub).

## Шаг 4. Настрой секреты для GitHub Actions

В репозитории: **Settings → Secrets and variables → Actions → New repository secret**. Добавь три секрета:

| Имя | Значение |
|---|---|
| `ANTHROPIC_API_KEY` | ключ из шага 2 |
| `SUPABASE_URL` | Project URL из Supabase |
| `SUPABASE_SERVICE_KEY` | service_role key из Supabase |

Workflow уже лежит в `.github/workflows/daily-digest.yml` и запускается каждый день в 05:00 UTC, плюс его можно запустить вручную: вкладка **Actions → Daily AI digest → Run workflow**.

Запусти его вручную один раз, чтобы проверить, что всё работает, и в таблице `digests` в Supabase появилась первая запись (посмотреть можно в **Table Editor**).

## Шаг 5. Опубликуй сайт

Папка `site/` — это просто статичный HTML/CSS/JS, билд не нужен.

1. В `site/config.js` впиши свои `SUPABASE_URL` и `SUPABASE_ANON_KEY` (anon, не service!).
2. Самый простой способ выложить: **GitHub Pages**.
   - Settings → Pages → Source: Deploy from a branch → выбери branch `main` и папку `/site`.
   - Через минуту сайт будет доступен по адресу вида `https://твой-логин.github.io/название-репо/`.
   - (Альтернатива: закинуть папку `site/` на Netlify/Vercel как статический сайт — тоже бесплатно и ещё чуть быстрее в настройке.)

## Проверка / отладка локально

```bash
npm install
node --env-file=.env scripts/generate-digest.mjs   # предварительно скопируй .env.example в .env и заполни
```

Локально можно открыть `site/index.html` прямо в браузере (двойным кликом) — он обращается к Supabase напрямую, бэкенд не нужен.

## Что можно донастроить

- **`sources.json`** — список источников. Я собрал стартовый набор популярных RSS-лент по ИИ (OpenAI, DeepMind, Google AI, arXiv, TechCrunch, VentureBeat, The Verge, MIT Tech Review, Wired, Hugging Face). RSS-адреса у сайтов иногда меняются — если какой-то источник не читается, лог GitHub Action покажет это как предупреждение (не как падение всего скрипта), и его можно поправить или убрать. Свои источники добавляй туда же в формате `{"name": "...", "url": "...", "category": "labs|research|news|tools"}`.
- **Время запуска** — поменяй cron в `.github/workflows/daily-digest.yml` (сейчас 05:00 UTC ≈ 07:00 по Риму/Милану летом, 08:00 зимой).
- **Модель** — по умолчанию `claude-sonnet-5`. Для меньшей стоимости можно передать `ANTHROPIC_MODEL=claude-haiku-4-5-20251001` как ещё один секрет/переменную окружения в workflow.
- **Окно свежести новостей** — `WINDOW_HOURS` (по умолчанию 26 часов, с запасом на случай, если экшен запустился с опозданием).

## Структура проекта

```
ai-digest/
├── sources.json                  # список RSS-источников
├── schema.sql                    # SQL для создания таблицы в Supabase
├── package.json
├── .env.example
├── scripts/
│   └── generate-digest.mjs       # сбор новостей → Claude → запись в Supabase
├── .github/workflows/
│   └── daily-digest.yml          # ежедневный запуск
└── site/
    ├── config.js                 # публичные ключи Supabase (заполнить)
    ├── index.html                # список дайджестов
    ├── digest.html               # страница одного дайджеста
    └── style.css
```
