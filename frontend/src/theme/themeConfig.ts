import { theme, type ThemeConfig } from 'antd';

// "On-chain Bitcoin terminal" — dark, am, accent cam Bitcoin.
// Token-hoa manh de antd khong bi look xanh mac dinh.
const BITCOIN = '#F7931A';

const themeConfig: ThemeConfig = {
  algorithm: theme.darkAlgorithm,
  token: {
    colorPrimary: BITCOIN,
    colorInfo: BITCOIN,
    colorLink: BITCOIN,
    colorBgBase: '#0A0A0B',
    colorBgContainer: 'rgba(22, 20, 24, 0.72)',
    colorBgElevated: '#1B181F',
    colorBorder: '#2C2830',
    colorBorderSecondary: '#231F28',
    colorText: '#F4F1EC',
    colorTextSecondary: '#9E978F',
    borderRadius: 14,
    fontFamily: 'var(--font-sora), system-ui, sans-serif',
    fontFamilyCode: 'var(--font-mono), ui-monospace, monospace',
    fontSize: 15,
    controlHeight: 40,
    wireframe: false,
  },
  components: {
    Button: {
      fontWeight: 600,
      controlHeight: 44,
      primaryShadow: '0 6px 24px rgba(247, 147, 26, 0.32)',
    },
    Card: {
      paddingLG: 22,
      colorBgContainer: 'rgba(22, 20, 24, 0.66)',
    },
    Segmented: {
      itemSelectedBg: BITCOIN,
      itemSelectedColor: '#0A0A0B',
      itemColor: '#9E978F',
      itemHoverColor: '#F4F1EC',
      trackBg: 'rgba(13, 12, 14, 0.6)',
      borderRadius: 12,
      borderRadiusSM: 10,
    },
    Steps: {
      colorPrimary: BITCOIN,
    },
    Input: {
      paddingBlock: 12,
      colorBgContainer: 'rgba(13, 12, 14, 0.55)',
    },
    List: {
      paddingContentVertical: 14,
    },
  },
};

export default themeConfig;
