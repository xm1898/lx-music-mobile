import { memo, useCallback, useRef, useState } from 'react'
import { View } from 'react-native'

import SubTitle from '../../components/SubTitle'
import Slider, { type SliderProps } from '../../components/Slider'
import { useI18n } from '@/lang'
import { useSettingValue } from '@/store/setting/hook'
import { useTheme } from '@/store/theme/hook'
import { createStyle } from '@/utils/tools'
import Text from '@/components/common/Text'
import { setDesktopLyricTextPosition } from '@/core/desktopLyric'
import { updateSetting } from '@/core/common'


export default memo(() => {
  const t = useI18n()
  const textPositionX = useSettingValue('desktopLyric.textPosition.x')
  const theme = useTheme()
  const [sliderX, setSliderX] = useState(textPositionX)
  const [isSliding, setSliding] = useState(false)
  const lastApplyTime = useRef(0)

  const applyPosition = useCallback((value: number) => {
    // 节流 60ms，滑动时实时更新桌面歌词位置，但不刷屏
    const now = Date.now()
    if (now - lastApplyTime.current < 60) return
    lastApplyTime.current = now
    void setDesktopLyricTextPosition(value, null)
  }, [])

  const handleSlidingStart = useCallback<NonNullable<SliderProps['onSlidingStart']>>(() => {
    setSliding(true)
  }, [])
  const handleValueChange = useCallback<NonNullable<SliderProps['onValueChange']>>(value => {
    setSliderX(value)
    applyPosition(value)
  }, [applyPosition])
  const handleSlidingComplete = useCallback<NonNullable<SliderProps['onSlidingComplete']>>(value => {
    if (textPositionX != value) {
      lastApplyTime.current = 0 // 确保最后一次立即应用
      void setDesktopLyricTextPosition(value, null).then(() => {
        updateSetting({ 'desktopLyric.textPosition.x': value })
      })
    }
    setSliding(false)
  }, [textPositionX])

  return (
    <SubTitle title={t('setting_lyric_desktop_text_x')}>
      <View style={styles.content}>
        <Text style={{ color: theme['c-primary-font'] }}>{isSliding ? sliderX : textPositionX}</Text>
        <Slider
          minimumValue={0}
          maximumValue={100}
          onSlidingComplete={handleSlidingComplete}
          onValueChange={handleValueChange}
          onSlidingStart={handleSlidingStart}
          step={1}
          value={textPositionX}
        />
      </View>
    </SubTitle>
  )
})

const styles = createStyle({
  content: {
    flexGrow: 0,
    flexShrink: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
  },
})
