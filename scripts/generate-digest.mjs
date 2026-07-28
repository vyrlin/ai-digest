// Собирает свежие новости из sources.json, просит Claude собрать из них
// дайджест и публикует результат в таблицу `digests` в Supabase.
//
// Нужные переменные окружения (см. .env.example):
//   ANTHROPIC_API_KEY
//   SUPABASE_URL
//   SUPABASE_SERVICE_KEY   (service_role key — НЕ anon key, у него есть право писать)

import Parser from "rss-parser";
import { readFile } from "node:fs/promises";

const WINDOW_HOURS = Number(process.env.WINDOW_HOURS ?? 26); // небольшой запас на случай, если экшен опоздал
const MAX_ITEMS = Number(process.env.MAX_ITEMS ?? 70); // ограничение, чтобы не перегружать контекст и ответ Claude
const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5";

const ANTHROPIC_API_KEY = requireEnv("ANTHROPIC_API_KEY");
const SUPABASE_URL = requireEnv("SUPABASE_URL");
const SUPABASE_SERVICE_KEY = requireEnv("SUPABASE_SERVICE_KEY");

function requireEnv(name) {
  const v = process.env[name];
  if (!v) {
    console.error(`Отсутствует переменная окружения ${name}`);
    process.exit(1);
  }
  return v;
}

function slugify(str) {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9а-яё]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

async function collectItems(sources) {
  const parser = new Parser({ timeout: 15000 });
  const cutoff = Date.now() - WINDOW_HOURS * 60 * 60 * 1000;
  const items = [];

  for (const source of sources) {
    try {
      const feed = await parser.parseURL(source.url);
      for (const entry of feed.items ?? []) {
        const published = entry.isoDate ? Date.parse(entry.isoDate) : NaN;
        if (!Number.isNaN(published) && published < cutoff) continue;
        items.push({
          source: source.name,
          category: source.category,
          title: entry.title?.trim() ?? "",
          link: entry.link ?? "",
          publishedAt: entry.isoDate ?? null,
          snippet: (entry.contentSnippet ?? "").slice(0, 500),
        });
      }
    } catch (err) {
      console.error(`Не удалось прочитать источник "${source.name}" (${source.url}):`, err.message);
    }
  }
  return items;
}

async function askClaudeForDigest(items, dateStr) {
  const itemsBlock = items
    .map(
      (it, i) =>
        `${i + 1}. [${it.source}] ${it.title}\nСсылка: ${it.link}\nФрагмент: ${it.snippet}`
    )
    .join("\n\n");

  const system = `Ты — редактор ежедневного дайджеста новостей об искусственном интеллекте.
Тебе дают список свежих заголовков и фрагментов из RSS-источников за последние сутки.
Твоя задача — написать связный дайджест на русском языке:
- сгруппируй новости по темам (модели/релизы, исследования, индустрия/бизнес, регулирование и т.д.),
  но только если тем реально несколько — не выдумывай структуру там, где её нет;
- для каждой новости дай 2-4 предложения СВОИМИ словами (не копируй фрагменты дословно) и укажи источник в скобках;
- в конце добавь короткий раздел "Коротко" с 3-5 буллитами самого важного;
- не включай пункты, которые не относятся к ИИ / ML.

Верни ТОЛЬКО валидный JSON без markdown-ограждений, в формате:
{"title": "...", "summary": "1-2 предложения для превью", "body_markdown": "полный текст дайджеста в Markdown, с подзаголовками ## и ссылками [текст](url)"}`;

  const user = `Дата дайджеста: ${dateStr}\n\nНовости:\n\n${itemsBlock}`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 8000,
      system,
      messages: [{ role: "user", content: user }],
    }),
  });

  if (!res.ok) {
    throw new Error(`Anthropic API error ${res.status}: ${await res.text()}`);
  }

  const data = await res.json();
  const text = data.content
    .map((block) => (block.type === "text" ? block.text : ""))
    .join("\n")
    .trim();

  const cleaned = text.replace(/^```json\s*|\s*```$/g, "");
  return JSON.parse(cleaned);
}

async function publishToSupabase(row) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/digests`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      apikey: SUPABASE_SERVICE_KEY,
      authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      prefer: "return=representation",
    },
    body: JSON.stringify(row),
  });

  if (!res.ok) {
    throw new Error(`Supabase insert error ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

async function main() {
  const sources = JSON.parse(await readFile(new URL("../sources.json", import.meta.url)));
  const today = new Date().toISOString().slice(0, 10);

  console.log(`Собираю новости из ${sources.length} источников за последние ${WINDOW_HOURS}ч...`);
  const allItems = await collectItems(sources);
  console.log(`Найдено ${allItems.length} свежих материалов.`);

  if (allItems.length === 0) {
    console.log("Нечего публиковать сегодня — выхожу без ошибки.");
    return;
  }

  // Сортируем по свежести и ограничиваем количество, чтобы не переполнять
  // контекст/ответ модели (иначе JSON на выходе может обрезаться).
  const items = allItems
    .slice()
    .sort((a, b) => (Date.parse(b.publishedAt ?? 0) || 0) - (Date.parse(a.publishedAt ?? 0) || 0))
    .slice(0, MAX_ITEMS);

  if (items.length < allItems.length) {
    console.log(`Ограничиваю до ${items.length} самых свежих материалов (было ${allItems.length}).`);
  }

  console.log("Прошу Claude собрать дайджест...");
  const digest = await askClaudeForDigest(items, today);

  const row = {
    slug: `${today}-${slugify(digest.title)}`,
    date: today,
    title: digest.title,
    summary: digest.summary,
    body_markdown: digest.body_markdown,
    sources: items.map((it) => ({ name: it.source, title: it.title, url: it.link, category: it.category })),
  };

  console.log("Публикую в Supabase...");
  await publishToSupabase(row);
  console.log(`Готово: ${row.title} (${row.slug})`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
