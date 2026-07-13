import { Slot } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { initLocalDatabase } from '../database/db'; // Import our new database helper

export default function RootLayout() {
  const [isDbReady, setIsDbReady] = useState(false);

  useEffect(() => {
    // Initialize SQLite tables synchronously on boot
    initLocalDatabase();
    setIsDbReady(true);
  }, []);

  if (!isDbReady) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#0000ff" />
        <Text style={styles.text}>Booting POS Database...</Text>
      </View>
    );
  }

  // <Slot /> acts as a placeholder that renders the active screen (which is app/index.tsx)
  return <Slot />;
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  text: {
    marginTop: 10,
    fontSize: 16,
    color: '#333',
  },
});