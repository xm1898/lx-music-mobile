import { memo, useCallback, useEffect, useRef, useState } from 'react'
import { View } from 'react-native'

import SubTitle from '../../components/SubTitle'
import Button from '../../components/Button'
import CheckBoxItem from '../../components/CheckBoxItem'
import Text from '@/components/common/Text'
import Image from '@/components/common/Image'
import { useTheme } from '@/store/theme/hook'
import { useSettingValue } from '@/store/setting/hook'
import { useI18n } from '@/lang'
import { createStyle, toast } from '@/utils/tools'
import { updateSetting } from '@/core/common'
import { useWyAccount } from '@/store/wy/hook'
import { getDailyRecSyncStatus, logoutWy, syncDailyRecommend } from '@/core/wy'
import WebLoginModal, { type WebLoginModalType } from '@/components/WebLoginModal'

export default memo(() => {
  const t = useI18n()
  const theme = useTheme()
  const account = useWyAccount()
  const autoDailyRec = useSettingValue('common.wyAutoDailyRec')
  const modalRef = useRef<WebLoginModalType>(null)
  const [syncing, setSyncing] = useState(false)
  const [synced, setSynced] = useState(false)
  const [syncedCount, setSyncedCount] = useState(0)

  const refreshStatus = useCallback(async() => {
    const status = await getDailyRecSyncStatus()
    setSynced(status.synced)
    setSyncedCount(status.count)
  }, [])

  useEffect(() => {
    if (!account) {
      setSynced(false)
      setSyncedCount(0)
      return
    }
    void refreshStatus()
  }, [account, refreshStatus])

  const handleLogin = useCallback(() => {
    modalRef.current?.show()
  }, [])

  const handleLogout = useCallback(() => {
    void logoutWy()
  }, [])

  const handleToggleAuto = useCallback((check: boolean) => {
    updateSetting({ 'common.wyAutoDailyRec': check })
    // 刚打开开关时立刻补一次，否则用户要等到明天才看到效果
    if (check) {
      void syncDailyRecommend().then(count => {
        if (count > 0) void refreshStatus()
      }).catch(() => {})
    }
  }, [refreshStatus])

  const handleDailyRec = useCallback(async() => {
    if (syncing) return
    setSyncing(true)
    try {
      const count = await syncDailyRecommend(true)
      if (count < 0) {
        toast(t('setting_wy_need_login'))
        return
      }
      setSynced(true)
      setSyncedCount(count)
      toast(`${t('setting_wy_daily_rec_added')} ${count}`)
    } catch (err: any) {
      toast(err.message == 'empty' ? t('setting_wy_daily_rec_empty') : (err.message || t('setting_wy_daily_rec_failed')))
    } finally {
      setSyncing(false)
    }
  }, [syncing, t])

  return (
    <SubTitle title={t('setting_wy_account')}>
      <View style={styles.row}>
        {
          account
            ? (
              <>
                <Image url={account.avatarUrl} style={styles.avatar} />
                <View style={styles.info}>
                  <Text size={14} numberOfLines={1}>{account.nickname}</Text>
                  <Text size={12} color={theme['c-500']} numberOfLines={1}>
                    {account.vipType > 0 ? t('setting_wy_vip') : t('setting_wy_no_vip')} · UID {account.uid}
                  </Text>
                </View>
              </>
              )
            : (
              <Text size={13} color={theme['c-500']} style={styles.tip}>{t('setting_wy_login_tip')}</Text>
              )
        }
      </View>
      {
        account
          ? (
            <View style={styles.statusRow}>
              <Text size={12} color={theme['c-500']}>
                {
                  synced
                    ? `${t('setting_wy_daily_rec_synced')} · ${syncedCount}`
                    : t('setting_wy_daily_rec_never')
                }
              </Text>
            </View>
            )
          : null
      }
      <View style={styles.btnRow}>
        {
          account
            ? (
              <>
                <Button onPress={handleDailyRec} disabled={syncing}>{t('setting_wy_daily_rec')}</Button>
                <Button onPress={handleLogout}>{t('setting_wy_logout')}</Button>
              </>
              )
            : <Button onPress={handleLogin}>{t('setting_wy_login')}</Button>
        }
      </View>
      {
        account
          ? (
            <View style={styles.checkRow}>
              <CheckBoxItem
                check={autoDailyRec}
                label={t('setting_wy_auto_daily_rec')}
                onChange={handleToggleAuto}
              />
              <Text size={12} color={theme['c-500']} style={styles.checkTip}>
                {t('setting_wy_auto_daily_rec_tip')}
              </Text>
            </View>
            )
          : null
      }
      <WebLoginModal ref={modalRef} />
    </SubTitle>
  )
})

const styles = createStyle({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 44,
    paddingRight: 20,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 10,
  },
  info: {
    flexGrow: 1,
    flexShrink: 1,
  },
  tip: {
    flexShrink: 1,
    lineHeight: 18,
  },
  statusRow: {
    marginTop: 6,
    paddingLeft: 0,
  },
  btnRow: {
    flexDirection: 'row',
    marginTop: 10,
    flexWrap: 'wrap',
    rowGap: 8,
  },
  checkRow: {
    marginTop: 6,
  },
  checkTip: {
    paddingLeft: 25,
    paddingRight: 20,
    lineHeight: 17,
  },
})
