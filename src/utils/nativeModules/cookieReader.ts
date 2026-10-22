import { NativeModules } from 'react-native'

// 见 android/app/src/main/java/cn/toside/music/mobile/cookie/CookieReaderModule.java
// 返回的是 CookieManager.getCookie(url) 的原始字符串，含 httpOnly 项（MUSIC_U 就在里面）
const { LxCookieReader } = NativeModules

export const getWebviewCookie = LxCookieReader
  ? LxCookieReader.getCookie as (url: string) => Promise<string>
  : async(_url: string) => ''

export const flushWebviewCookie = LxCookieReader
  ? LxCookieReader.flush as () => Promise<boolean>
  : async() => false

export const clearWebviewCookie = LxCookieReader
  ? LxCookieReader.clearAll as () => Promise<boolean>
  : async() => false
