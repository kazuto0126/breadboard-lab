import { execFileSync } from 'node:child_process';

/**
 * 子專案 33（規格 2026-10-19 mcp-other-tools 第 5 節）：發布到公開網站 repo 前，確認檔案裡沒有作者的 Email。
 * 只比對這個 repo 的 commit 作者 / 提交者 Email 與 git config 的 Email（不用「像 Email 的字串」，免得套件裡的範例字串誤擋）。
 */

/** text 裡出現的 Email（不分大小寫，每個只列一次）。 */
export function findEmails(text: string, emails: string[]): string[] {
  const lower = text.toLowerCase();
  return [...new Set(emails.map((e) => e.toLowerCase()))].filter((e) => e && lower.includes(e));
}

const git = (args: string[]) => {
  try {
    return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    return '';
  }
};

/** 這個 repo 所有 commit 的作者與提交者 Email，加上 git config user.email（去重、去空白）。 */
export function authorEmails(): string[] {
  const all = [...git(['log', '--format=%ae%n%ce']).split('\n'), git(['config', 'user.email'])].map((e) => e.trim().toLowerCase());
  return [...new Set(all.filter((e) => e.includes('@')))];
}
