package cn.toside.music.mobile.cookie;

import android.webkit.CookieManager;

import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;

/**
 * 读取 WebView 的 cookie。
 *
 * 为什么自己写：第三方包 @react-native-cookies/cookies 6.2.1 的 Android 实现里
 * getAll() 直接 reject(GET_ALL_NOT_SUPPORTED)，且其 build.gradle 没有 namespace，
 * 在 AGP 8 下无法编译。
 *
 * 这里直接返回 CookieManager.getCookie(url) 的原始字符串，
 * 它已经是 "name=value; name2=value2" 的 cookie header 格式，包含 httpOnly 项
 * （MUSIC_U 就是 httpOnly），JS 侧无需再解析。
 */
public class CookieReaderModule extends ReactContextBaseJavaModule {
  public static final String NAME = "LxCookieReader";

  public CookieReaderModule(ReactApplicationContext context) {
    super(context);
  }

  @Override
  public String getName() {
    return NAME;
  }

  /**
   * 取指定 url 可见的全部 cookie，返回原始 cookie header 字符串。
   * 无 cookie 时返回空字符串，不 reject —— 登录过程中轮询需要这个行为。
   */
  @ReactMethod
  public void getCookie(String url, Promise promise) {
    try {
      String cookie = CookieManager.getInstance().getCookie(url);
      promise.resolve(cookie == null ? "" : cookie);
    } catch (Exception e) {
      promise.reject("E_COOKIE_READ", e);
    }
  }

  /** 把内存中的 cookie 落盘，App 被系统杀掉后登录态不丢 */
  @ReactMethod
  public void flush(Promise promise) {
    try {
      CookieManager.getInstance().flush();
      promise.resolve(true);
    } catch (Exception e) {
      promise.reject("E_COOKIE_FLUSH", e);
    }
  }

  /** 退出登录时清空 WebView 的 cookie，否则下次打开登录页还是登录态 */
  @ReactMethod
  public void clearAll(Promise promise) {
    try {
      CookieManager.getInstance().removeAllCookies(null);
      CookieManager.getInstance().flush();
      promise.resolve(true);
    } catch (Exception e) {
      promise.reject("E_COOKIE_CLEAR", e);
    }
  }
}
