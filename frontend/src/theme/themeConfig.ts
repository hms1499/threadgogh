import { theme, type ThemeConfig } from 'antd';

// ─── Dark · Starry Night ──────────────────────────────────────
const STAR_GOLD = '#f5d76e';
const NIGHT     = '#0d1427';

// ─── Light · Sunflowers ───────────────────────────────────────
const SUN_GOLD  = '#d99a0a';   // accent darkened for AA on cream
const CREAM     = '#faf3dd';

// Shared shape/typography tokens (theme-independent).
const baseToken: ThemeConfig['token'] = {
  borderRadius:    12,
  borderRadiusSM:  8,
  fontFamily:      'var(--font-sora), system-ui, sans-serif',
  fontFamilyCode:  'var(--font-mono), ui-monospace, monospace',
  fontSize:        15,
  controlHeight:   42,
  wireframe:       false,
};

export const darkTheme: ThemeConfig = {
  algorithm: theme.darkAlgorithm,
  token: {
    ...baseToken,
    colorPrimary:         STAR_GOLD,
    colorInfo:            STAR_GOLD,
    colorLink:            STAR_GOLD,
    colorLinkHover:       '#f7e190',
    colorBgBase:          NIGHT,
    colorBgContainer:     'rgba(13, 26, 62, 0.88)',
    colorBgElevated:      '#152050',
    colorBorder:          'rgba(61, 90, 173, 0.45)',
    colorBorderSecondary: 'rgba(37, 61, 138, 0.35)',
    colorText:            '#e8eaf6',
    colorTextSecondary:   '#9fa8d4',
    colorTextTertiary:    '#8593cf',
    colorTextPlaceholder: '#7886c5',
    colorSuccess:         '#7bc67e',
    colorWarning:         '#e8900a',
    colorError:           '#e57373',
  },
  components: {
    Button: {
      fontWeight:    600,
      controlHeight: 44,
      primaryShadow: '0 0 18px rgba(245, 215, 110, 0.35)',
      colorPrimaryHover: '#f7e190',
      colorPrimaryActive: '#d4b84a',
    },
    Card: {
      paddingLG:        22,
      colorBgContainer: 'rgba(13, 26, 62, 0.88)',
      colorBorderSecondary: 'rgba(61, 90, 173, 0.4)',
    },
    Segmented: {
      itemSelectedBg:    '#253d8a',
      itemSelectedColor: STAR_GOLD,
      itemColor:         '#9fa8d4',
      itemHoverColor:    '#e8eaf6',
      trackBg:           'rgba(10, 18, 40, 0.7)',
      borderRadius:      10,
      borderRadiusSM:    8,
    },
    Steps: {
      colorPrimary:   STAR_GOLD,
      colorText:      '#9fa8d4',
      colorTextLabel: '#9fa8d4',
    },
    Input: {
      paddingBlock:     11,
      colorBgContainer: 'rgba(8, 14, 28, 0.7)',
      colorBorder:      'rgba(61, 90, 173, 0.5)',
      hoverBorderColor: 'rgba(245, 215, 110, 0.5)',
      activeBorderColor: STAR_GOLD,
    },
    Alert: {
      colorInfoBg:     'rgba(37, 61, 138, 0.3)',
      colorInfoBorder: 'rgba(61, 90, 173, 0.5)',
      colorWarningBg:  'rgba(232, 144, 10, 0.15)',
      colorErrorBg:    'rgba(229, 115, 115, 0.15)',
    },
    Statistic: { contentFontSize: 24 },
    Tag: {
      defaultBg:    'rgba(37, 61, 138, 0.3)',
      defaultColor: '#9fa8d4',
    },
  },
};

export const lightTheme: ThemeConfig = {
  algorithm: theme.defaultAlgorithm,
  token: {
    ...baseToken,
    colorPrimary:         SUN_GOLD,
    colorInfo:            SUN_GOLD,
    colorLink:            '#8a5e08',
    colorLinkHover:       '#a8700d',
    colorBgBase:          CREAM,
    colorBgContainer:     'rgba(255, 250, 235, 0.86)',
    colorBgElevated:      '#fffdf5',
    colorBorder:          'rgba(154, 125, 46, 0.35)',
    colorBorderSecondary: 'rgba(154, 125, 46, 0.25)',
    colorText:            '#3a2f1a',
    colorTextSecondary:   '#6b5d3f',
    colorTextTertiary:    '#8a7a52',
    colorTextPlaceholder: '#a8986b',
    colorSuccess:         '#4e9a51',
    colorWarning:         '#c2740a',
    colorError:           '#c0504d',
  },
  components: {
    Button: {
      fontWeight:    600,
      controlHeight: 44,
      primaryShadow: '0 2px 12px rgba(217, 154, 10, 0.3)',
      colorPrimaryHover: '#e8a81e',
      colorPrimaryActive: '#b8860b',
    },
    Card: {
      paddingLG:        22,
      colorBgContainer: 'rgba(255, 250, 235, 0.86)',
      colorBorderSecondary: 'rgba(154, 125, 46, 0.3)',
    },
    Segmented: {
      itemSelectedBg:    '#f0dca0',
      itemSelectedColor: '#7a5e16',
      itemColor:         '#6b5d3f',
      itemHoverColor:    '#3a2f1a',
      trackBg:           'rgba(244, 231, 194, 0.8)',
      borderRadius:      10,
      borderRadiusSM:    8,
    },
    Steps: {
      colorPrimary:   SUN_GOLD,
      colorText:      '#6b5d3f',
      colorTextLabel: '#6b5d3f',
    },
    Input: {
      paddingBlock:     11,
      colorBgContainer: 'rgba(255, 252, 242, 0.9)',
      colorBorder:      'rgba(154, 125, 46, 0.4)',
      hoverBorderColor: 'rgba(217, 154, 10, 0.6)',
      activeBorderColor: SUN_GOLD,
    },
    Alert: {
      colorInfoBg:     'rgba(244, 231, 194, 0.6)',
      colorInfoBorder: 'rgba(154, 125, 46, 0.4)',
      colorWarningBg:  'rgba(194, 116, 10, 0.12)',
      colorErrorBg:    'rgba(192, 80, 77, 0.12)',
    },
    Statistic: { contentFontSize: 24 },
    Tag: {
      defaultBg:    'rgba(244, 231, 194, 0.7)',
      defaultColor: '#6b5d3f',
    },
  },
};
