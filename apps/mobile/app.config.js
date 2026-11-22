const preview = process.env.CC_MOBILE_VARIANT === 'preview';
const applicationId = 'io.github.nagoor06.commutecircle' + (preview ? '.preview' : '');

module.exports = {
  expo: {
    name: preview ? 'CommuteCircle Preview' : 'CommuteCircle',
    slug: 'commutecircle',
    version: '0.4.0',
    platforms: ['android'],
    scheme: applicationId,
    icon: './assets/icon.png',
    android: {
      package: applicationId,
      versionCode: 400,
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
      'expo-secure-store',
      'expo-web-browser',
      '@react-native-community/datetimepicker',
      './plugins/withSigning',
    ],
  },
};
