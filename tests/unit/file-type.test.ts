import { describe, expect, it } from 'vitest';
import { extensionOf, fileKind, type FileKind } from '@/lib/file-type';

describe('extensionOf', () => {
  it('uses the last dot, lower-cased', () => {
    expect(extensionOf('Report.FINAL.v2.XLSX')).toBe('xlsx');
    expect(extensionOf('archive.tar.gz')).toBe('gz');
  });
  it('has no extension for plain, dotfile or trailing-dot names', () => {
    expect(extensionOf('README')).toBe('');
    expect(extensionOf('.gitignore')).toBe('');
    expect(extensionOf('weird.')).toBe('');
    expect(extensionOf(null)).toBe('');
  });
});

describe('fileKind', () => {
  const cases: [string, string | null, FileKind][] = [
    ['a.pdf', null, 'pdf'],
    ['a.DOC', null, 'doc'],
    ['a.docx', null, 'doc'],
    ['a.xls', null, 'sheet'],
    ['a.XLSX', null, 'sheet'],
    ['a.csv', null, 'sheet'],
    ['a.ppt', null, 'slide'],
    ['a.pptx', null, 'slide'],
    ['a.png', null, 'image'],
    ['a.jpg', null, 'image'],
    ['a.JPEG', null, 'image'],
    ['a.gif', null, 'image'],
    ['a.svg', null, 'image'],
    ['a.webp', null, 'image'],
    ['a.txt', null, 'text'],
    ['a.md', null, 'text'],
    ['a.zip', null, 'archive'],
    ['a.rar', null, 'archive'],
    ['a.7z', null, 'archive'],
    ['a.mp3', null, 'audio'],
    ['a.wav', null, 'audio'],
    ['a.mp4', null, 'video'],
    ['a.mov', null, 'video'],
    ['a.avi', null, 'video'],
    ['a.json', null, 'code'],
    ['a.xml', null, 'code'],
    ['a.yaml', null, 'code'],
    ['a.yml', null, 'code'],
    ['a.unknownext', null, 'generic'],
    ['noext', null, 'generic'],
    ['a.b.c.d.pdf', null, 'pdf'],
  ];
  it.each(cases)('%s -> %s', (name, ct, kind) => {
    expect(fileKind(ct, name)).toBe(kind);
  });

  it('falls back to the MIME type when the name has no usable extension', () => {
    expect(fileKind('application/pdf', 'download')).toBe('pdf');
    expect(
      fileKind('application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'x'),
    ).toBe('doc');
    expect(fileKind('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'x')).toBe(
      'sheet',
    );
    expect(
      fileKind('application/vnd.openxmlformats-officedocument.presentationml.presentation', 'x'),
    ).toBe('slide');
    expect(fileKind('audio/mpeg', 'x')).toBe('audio');
    expect(fileKind('video/quicktime', 'x')).toBe('video');
    expect(fileKind('application/json; charset=utf-8', 'x')).toBe('code');
    expect(fileKind('application/octet-stream', 'x')).toBe('generic');
    expect(fileKind(null, null)).toBe('generic');
  });

  it('gives the same answer wherever it is asked, regardless of MIME quirks', () => {
    // A CSV served as an Excel type or as text must look the same.
    expect(fileKind('text/csv', 'data.csv')).toBe(fileKind('application/vnd.ms-excel', 'data.csv'));
  });
});
