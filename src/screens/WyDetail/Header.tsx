import { memo, useCallback } from 'react'
import { View, TouchableOpacity } from 'react-native'

import { Icon } from '@/components/common/Icon'
import { pop } from '@/navigation'
import StatusBar from '@/components/common/StatusBar'
import { useI18n } from '@/lang'
import { createStyle } from '@/utils/tools'
import Text from '@/components/common/Text'
import { HEADER_HEIGHT as _HEADER_HEIGHT } from '@/config/constant'
import { scaleSizeH, scaleSizeW } from '@/utils/pixelRatio'
import commonState from '@/store/common/state'
import { useStatusbarHeight } from '@/store/common/hook'
import { useTheme } from '@/store/theme/hook'
import Image from '@/components/common/Image'
import Button from '@/components/common/Button'

const HEADER_HEIGHT = scaleSizeH(_HEADER_HEIGHT)
const IMAGE_WIDTH = scaleSizeW(64)

export default memo(({ name, desc, picUrl, onPlay }: {
  name: string
  desc: string
  picUrl?: string
  onPlay: () => void
}) => {
  const t = useI18n()
  const theme = useTheme()
  const statusBarHeight = useStatusbarHeight()

  const handleBack = useCallback(() => {
    void pop(commonState.componentIds.wyDetail!)
  }, [])

  const handlePlay = useCallback(() => {
    onPlay()
  }, [onPlay])

  return (
    <View style={{ ...styles.container, paddingTop: statusBarHeight, borderBottomColor: theme['c-border-background'] }}>
      <StatusBar />
      <View style={styles.navBar}>
        <TouchableOpacity onPress={handleBack} style={{ ...styles.button, width: HEADER_HEIGHT }}>
          <Icon name="chevron-left" size={18} color={theme['c-font']} />
        </TouchableOpacity>
        <Text numberOfLines={1} size={16} style={styles.title}>{name}</Text>
      </View>
      <View style={styles.infoBar}>
        <View style={{ width: IMAGE_WIDTH, height: IMAGE_WIDTH }}>
          <Image url={picUrl} style={{ flex: 1, borderRadius: 4 }} />
        </View>
        <View style={styles.infoMain}>
          <Text numberOfLines={2} size={14} style={styles.name}>{name}</Text>
          {desc ? <Text numberOfLines={1} size={11} color={theme['c-500']} style={styles.desc}>{desc}</Text> : null}
          <Button style={{ ...styles.playBtn, backgroundColor: theme['c-primary-background-hover'] }} onPress={handlePlay}>
            <Icon name="play" size={14} color={theme['c-primary-font']} />
            <Text size={12} color={theme['c-primary-font']} style={{ paddingLeft: 4 }}>{t('play_all')}</Text>
          </Button>
        </View>
      </View>
    </View>
  )
})

const styles = createStyle({
  container: {
    flexDirection: 'column',
    borderBottomWidth: 0.5,
  },
  navBar: {
    flexDirection: 'row',
    alignItems: 'center',
    height: HEADER_HEIGHT,
    paddingRight: 40,
  },
  button: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    flexGrow: 1,
    flexShrink: 1,
  },
  infoBar: {
    flexDirection: 'row',
    padding: 10,
  },
  infoMain: {
    flexGrow: 1,
    flexShrink: 1,
    paddingLeft: 8,
  },
  name: {
    // fontWeight: 'bold',
  },
  desc: {
    paddingTop: 2,
  },
  playBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-start',
    marginTop: 8,
    paddingLeft: 14,
    paddingRight: 14,
    height: 30,
    borderRadius: 15,
  },
})
