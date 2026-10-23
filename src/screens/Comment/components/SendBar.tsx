import { memo, useCallback, useState } from 'react'
import { TextInput, TouchableOpacity, View } from 'react-native'

import { Icon } from '@/components/common/Icon'
import { useTheme } from '@/store/theme/hook'
import { useI18n } from '@/lang'
import { createStyle, toast } from '@/utils/tools'
import { BorderWidths } from '@/theme'
import { sendWyComment } from '@/core/wy'

export default memo(({ songId, onSent }: {
  songId: string | number
  onSent: () => void
}) => {
  const theme = useTheme()
  const t = useI18n()
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)

  const handleSend = useCallback(async() => {
    const content = text.trim()
    if (!content || sending) return
    setSending(true)
    try {
      await sendWyComment(songId, content)
      setText('')
      toast(t('wy_comment_send_success'))
      onSent()
    } catch (err: any) {
      console.warn('send wy comment failed', err)
      toast(t('wy_comment_send_failed'))
    } finally {
      setSending(false)
    }
  }, [songId, text, sending, onSent, t])

  const canSend = !!text.trim() && !sending

  return (
    <View style={{ ...styles.container, borderTopColor: theme['c-border-background'] }}>
      <TextInput
        style={{ ...styles.input, color: theme['c-font'], backgroundColor: theme['c-primary-background-hover'] }}
        placeholder={t('wy_comment_placeholder')}
        placeholderTextColor={theme['c-500']}
        value={text}
        onChangeText={setText}
        editable={!sending}
        multiline
        maxLength={140}
        returnKeyType="send"
        onSubmitEditing={handleSend}
      />
      <TouchableOpacity style={styles.sendBtn} onPress={handleSend} disabled={!canSend}>
        <Icon name="comment" size={22} color={canSend ? theme['c-primary-font'] : theme['c-350']} />
      </TouchableOpacity>
    </View>
  )
})

const styles = createStyle({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: 8,
    borderTopWidth: BorderWidths.normal,
  },
  input: {
    flexGrow: 1,
    flexShrink: 1,
    maxHeight: 80,
    minHeight: 38,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
  },
  sendBtn: {
    width: 44,
    height: 38,
    justifyContent: 'center',
    alignItems: 'center',
  },
})
