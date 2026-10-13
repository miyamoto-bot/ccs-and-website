// note（https://note.com/tek）のRSSを読み、notes.json を作成・更新する。
// 実行: node scripts/update-notes.mjs （Node.js 20 以上）
// 取得に失敗した場合は notes.json を変更せず、終了コード1で終わる。
import { readFile, writeFile } from 'node:fs/promises';

const RSS_URL = 'https://note.com/tek/rss';
const OUT_PATH = new URL('../notes.json', import.meta.url);
const MAX_ITEMS = 10;      // notes.json に保存する件数（サイトには index.html 側で3件表示）
const EXCERPT_LENGTH = 90; // 抜粋の最大文字数

function decodeXml(s) {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function tagText(xml, name) {
  const m = xml.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`));
  return m ? decodeXml(m[1]).trim() : '';
}

function toJstDate(pubDate) {
  const d = new Date(pubDate);
  if (Number.isNaN(d.getTime())) throw new Error(`日付を読めません: ${pubDate}`);
  // en-CA の形式は YYYY-MM-DD になる
  const ymd = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d);
  return ymd.replace(/-/g, '.');
}

function excerpt(html) {
  const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  return text.length > EXCERPT_LENGTH ? text.slice(0, EXCERPT_LENGTH) + '…' : text;
}

const res = await fetch(RSS_URL, { headers: { 'User-Agent': 'ccs-and-notes-updater' } });
if (!res.ok) throw new Error(`RSSの取得に失敗しました: HTTP ${res.status}`);
const xml = await res.text();
if (!xml.includes('<rss')) throw new Error('RSSではない内容が返りました');

const notes = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)]
  .slice(0, MAX_ITEMS)
  .map(([, item]) => ({
    date: toJstDate(tagText(item, 'pubDate')),
    title: tagText(item, 'title'),
    url: tagText(item, 'link'),
    body: excerpt(tagText(item, 'description')),
  }))
  .filter((n) => n.title && n.url.startsWith('https://note.com/'));

if (notes.length === 0) throw new Error('記事が1件も取得できませんでした');

notes.sort((a, b) => b.date.localeCompare(a.date));

// 内容が同じなら書き込まない（毎日の自動コミットを避けるため）
let current = null;
try {
  current = JSON.parse(await readFile(OUT_PATH, 'utf8'));
} catch { /* 初回は存在しない */ }

if (current && JSON.stringify(current.notes) === JSON.stringify(notes)) {
  console.log('変更なし');
} else {
  await writeFile(OUT_PATH, JSON.stringify({ source: RSS_URL, notes }, null, 2) + '\n', 'utf8');
  console.log(`notes.json を更新しました（${notes.length}件）`);
}
