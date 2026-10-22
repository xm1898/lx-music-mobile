import { memo, useCallback, useRef, useState } from 'react'
import { View } from 'react-native'

import SubTitle from '../../components/SubTitle'
import Button from '../../components/Button'
import Text from '@/components/common/Text'
import Image from '@/components/common/Image'
import { useTheme } from '@/store/theme/hook'
import { useI18n } from '@/lang'
import { createStyle, toast } from '@/utils/tools'
import { useWyAccount } from '@/store/wy/hook'
import { getDailyRecommendList, logoutWy } from '@/core/wy'
import { addListMusics } from '@/core/list'
import { LIST_IDS } from '@/config/constant'
import WebLoginModal, { type WebLoginModalType } from '@/components/WebLoginModal'

export default memo(() => {
  const t = useI18n()
  const theme = useTheme()
  const account = useWyAccount()
  const modalRef = useRef<WebLoginModalType>(null)
  const [syncing, setSyncing] = useState(false)

  const handleLogin = useCallback(() => {
    modalRef.current?.show()
  }, [])

  const handleLogout = useCallback(() => {
    void logoutWy()
  }, [])

  const handleDailyRec = useCallback(async() => {
    if (syncing) return
    setSyncing(true)
    try {
      const list = await getDailyRecommendList()
      if (!list.length) {
        toast(t('setting_wy_daily_rec_empty'))
        return
      }
      await addListMusics(LIST_IDS.DEFAULT, list, 'top')
      toast(`${t('setting_wy_daily_rec_added')} ${list.length}`)
    } catch (err: any) {
      toast(err.message || t('setting_wy_daily_rec_failed'))
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
  btnRow: {
    flexDirection: 'row',
    marginTop: 10,
    flexWrap: 'wrap',
    rowGap: 8,
  },
})
