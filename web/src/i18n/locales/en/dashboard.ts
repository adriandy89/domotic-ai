export const dashboard = {
  title: 'Dashboard',
  subtitle: 'Overview of your smart home system',
  live: 'Live',
  cards: {
    totalHomes: 'Total Homes',
    totalHomesSub: '{{online}} online, {{offline}} offline',
    totalDevices: 'Total Devices',
    totalDevicesSub: '{{count}} active recently',
    connectionStatus: 'Connection Status',
    allOnline: 'All Online',
    offlineCount: '{{count}} Offline',
    sseConnected: 'SSE Connected',
    sseDisconnected: 'SSE Disconnected',
  },
  network: {
    title: 'Network Health',
    subtitle: 'Signal quality and connectivity',
    strong: 'Signals Strong',
    allGoodLqi: 'All devices reporting good LQI',
    weakSignal_one: '{{count}} device with potential weak signal',
    weakSignal_other: '{{count}} devices with potential weak signal',
  },
  security: {
    title: 'Security Status',
    allSecure: 'All monitored zones are secure',
    attention: 'Attention required',
    systemSecure: 'System Secure',
    open: 'Open',
    smoke: 'Smoke',
    waterLeak: 'Water Leak',
  },
  climate: {
    title: 'Climate',
    avgTemp: 'Avg. Temperature: {{temp}}°C',
    noData: 'No temperature data',
    noSensors: 'No climate sensors active',
    room: 'Room',
    tempHumidity: 'Temp / Humidity',
  },
  battery: {
    title: 'Low Battery Warnings',
  },
};

export type DashboardNS = typeof dashboard;
