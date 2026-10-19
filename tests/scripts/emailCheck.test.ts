import { describe, expect, it } from 'vitest';
import { authorEmails, findEmails } from '../../scripts/email-check';

/** 子專案 33（規格 2026-10-19 mcp-other-tools 第 5 節）：發布前檢查打包檔與說明頁裡沒有作者的 Email。 */
describe('finding author emails before publishing', () => {
  it('finds them regardless of case, once each', () => {
    expect(findEmails('a Foo@Example.com b foo@example.com', ['foo@example.com'])).toEqual(['foo@example.com']);
  });

  it('finds nothing when they are absent or the list is empty', () => {
    expect(findEmails('nothing here', ['foo@example.com'])).toEqual([]);
    expect(findEmails('foo@example.com', [])).toEqual([]);
  });

  it('reads the author emails of this repository', () => {
    const emails = authorEmails();
    expect(emails.length).toBeGreaterThan(0);
    for (const e of emails) expect(e).toMatch(/^\S+@\S+$/);
    expect(new Set(emails).size).toBe(emails.length);
  });
});
