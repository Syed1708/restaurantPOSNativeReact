import { useCallback, useContext, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { apiClient } from '../api/client';
import { showFeedback } from '../components/toastHelper';
import { getLocalCategories, getLocalProducts, saveMenuToLocalDb } from '../database/db';
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
  const [syncingMenu, setSyncingMenu] = useState(false);

  // States to hold SQLite data
  const [sqliteCategories, setSqliteCategories] = useState<any[]>([]);
  const [sqliteProducts, setSqliteProducts] = useState<any[]>([]);



  // Reads the SQLite tables and updates the React state
  // Memoize this function so its reference remains identical across renders
  const refreshLocalMenuData = useCallback(() => {
    const localCats = getLocalCategories();
    const localProds = getLocalProducts();
    setSqliteCategories(localCats);
    setSqliteProducts(localProds);
  }, []);

  // Memoize this function so it can safely be used inside useEffect
  const handleSyncMenu = useCallback(async () => {
    setSyncingMenu(true);
    try {
      // 1. Fetch menu JSON from Laragon
      const response = await apiClient.get('/menu');
      
      // 2. Save it directly to SQLite
      saveMenuToLocalDb(response.data);
      
      // 3. Re-read the database to update the UI
      refreshLocalMenuData();
      
      showFeedback('Sync Success', 'Menu downloaded and saved offline!');
    } catch (error) {
      console.error('Sync failed:', error);
      showFeedback('Sync Failed', 'Could not sync menu. Check your connection.');
    } finally {
      setSyncingMenu(false);
    }
  }, [refreshLocalMenuData]); // Depends on refreshLocalMenuData

  // Load profile and automatically sync if database is empty
  useEffect(() => {
    const bootstrapData = async () => {
      try {
        // 1. Fetch user profile
        const response = await apiClient.get('/user');
        setProfile(response.data);
      } catch (error) {
        console.error('Failed to fetch user profile:', error);
      }

      // 2. Read local SQLite database
      const localCats = getLocalCategories();
      const localProds = getLocalProducts();

      if (localCats.length === 0) {
        // 🚀 AUTOMATIC SYNC: If local database is empty, fetch from server immediately
        console.log('Local database is empty. Triggering automatic background sync...');
        await handleSyncMenu(); 
      } else {
        // Otherwise, render the offline data instantly
        setSqliteCategories(localCats);
        setSqliteProducts(localProds);
      }

      setLoading(false);
    };

    bootstrapData();
  },  [handleSyncMenu]); // 🚀 Perfectly safe now! No infinite loops.

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#2b6cb0" />
        <Text>Fetching Cashier Profile...</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>🍔 Burger Palace POS</Text>
      
      {profile && (
        <View style={styles.profileBox}>
          <Text style={styles.value}>Cashier: {profile.name} (Store #{profile.store_id})</Text>
          <TouchableOpacity style={styles.logoutTextButton} onPress={() => auth?.signOut()}>
            <Text style={styles.logoutLink}>Sign Out</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Sync Button */}
      <TouchableOpacity 
        style={styles.syncButton} 
        onPress={handleSyncMenu}
        disabled={syncingMenu}
      >
        {syncingMenu ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.syncText}>🔄 Sync Menu From Server</Text>
        )}
      </TouchableOpacity>

      {/* Offline Menu Status */}
      <Text style={styles.sectionTitle}>📁 Offline SQLite Menu Data</Text>

      {sqliteCategories.length === 0 ? (
        <View style={styles.emptyBox}>
          <Text style={styles.emptyText}>No local menu data found. Please click &quot;Sync Menu&quot; to download.</Text>
        </View>
      ) : (
        sqliteCategories.map((category) => (
          <View key={category.id} style={styles.categoryBox}>
            <Text style={styles.categoryName}>📂 {category.name}</Text>
            
            {sqliteProducts
              .filter((product) => product.category_id === category.id)
              .map((product) => (
                <View key={product.id} style={styles.productRow}>
                  <Text style={styles.productName}>{product.name}</Text>
                  <Text style={styles.productPrice}>{product.price.toFixed(2)} €</Text>
                </View>
              ))}
          </View>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 20,
    backgroundColor: '#fff',
    alignItems: 'center',
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
    textAlign: 'center',
  },
  profileBox: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#edf2f7',
    padding: 15,
    borderRadius: 8,
    width: '100%',
    maxWidth: 600,
    marginBottom: 20,
  },
  value: {
    fontSize: 15,
    fontWeight: '600',
    color: '#2d3748',
  },
  logoutTextButton: {
    padding: 5,
  },
  logoutLink: {
    color: '#e53e3e',
    fontWeight: 'bold',
  },
  syncButton: {
    backgroundColor: '#3182ce',
    paddingVertical: 14,
    paddingHorizontal: 25,
    borderRadius: 8,
    width: '100%',
    maxWidth: 600,
    alignItems: 'center',
    marginBottom: 30,
  },
  syncText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    alignSelf: 'flex-start',
    width: '100%',
    maxWidth: 600,
    marginBottom: 15,
    color: '#4a5568',
  },
  emptyBox: {
    borderWidth: 2,
    borderColor: '#e2e8f0',
    borderStyle: 'dashed',
    padding: 30,
    borderRadius: 8,
    width: '100%',
    maxWidth: 600,
    alignItems: 'center',
  },
  emptyText: {
    color: '#718096',
    textAlign: 'center',
    lineHeight: 20,
  },
  categoryBox: {
    backgroundColor: '#f7fafc',
    borderRadius: 8,
    padding: 15,
    width: '100%',
    maxWidth: 600,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  categoryName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#2b6cb0',
    marginBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#edf2f7',
    paddingBottom: 5,
  },
  productRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f7fafc',
  },
  productName: {
    fontSize: 15,
    color: '#2d3748',
  },
  productPrice: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#4a5568',
  },
});