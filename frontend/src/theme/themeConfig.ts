import { theme, type ThemeConfig } from 'antd';

// Van Gogh · Starry Night — deep midnight blue + star gold accent.
const STAR_GOLD = '#f5d76e';
const NIGHT     = '#0d1427';

const themeConfig: ThemeConfig = {
  algorithm: theme.darkAlgorithm,
  token: {
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
    colorTextTertiary:    '#6b7bbf',
    colorTextPlaceholder: '#5a6aad',
    colorSuccess:         '#7bc67e',
    colorWarning:         '#e8900a',
    colorError:           '#e57373',
    borderRadius:         12,
    borderRadiusSM:       8,
    fontFamily:           'var(--font-sora), system-ui, sans-serif',
    fontFamilyCode:       'var(--font-mono), ui-monospace, monospace',
    fontSize:             15,
    controlHeight:        42,
    wireframe:            false,
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
    List: {
      paddingContentVertical: 12,
      colorSplit:             'rgba(61, 90, 173, 0.2)',
    },
    Alert: {
      colorInfoBg:     'rgba(37, 61, 138, 0.3)',
      colorInfoBorder: 'rgba(61, 90, 173, 0.5)',
      colorWarningBg:  'rgba(232, 144, 10, 0.15)',
      colorErrorBg:    'rgba(229, 115, 115, 0.15)',
    },
    Statistic: {
      contentFontSize: 24,
    },
    Tag: {
      defaultBg:    'rgba(37, 61, 138, 0.3)',
      defaultColor: '#9fa8d4',
    },
  },
};

export default themeConfig;
