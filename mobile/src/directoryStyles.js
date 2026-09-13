// @ts-check
import { StyleSheet } from 'react-native';
import { LAYOUT_VALUES } from './constants.js';

export const directoryStyles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' },
  backdrop: { flex: 1 },
  sheet: { maxHeight: '80%', backgroundColor: '#ffffff', borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 16 },
  title: { fontSize: 20, fontWeight: '700', padding: 12, color: '#111827' },
  control: { minHeight: LAYOUT_VALUES.BUTTON_HEIGHT, minWidth: LAYOUT_VALUES.BUTTON_HEIGHT, padding: 12, justifyContent: 'center' },
  sectionLabel: { fontWeight: '700', color: '#111827', fontSize: LAYOUT_VALUES.BODY_FONT_SIZE },
  link: { color: '#2563eb', fontSize: LAYOUT_VALUES.BODY_FONT_SIZE },
  links: { paddingBottom: 24 },
  error: { color: '#b91c1c', padding: 12 }
});
