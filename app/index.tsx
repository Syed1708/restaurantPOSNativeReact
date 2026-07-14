import { useContext, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { apiClient } from '../api/client';
import { AuthContext } from './_layout';

interface UserProfile {
  name: string;
  email: string;
  store_id: number;
}

export default function HomeScreen() {
  const auth = useContext(AuthContext);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        // Fetch the logged-in user details from Laravel
        const response = await apiClient.get('/user');
        setProfile(response.data);
      } catch (error) {
        console.error('Failed to fetch user profile:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();
  }, []);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#2b6cb0" />
        <Text>Fetching Cashier Profile...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>🍔 Burger Palace POS</Text>
      
      {profile ? (
        <View style={styles.profileBox}>
          <Text style={styles.label}>Active Cashier:</Text>
          <Text style={styles.value}>{profile.name}</Text>
          <Text style={styles.email}>{profile.email}</Text>
          <Text style={styles.store}>Store ID: {profile.store_id}</Text>
        </View>
      ) : (
        <Text>Could not load profile.</Text>
      )}

      <TouchableOpacity 
        style={styles.logoutButton} 
        onPress={() => auth?.signOut()}
      >
        <Text style={styles.logoutText}>Log Out</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 26,
    fontWeight: 'bold',
    marginBottom: 20,
  },
  profileBox: {
    backgroundColor: '#f7fafc',
    padding: 20,
    borderRadius: 8,
    width: '100%',
    maxWidth: 400,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    alignItems: 'center',
    marginBottom: 30,
  },
  label: {
    fontSize: 14,
    color: '#718096',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 5,
  },
  value: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#2d3748',
  },
  email: {
    fontSize: 16,
    color: '#4a5568',
    marginTop: 5,
  },
  store: {
    fontSize: 14,
    color: '#718096',
    marginTop: 10,
    fontStyle: 'italic',
  },
  logoutButton: {
    backgroundColor: '#e53e3e',
    paddingVertical: 12,
    paddingHorizontal: 30,
    borderRadius: 8,
  },
  logoutText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});