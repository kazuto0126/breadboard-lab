import { describe, expect, it } from 'vitest';
import { findLibraryItem, formatResistance, librarySections, searchLibrary } from '../../src/editor/library';

describe('component library sections', () => {
  const sections = librarySections();

  it('groups every part into five sections', () => {
    expect(sections.map((s) => [s.id, s.items.length])).toEqual([
      ['ic', 20],
      ['resistor', 8],
      ['led', 4],
      ['power', 3],
      ['input', 3],
    ]);
    const ics = sections[0].items.map((i) => i.defId);
    expect(ics[0]).toBe('74LS00');
    expect(ics.slice(-3)).toEqual(['74LS245', '74LS273', '74LS283']);
    expect(librarySections()).toBe(sections);
  });

  it('turns presets into props', () => {
    expect(findLibraryItem('resistor-2200')).toMatchObject({ defId: 'resistor', name: '2.2kΩ 電阻', props: { resistance: 2200 } });
    expect(findLibraryItem('led-blue')).toMatchObject({ defId: 'led', props: { color: 'blue' } });
    expect(findLibraryItem('nope')).toBeUndefined();
  });

  it('searches names, ids and descriptions', () => {
    expect(searchLibrary(sections, 'nand').flatMap((s) => s.items.map((i) => i.key))).toEqual(['74LS00']);
    expect(searchLibrary(sections, '計數器').flatMap((s) => s.items.map((i) => i.key))).toContain('74LS93');
    expect(searchLibrary(sections, '  ')).toBe(sections);
    expect(searchLibrary(sections, 'zzzz')).toEqual([]);
  });

  it('formats resistances like a parts list', () => {
    expect([220, 1000, 2200, 4700, 10000, 100000, 1500000].map(formatResistance)).toEqual([
      '220Ω',
      '1kΩ',
      '2.2kΩ',
      '4.7kΩ',
      '10kΩ',
      '100kΩ',
      '1.5MΩ',
    ]);
  });
});
