const preview = process.env.CC_MOBILE_VARIANT === 'preview';
const applicationId = 'io.github.nagoor06.commutecircle' + (preview ? '.preview' : '');

module.exports = {
  expo: {
    name: preview ? 'CommuteCircle Preview' : 'CommuteCircle',
    slug: 'commutecircle',
    version: require('./package.json').version,
    platforms: ['android'],
    scheme: applicationId,
    icon: './assets/icon.png',
    android: {
      package: applicationId,
      versionCode: 401,
      allowBackup: false,
      permissions: ['ACCESS_COARSE_LOCATION'],
      blockedPermissions: [
        'android.permission.ACCESS_FINE_LOCATION',
        'android.permission.ACCESS_BACKGROUND_LOCATION',
        'android.permission.RECORD_AUDIO',
        'android.permission.READ_EXTERNAL_STORAGE',
        'android.permission.WRITE_EXTERNAL_STORAGE',
        'android.permission.SYSTEM_ALERT_WINDOW',
      ],
    },
    extra: { preview },
    plugins: [
      '@maplibre/maplibre-react-native',
      'expo-secure-store',
      'expo-web-browser',
      '@react-native-community/datetimepicker',
      './plugins/withSigning',
    ],
  },
};
