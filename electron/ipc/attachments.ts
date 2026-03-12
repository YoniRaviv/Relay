import { ipcMain, dialog, BrowserWindow } from 'electron';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { Attachment, FileAttachment, ImageAttachment } from '../../shared/types';

const TEXT_EXTENSIONS = new Set(['.txt', '.md']);
const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp']);

const MAX_TEXT_SIZE = 100 * 1024;   // 100KB
const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB
const MAX_ATTACHMENTS = 10;

const IMAGE_MEDIA_TYPES: Record<string, ImageAttachment['mediaType']> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
};

function readAttachment(filePath: string): Attachment {
  const ext = path.extname(filePath).toLowerCase();
  const name = path.basename(filePath);
  const stat = fs.statSync(filePath);

  if (IMAGE_EXTENSIONS.has(ext)) {
    if (stat.size > MAX_IMAGE_SIZE) {
      throw new Error(`Image "${name}" exceeds 5MB limit (${(stat.size / 1024 / 1024).toFixed(1)}MB)`);
    }
    const base64 = fs.readFileSync(filePath).toString('base64');
    return {
      id: randomUUID(),
      name,
      type: 'image',
      path: filePath,
      base64,
      mediaType: IMAGE_MEDIA_TYPES[ext] ?? 'image/png',
      size: stat.size,
    } satisfies ImageAttachment;
  }

  if (TEXT_EXTENSIONS.has(ext)) {
    if (stat.size > MAX_TEXT_SIZE) {
      throw new Error(`Document "${name}" exceeds 100KB limit (${(stat.size / 1024).toFixed(0)}KB)`);
    }
    const content = fs.readFileSync(filePath, 'utf-8');
    return {
      id: randomUUID(),
      name,
      type: 'file',
      path: filePath,
      content,
      size: stat.size,
    } satisfies FileAttachment;
  }

  throw new Error(`Unsupported file type: ${ext}. Supported: ${[...TEXT_EXTENSIONS, ...IMAGE_EXTENSIONS].join(', ')}`);
}

export function registerAttachmentHandlers(): void {
  ipcMain.handle('attachments:pick', async (event, mode?: 'all' | 'images' | 'documents') => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) throw new Error('No active window');

    const filterMap = {
      all: [
        { name: 'All Supported', extensions: ['txt', 'md', 'png', 'jpg', 'jpeg', 'gif', 'webp'] },
        { name: 'Documents', extensions: ['txt', 'md'] },
        { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp'] },
      ],
      images: [
        { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp'] },
      ],
      documents: [
        { name: 'Documents', extensions: ['txt', 'md'] },
      ],
    };

    const result = await dialog.showOpenDialog(win, {
      properties: ['openFile', 'multiSelections'],
      filters: filterMap[mode ?? 'all'],
    });

    if (result.canceled || result.filePaths.length === 0) return [];

    if (result.filePaths.length > MAX_ATTACHMENTS) {
      throw new Error(`Too many files selected. Maximum is ${MAX_ATTACHMENTS}.`);
    }

    return result.filePaths.map(readAttachment);
  });

  ipcMain.handle('attachments:readDropped', async (_event, paths: string[]) => {
    if (!Array.isArray(paths) || paths.length === 0) return [];

    if (paths.length > MAX_ATTACHMENTS) {
      throw new Error(`Too many files dropped. Maximum is ${MAX_ATTACHMENTS}.`);
    }

    const attachments: Attachment[] = [];
    for (const filePath of paths) {
      try {
        attachments.push(readAttachment(filePath));
      } catch {
        // Skip unsupported files silently during drag-and-drop
        continue;
      }
    }
    return attachments;
  });
}
