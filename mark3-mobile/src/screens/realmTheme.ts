import { Platform } from 'react-native';

// 나라의 식별색과 경고색은 유지하고, 공통 화면에는 돌·양피지·황동의 색을 쓴다.
export const realm = {
  background: '#111a19', panel: '#1c2825', inset: '#14201d',
  border: '#5b5843', gold: '#ceb47b', text: '#f0e8d5', muted: '#b0b4a3',
  primary: '#506649', danger: '#88483d',
  serif: Platform.select({ web: 'Georgia, "Noto Serif KR", serif', ios: 'Georgia', default: 'serif' }),
};
