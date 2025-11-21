/**
 * List of supported languages in B24.Cloud
 *
 * It is worth remembering that there will be 1-2 languages for the B24.Box
 */
export enum B24LangList {
  en = 'en',
  de = 'de',
  la = 'la',

  br = 'br',
  fr = 'fr',
  it = 'it',

  pl = 'pl',
  ru = 'ru',
  ua = 'ua',

  tr = 'tr',
  sc = 'sc',
  tc = 'tc',

  ja = 'ja',
  vn = 'vn',
  id = 'id',

  ms = 'ms',
  th = 'th',
  ar = 'ar'
}

/**
 * @todo add docs
 */
export const B24LocaleMap: Record<B24LangList, string> = {
  [B24LangList.en]: 'en-EN',
  [B24LangList.de]: 'de-DE',
  [B24LangList.la]: 'es-ES',
  [B24LangList.br]: 'pt-BR',
  [B24LangList.fr]: 'fr-FR',
  [B24LangList.it]: 'it-IT',
  [B24LangList.pl]: 'pl-PL',
  [B24LangList.ru]: 'ru-RU',
  [B24LangList.ua]: 'uk-UA',
  [B24LangList.tr]: 'tr-TR',
  [B24LangList.sc]: 'zh-CN',
  [B24LangList.tc]: 'zh-TW',
  [B24LangList.ja]: 'ja-JP',
  [B24LangList.vn]: 'vi-VN',
  [B24LangList.id]: 'id-ID',
  [B24LangList.ms]: 'ms-MY',
  [B24LangList.th]: 'th-TH',
  [B24LangList.ar]: 'ar-SA'
}
