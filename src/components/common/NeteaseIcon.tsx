import { memo } from 'react'
import Svg, { Circle, Path } from 'react-native-svg'
import { scaleSizeW } from '@/utils/pixelRatio'

/**
 * 自绘的网易云风格图标：红色圆环 + 内嵌音符（一个带符尾的八分音符）。
 * 用 react-native-svg 画，独立于 IcoMoon 字体图标，避免往字体里塞字形。
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
  // 圆环线宽取尺寸的 ~11%，比之前细一点更精致
  const strokeWidth = Math.max(1.6, s * 0.11)
  const radius = s * 0.5 - strokeWidth / 2
  const cx = s / 2
  const cy = s / 2

  // 音符几何（在 viewBox 内以 s 为基准，居中偏右一点让视觉平衡）
  const noteCx = cx + s * 0.06
  const headRy = s * 0.11 // 符头椭圆半径
  const headRx = headRy * 1.25
  const headY = cy + s * 0.16 // 符头中心
  const flagTopY = cy - s * 0.20 // 符杆顶端
  const flagEndX = noteCx + s * 0.14
  const flagEndY = cy - s * 0.02 // 符尾末端

  return (
    <Svg width={s} height={s} viewBox={`0 0 ${s} ${s}`}>
      <Circle cx={cx} cy={cy} r={radius} stroke={color} strokeWidth={strokeWidth} fill="none" />
      {/* 符杆：从符头顶端向上，略向右倾 */}
      <Path
        d={`M ${noteCx - headRx} ${headY} L ${noteCx + headRx * 0.55} ${flagTopY}`}
        stroke={color}
        strokeWidth={strokeWidth * 0.75}
        strokeLinecap="round"
        fill="none"
      />
      {/* 符尾：从符杆顶端向右下弯 */}
      <Path
        d={`M ${noteCx + headRx * 0.55} ${flagTopY} Q ${flagEndX} ${flagTopY + s * 0.08} ${flagEndX} ${flagEndY}`}
        stroke={color}
        strokeWidth={strokeWidth * 0.75}
        strokeLinecap="round"
        fill="none"
      />
      {/* 符头：实心椭圆，向右下略倾 */}
      <Path
        d={`M ${noteCx - headRx} ${headY} a ${headRx} ${headRy} 0 1 0 ${headRx * 2} 0 a ${headRx} ${headRy} 0 1 0 ${-headRx * 2} 0`}
        fill={color}
      />
    </Svg>
  )
})
