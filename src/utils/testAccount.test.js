import { describe, it, expect } from 'vitest';
import { isTestRecord, excludeTest } from './testAccount';

describe('isTestRecord', () => {
  it('test:true her zaman test', () => {
    expect(isTestRecord({ test: true, garsonAd: 'Samet' })).toBe(true);
  });

  it('gerçek garson + Syntrix kasiyer tahsilatı GERÇEK satıştır (ciro dışı kalmamalı)', () => {
    expect(isTestRecord({ test: false, garsonAd: 'Samet Bağlan', kasiyerAd: 'Syntrix Kasiyer' })).toBe(false);
    // test alanı yoksa da kasiyer adı yüzünden test sayılmamalı
    expect(isTestRecord({ garsonAd: 'Samet Bağlan', kasiyerAd: 'Syntrix Kasiyer' })).toBe(false);
  });

  it('test alanı yoksa garson adı Syntrix ise test', () => {
    expect(isTestRecord({ garsonAd: 'Syntrix Garson' })).toBe(true);
  });

  it('açıkça test:false damgalı kayıt (geri alınmış) adı Syntrix olsa da GERÇEK', () => {
    expect(isTestRecord({ test: false, garsonAd: 'Syntrix Kasiyer' })).toBe(false);
  });

  it('excludeTest sadece testleri eler', () => {
    const list = [
      { id: 1, test: true },
      { id: 2, test: false, garsonAd: 'Syntrix Kasiyer' },
      { id: 3, garsonAd: 'Ahmet', kasiyerAd: 'Syntrix Kasiyer' },
      { id: 4, garsonAd: 'Syntrix Garson' },
    ];
    expect(excludeTest(list).map((r) => r.id)).toEqual([2, 3]);
  });
});
