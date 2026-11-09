import { memo } from 'react'
import Svg, { Circle, Rect } from 'react-native-svg'
import { scaleSizeW } from '@/utils/pixelRatio'

/**
 * 自绘的网易云风格简易图标：红色圆环 + 中央竖线（神似网易云 logo 的极简记忆点）。
 * 独立于 IcoMoon 字体图标，用 react-native-svg 画，避免往字体里塞字形。
 * 参数对齐 common/Icon：size 会做屏幕缩放，color 默认网易云红。
 */
interface NeteaseIconProps {
  size?: number
  rawSize?: number
  color?: string
}

const NETEASE_RED = '#D43C33'

export const NeteaseIcon = memo(({ size = 24, rawSize, color = NETEASE_RED }: NeteaseIconProps) => {
  const s = rawSize ?? scaleSizeW(size)
  // 圆环线宽取尺寸的 ~13%，和官方 logo 的粗细观感一致
  const strokeWidth = Math.max(2, s * 0.13)
  const radius = s * 0.5 - strokeWidth / 2
  // 中央竖线：宽度同圆环线宽，上下各留出圆环内侧一点空隙
  const barW = strokeWidth
  const barH = radius * 2 - strokeWidth * 0.6
  const barX = s / 2 - barW / 2
  const barY = s / 2 - barH / 2
  return (
    <Svg width={s} height={s} viewBox={`0 0 ${s} ${s}`}>
      <Circle cx={s / 2} cy={s / 2} r={radius} stroke={color} strokeWidth={strokeWidth} fill="none" />
      <Rect x={barX} y={barY} width={barW} height={barH} rx={barW / 2} fill={color} />
    </Svg>
  )
})
