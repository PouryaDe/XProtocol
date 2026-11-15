import fs from 'node:fs';
import path from 'node:path';
import { backup } from 'node:sqlite';
import { getDataDir } from '../config.js';
import { getDb, getSetting } from '../db/database.js';

export interface TelegramBackupSettings {
  enabled: boolean;
  botToken: string;
  chatId: string;
  intervalHours: number;
  proxyUrl: string;
  lastSentAt: string | null;
}

export const DEFAULT_TELEGRAM_BACKUP: TelegramBackupSettings = {
  enabled: false,
  botToken: '',
  chatId: '',
  intervalHours: 24,
  proxyUrl: '',
  lastSentAt: null,
};

let tgTimer: NodeJS.Timeout | null = null;

export async function findTelegramChatId(botToken: string): Promise<{ chatId: string; title: string }[]> {
  const res = await fetch(`https://api.telegram.org/bot${botToken}/getUpdates?limit=20`);
  if (!res.ok) throw new Error(`Telegram API returned HTTP ${res.status}`);
  const data = (await res.json()) as {
    ok: boolean;
    result?: Array<{ message?: { chat?: { id: number; title?: string; username?: string; first_name?: string } } }>;
  };
  const seen = new Map<string, string>();
  for (const item of data.result || []) {
    const chat = item.message?.chat;
    if (chat) {
      seen.set(String(chat.id), chat.title || chat.username || chat.first_name || String(chat.id));
    }
  }
  return [...seen.entries()].map(([chatId, title]) => ({ chatId, title }));
}

export async function sendTelegramBackupNow(botToken: string, chatId: string): Promise<void> {
  if (!botToken || !chatId) throw new Error('Bot token and Chat ID are required');
  const tmpFile = path.join(getDataDir(), `tg-backup-${Date.now()}.db`);
  await backup(getDb(), tmpFile);
  try {
    const fileBytes = fs.readFileSync(tmpFile);
    const form = new FormData();
    form.append('chat_id', chatId);
    form.append('caption', `XProtocol Panel Backup — ${new Date().toISOString()}`);
    form.append('document', new Blob([fileBytes]), `xprotocol-backup-${new Date().toISOString().slice(0, 10)}.db`);

    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendDocument`, {
      method: 'POST',
      body: form,
    });
    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`Telegram sendDocument failed (${res.status}): ${txt}`);
    }
  } finally {
    fs.unlink(tmpFile, () => undefined);
  }
}

export function startTelegramBackupScheduler(): void {
  if (tgTimer) return;
  tgTimer = setInterval(async () => {
    const cfg = getSetting('telegram_backup', DEFAULT_TELEGRAM_BACKUP);
    if (!cfg.enabled || !cfg.botToken || !cfg.chatId) return;
    const intervalMs = Math.max(1, cfg.intervalHours || 24) * 3600_000;
    const lastMs = cfg.lastSentAt ? new Date(cfg.lastSentAt).getTime() : 0;
    if (Date.now() - lastMs >= intervalMs) {
      try {
        await sendTelegramBackupNow(cfg.botToken, cfg.chatId);
        getDb()
          .prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
          .run('telegram_backup', JSON.stringify({ ...cfg, lastSentAt: new Date().toISOString() }));
      } catch {
        // Retry on next tick
      }
    }
  }, 60_000);
}
