import { describe, expect, it } from 'vitest';
import { serializeCircuitFile } from '../../src/editor/fileFormat';
import { linkBase, LONG_LINK, makeShareLink, readShareHash, SITE_URL } from '../../src/editor/shareLink';
import { majorityDiagram } from '../../src/logic/examples';
import { circuit, comp } from '../fixtures/build';

/** 子專案 43（規格 2026-10-24 share-link）：電路壓縮後放在網址 # 後面。 */
const text = serializeCircuitFile(circuit([comp('U1', '74LS00', 'F10'), comp('R1', 'resistor', 'A3')]), '測試電路', new Date('2026-10-24T00:00:00Z'), majorityDiagram());

describe('share links', () => {
  it('round-trips the circuit file through the link', async () => {
    const link = await makeShareLink(SITE_URL, text);
    expect(link.startsWith(`${SITE_URL}#c=`)).toBe(true);
    expect(link).toMatch(/^[^#]+#c=[A-Za-z0-9_-]+$/);
    // 壓縮過：比原本的 JSON 短。
    expect(link.length).toBeLessThan(text.length);
    const r = await readShareHash(new URL(link).hash);
    expect(r).toEqual({ kind: 'circuit', text });
  });

  it('ignores other hashes and explains broken data', async () => {
    expect(await readShareHash('')).toEqual({ kind: 'none' });
    expect(await readShareHash('#help')).toEqual({ kind: 'none' });
    expect(await readShareHash('#c=')).toMatchObject({ kind: 'error' });
    expect(await readShareHash('#c=@@@')).toMatchObject({ kind: 'error' });
    expect(await readShareHash('#c=AAAA')).toMatchObject({ kind: 'error', reason: expect.stringContaining('讀不出來') });
  });

  it('starts the link from the page address, or the public site when opened from a file', () => {
    expect(linkBase('https://kazuto0126.github.io/breadboard-lab-site/?x=1#c=abc')).toBe('https://kazuto0126.github.io/breadboard-lab-site/?x=1');
    expect(linkBase('http://localhost:5173/')).toBe('http://localhost:5173/');
    expect(linkBase('file:///D:/breadboard-lab.html')).toBe(SITE_URL);
    expect(LONG_LINK).toBe(8000);
  });
});
