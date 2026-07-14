import { Slot } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { createContext, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import Login from '../components/Login';
import { showFeedback } from '../components/toastHelper';
import { initLocalDatabase } from '../database/db';

// Create a Context to share authentication actions across screens
export const AuthContext = createContext<{
  signOut: () => Promise<void>;
  signIn: () => void;
} | null>(null);

export default function RootLayout() {
  const [isDbReady, setIsDbReady] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);

  const checkToken = async () => {
    try {
      const token = await SecureStore.getItemAsync('user_token');
      if (token) {
        setIsLoggedIn(true);
      } else {
        setIsLoggedIn(false);
      }
    } catch (error) {
      console.error('Error checking auth token:', error);
    } finally {
      setCheckingAuth(false);
    }
  };

  useEffect(() => {
    initLocalDatabase();
    setIsDbReady(true);
    checkToken();
  }, []);

  const signOut = async () => {
    await SecureStore.deleteItemAsync('user_token');
    setIsLoggedIn(false);
    showFeedback('Logged Out', 'You have been logged out successfully.');

  };

  const signIn = () => {
    setIsLoggedIn(true);
  };

  if (!isDbReady || checkingAuth) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#2b6cb0" />
        <Text style={styles.text}>Booting POS...</Text>
      </View>
    );
  }

  return (
    <AuthContext.Provider value={{ signOut, signIn }}>
      {!isLoggedIn ? (
        <Login onLoginSuccess={signIn} />
      ) : (
        <Slot />
      )}
    </AuthContext.Provider>
  );
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