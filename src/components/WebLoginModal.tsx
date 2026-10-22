import { forwardRef, useImperativeHandle, useRef, useCallback, useEffect, useState } from 'react'
import { View, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native'
import WebView from 'react-native-webview'

import Modal, { type ModalType } from '@/components/common/Modal'
import { Icon } from '@/components/common/Icon'
import Text from '@/components/common/Text'
import { useTheme } from '@/store/theme/hook'
import { useStatusbarHeight } from '@/store/common/hook'
import { useI18n } from '@/lang'
import { loginWy } from '@/core/wy'
import { getWebviewCookie, flushWebviewCookie } from '@/utils/nativeModules/cookieReader'
import { isLoginCookie } from '@/utils/musicSdk/wy/user'

const LOGIN_URL = 'https://music.163.com/m/login'
// 两个 URL 都取一遍：cookie 的 path 不一定是 /，只查一个可能漏掉
const COOKIE_URLS = ['https://music.163.com', LOGIN_URL]
// 每 1.5 秒抓一次 cookie，比监听页面跳转可靠：
// 网易云登录是 SPA，路由变化不一定触发 navigationStateChange
const POLL_INTERVAL = 1500

/**
 * 登录页注入脚本，解决两个 WebView 内的死结：
 * 1. 「同意条款」是 span 不是 checkbox，原生点击不会触发勾选
 * 2. 易盾滑块依赖 body 级 touchmove，页面自身的拦截会让滑块拖不动
 */
const INJECT_BEFORE_LOAD = `
(function() {
  if (window.__lxWyLoginPatch) return true;
  window.__lxWyLoginPatch = true;

  var originalAddEventListener = EventTarget.prototype.addEventListener;
  EventTarget.prototype.addEventListener = function(type, listener, options) {
    var isCapture = options === true || !!(options && options.capture);
    var isBodyTouchMove = type === 'touchmove' && isCapture && (this === document || this === document.body);
    if (isBodyTouchMove && typeof listener === 'function') {
      var wrappedListener = function(event) {
        var yidun = document.querySelector('.yidun');
        if (yidun && !yidun.contains(event.target)) return;
        return listener.call(this, event);
      };
      return originalAddEventListener.call(this, type, wrappedListener, options);
    }
    return originalAddEventListener.call(this, type, listener, options);
  };

  var startX = 0, startY = 0;

  document.addEventListener('touchstart', function(event) {
    if (!event.touches || event.touches.length !== 1) return;
    startX = event.touches[0].clientX;
    startY = event.touches[0].clientY;
  }, true);

  document.addEventListener('touchend', function(event) {
    if (!event.changedTouches || event.changedTouches.length !== 1) return;
    var touch = event.changedTouches[0];
    if (Math.abs(touch.clientX - startX) > 8 || Math.abs(touch.clientY - startY) > 8) return;

    var target = event.target;
    if (!target || !target.closest) return;
    if (target.closest('a[href*="official-terms"]')) return;

    var clickable = target.closest('span,label');
    if (!clickable) return;

    var terms = clickable.parentElement;
    if (!terms || !terms.textContent || terms.textContent.indexOf('同意') === -1 ||
        !terms.querySelector('a[href*="official-terms"]')) return;

    event.preventDefault();
    event.stopPropagation();
    clickable.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
  }, true);

  return true;
})();
`

export interface WebLoginModalType {
  show: () => void
}

const Header = ({ onClose }: { onClose: () => void }) => {
  const theme = useTheme()
  const statusBarHeight = useStatusbarHeight()
  const t = useI18n()

  return (
    <View style={[styles.header, { height: 50 + statusBarHeight, paddingTop: statusBarHeight, backgroundColor: theme['c-content-background'] }]}>
      <TouchableOpacity onPress={onClose} style={styles.backButton}>
        <Icon name="chevron-left" size={20} color={theme['c-font']} />
      </TouchableOpacity>
      <Text size={16}>{t('setting_wy_login_title')}</Text>
      <View style={styles.backButton} />
    </View>
  )
}

export default forwardRef<WebLoginModalType, {}>((_props, ref) => {
  const modalRef = useRef<ModalType>(null)
  const theme = useTheme()
  const t = useI18n()

  const [visible, setVisible] = useState(false)
  const [validating, setValidating] = useState(false)
  // 用 ref 防止轮询闭包读到旧值
  const doneRef = useRef(false)
  const busyRef = useRef(false)

  useImperativeHandle(ref, () => ({
    show() {
      doneRef.current = false
      busyRef.current = false
      setValidating(false)
      setVisible(true)
      modalRef.current?.setVisible(true)
    },
  }))

  const handleClose = useCallback(() => {
    setVisible(false)
    modalRef.current?.setVisible(false)
  }, [])

  /**
   * 从 WebView 的 CookieManager 汇总 cookie（含 httpOnly 的 MUSIC_U）
   * 原生侧返回的已经是 "name=value; name2=value2"，这里只做去重合并
   */
  const collectCookie = useCallback(async() => {
    const map = new Map<string, string>()
    for (const url of COOKIE_URLS) {
      let raw = ''
      try {
        raw = await getWebviewCookie(url)
      } catch {
        continue
      }
      if (!raw) continue
      for (const part of raw.split(';')) {
        const item = part.trim()
        const idx = item.indexOf('=')
        if (idx < 1) continue
        const name = item.slice(0, idx)
        if (map.has(name)) continue
        map.set(name, item.slice(idx + 1))
      }
    }
    return Array.from(map, ([name, value]) => `${name}=${value}`).join('; ')
  }, [])

  useEffect(() => {
    if (!visible) return
    let timer: ReturnType<typeof setInterval>

    const check = async() => {
      if (doneRef.current || busyRef.current) return
      let cookie: string
      try {
        cookie = await collectCookie()
      } catch {
        return
      }
      if (!isLoginCookie(cookie)) return

      busyRef.current = true
      setValidating(true)
      try {
        await loginWy(cookie)
        doneRef.current = true
        // 落盘，避免进程被系统回收后 WebView 里反而丢了登录态
        void flushWebviewCookie()
        handleClose()
      } catch (err: any) {
        // 拿到 MUSIC_U 但接口不认，通常是还没登录完成，下一轮再试
        console.log('[wy] login validate failed:', err.message)
      } finally {
        busyRef.current = false
        setValidating(false)
      }
    }

    timer = setInterval(() => { void check() }, POLL_INTERVAL)
    return () => { clearInterval(timer) }
  }, [visible, handleClose, collectCookie])

  return (
    <Modal ref={modalRef} onHide={() => { setVisible(false) }} statusBarPadding={false} bgHide={false}>
      <View style={[styles.container, { backgroundColor: theme['c-content-background'] }]}>
        <Header onClose={handleClose} />
        {
          visible
            ? (
              <WebView
                source={{ uri: LOGIN_URL }}
                injectedJavaScriptBeforeContentLoaded={INJECT_BEFORE_LOAD}
                userAgent="Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36"
                thirdPartyCookiesEnabled
                sharedCookiesEnabled
                domStorageEnabled
                javaScriptEnabled
                style={styles.webview}
              />
              )
            : null
        }
        {
          validating
            ? (
              <View style={styles.mask}>
                <ActivityIndicator color={theme['c-primary-font']} />
                <Text size={13} style={styles.maskText}>{t('setting_wy_login_validating')}</Text>
              </View>
              )
            : null
        }
      </View>
    </Modal>
  )
})

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: 'column',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
  },
  backButton: {
    padding: 5,
    width: 34,
  },
  webview: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  mask: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  maskText: {
    marginTop: 10,
  },
})
