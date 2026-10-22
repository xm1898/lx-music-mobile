# 网易云账号打通

基于上游 `lyswhut/lx-music-mobile` v1.9.1（fork: `xm1898/lx-music-mobile`）。

**未登录时行为与上游完全一致**：`wy` 平台照旧只提供元数据，播放走自定义源。登录后才启用 cookie 直连。

---

## 一、怎么出包（不用本地环境）

推上去，GitHub Actions 自动构建。

```
Actions → Build APK (self-signed) → Run workflow
```

产物在 **Actions → 对应 run → Artifacts** 里，下 `lx-music-wy-<N>` 解压即得 APK。

**为什么单独写了一个 workflow**：上游 `release.yml` 依赖 `KEYSTORE_*` 系列 Repository secrets，fork 里没有，直接跑必失败。`.github/workflows/build-wy-apk.yml` 用仓库自带的 `android/app/debug.keystore` 给 release 包签名，零 secrets 依赖。

- 只构建 `arm64-v8a`（省 4 倍时间，现在的手机都是这个）
- release 编译失败会自动回退构建 debug 包并一起上传，不至于只有一个红叉
- `package-lock.json` 已同步，CI 里的 `npm ci` 不会因依赖不同步失败

想本地出包：`npm ci && cd android && ./gradlew assembleRelease`。但 `android/keystore.properties` 得自己建（内容见 workflow 里那一步）。

---

## 二、实现了什么

| 能力 | 说明 |
|---|---|
| WebView 登录 | 轮询原生 CookieManager，能拿到 httpOnly 的 `MUSIC_U` |
| 账号信息 | 头像/昵称/UID/VIP，缓存秒开 + 后台校验 |
| VIP 播放地址 | cookie 直连 `/weapi/song/enhance/player/url/v1` |
| 音质 | 128k / 320k / 无损 / Hi-Res |
| 每日推荐 | 自动同步到「网易云每日推荐」专属列表，每天 6:00 后首次启动拉一次；设置页可手动刷新 |
| 红心 | 播放页底部按钮（竖屏 + 横屏都有） |
| 播放打点 | 满 2 分钟或过半才报，日推质量依赖它 |
| 退出登录 | 清 cookie + 清 WebView cookie + 摘掉音质表 |

### 每日推荐的自动同步

- 网易云的日推是**每天 06:00 换批**，不是 00:00。所以日期边界按 `now - 6h` 算，0 点到 6 点之间不会误判成新的一天。
- 同步目标是固定 id 为 `wy_daily_rec` 的列表，名字「网易云每日推荐」。已存在就整体覆盖，不会每天新建一个列表，也不会越滚越长。
- 触发点有三个：启动时（`initWy` 校验 cookie 成功后）、登录成功后、回到前台时（5 分钟节流）。三个入口共用同一个 in-flight promise，不会重复请求。
- 开关是 `common.wyAutoDailyRec`，默认开。关掉后只能手动点「立即刷新」。
- 退出登录只清批次标记，**列表和歌保留**；换账号登录会重新拉并覆盖。

### 入口位置

设置 → 基础设置 → **网易云账号**

### 新增文件

```
src/core/wy.ts                                    账号核心逻辑
src/store/wy/{state,action,hook,index}.ts         状态层（事件驱动）
src/components/WebLoginModal.tsx                  登录 WebView
src/screens/.../Basic/WyAccount.tsx               设置页
src/screens/.../MoreBtn/LikeBtn.tsx               红心按钮（竖/横两份）
src/utils/musicSdk/wy/{user,dailyRec,api-cookie}.js   接口层
src/utils/nativeModules/cookieReader.ts           原生模块 JS 封装
android/.../mobile/cookie/CookieReader{Module,Package}.java   读 WebView cookie
```

### 接线改动

| 文件 | 改了什么 |
|---|---|
| `core/music/utils.ts` | 播放地址分发：wy + 有 cookie → 走 api-cookie |
| `utils/request.js` | 请求 `music.163.com` 时自动补 Cookie header |
| `core/init/index.ts` | 启动时 `initWy()` |
| `core/init/player/playProgress.ts` | 进度回调里打点 |
| `event/stateEvent.ts` | 加 `wyAccountChanged` / `wyLikedListChanged` |
| `config/constant.ts` / `defaultSetting.ts` / `types/app_setting.d.ts` | `common.wyCookie` 设置项 |
| `utils/data.ts` | 账号信息缓存 |
| `wy/index.js` | `getMusicUrl` 加 cookie 分支 |
| `wy/musicDetail.js` | `filterList` 修 privileges 越界 |
| `MainApplication.java` | 注册 `CookieReaderPackage` |
| `proguard-rules.pro` | keep `@ReactMethod` 方法名 |

---

## 三、三个必须知道的坑（都已处理）

### 1. `@react-native-cookies/cookies` 在 Android 上根本不能用

这个包的类型声明里 `getAll()` 标着 **iOS only**，Android 实现是：

```java
public void getAll(Boolean useWebKit, Promise promise) {
    promise.reject(new Exception(GET_ALL_NOT_SUPPORTED));   // 直接拒
}
```

而且它 6.2.1 的 `android/build.gradle` 没有 `namespace`、依赖 `com.facebook.react:react-native:+`、还挂着 jcenter —— AGP 8.6 下必然编译失败。

**所以没引入任何第三方 cookie 包**，自己写了 20 行原生模块，直接返回 `CookieManager.getCookie(url)` 的原始字符串。它本身就是 `name=value; name2=value2` 格式，含 httpOnly 项，JS 侧不用解析。

### 2. `apis('wy')` 一定会抛错

`utils/musicSdk/api-source.js` 里 `apiList` 全被注释掉了：

```js
const apiList = { /* 全是注释 */ }
const getAPI = source => apiList[`${apiSource}_api_${source}`]  // undefined
const apis = source => { ... throw new Error('Api is not found') }
```

LX 的设计是**所有平台都靠用户导入的自定义音源播放**，内置 `wy` 只提供搜索/歌单/榜单/歌词这些元数据。所以 `wy/index.js` 原来的 `getMusicUrl` 从来就没工作过。

登录后必须绕过它，直接调 `api-cookie.js`。已在 `core/music/utils.ts` 两处（正常播放 + 换源）插入分支。

### 3. ProGuard 会砍掉原生模块的方法名

`@ReactMethod` 靠**方法名**反射调用，混淆后 JS 侧报 `getCookie is not a function`。已在 `proguard-rules.pro` 加 keep。

---

## 四、几个设计取舍

**红心只支持 wy 来源的歌曲。** 非 wy 歌曲点红心会提示。跨源红心要先按「歌名+歌手」搜索匹配，匹配错了会往用户歌单里塞错歌——宁可不做。

**音质表要手动注入。** `api-source-info.ts` 是空数组，`qualityList` 初始为 `{}`，`getPlayQuality` 对 wy 永远返回 128k。登录后 `ensureWyQuality()` 注入，并且监听 `apiSourceUpdated` 重新注入（切换自定义源会把整张表覆盖掉）。退出登录时 `removeWyQuality()` 摘掉，否则未登录也会去请求 flac 然后失败。

**打点必须接。** 网易云日推完全依赖 `/weapi/feedback/weblog` 的上报数据，不打点的话日推永远是热门歌单水平。限流阈值：满 2 分钟或播放过半，同一首歌只报一次。

**`getLikedSongList` 用的是 `/weapi/song/like/get`。** 这个接口是老的，如果哪天 404，换成 `/weapi/v1/playlist/detail?id=<我喜欢的音乐歌单id>`（需先 `/weapi/user/playlist` 找 `specialType == 5` 的歌单）。

---

## 五、已知限制

- **只测过语法和 import 解析，没跑过真机**。本机没有 Android SDK，打不了包。编译错误和运行时问题要看 CI 日志 / 手机 logcat。
- `LOGIN_URL` 用的是 `https://music.163.com/m/login`。如果网易云改版，改这个常量即可。
- 网易云接口在参数错误时统一返回 HTTP 200 + 空 body，不存在的路径也一样，所以**没法用 curl 探测接口是否有效**。`getAccountInfo` 做了新旧双路径兜底。
- 账号接口没有做多账号 / 切换账号。

---

## 六、回滚

```bash
git checkout -- .
git clean -fd src/store/wy src/utils/musicSdk/wy/user.js src/utils/musicSdk/wy/dailyRec.js \
  src/utils/musicSdk/wy/api-cookie.js src/utils/nativeModules/cookieReader.ts \
  src/components/WebLoginModal.tsx src/core/wy.ts \
  src/screens/PlayDetail/Vertical/Player/components/MoreBtn/LikeBtn.tsx \
  src/screens/PlayDetail/Horizontal/MoreBtn/LikeBtn.tsx \
  src/screens/Home/Views/Setting/settings/Basic/WyAccount.tsx \
  android/app/src/main/java/cn/toside/music/mobile/cookie
```

`react-native-webview` 可以留着，不影响原逻辑。

---

## 七、关于 git 历史

`github.com` 主域在这台机器上连不通（`api.github.com` 和 `codeload` 正常），`git push` 走不了。
所以这些提交是**通过 GitHub Git Data API 重建后推上去的**，文件内容与本地**逐字节一致**（blob sha 相同），但 commit sha 与本地不同，本地历史与远程是分叉的。

不影响代码，但下次要用命令行 push 之前先对齐一次：

```bash
git fetch origin && git reset --hard origin/master
```

对齐后本地和远程就完全一致了。
