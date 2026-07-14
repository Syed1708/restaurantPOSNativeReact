import React, { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Dimensions, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { apiClient } from '../api/client';
import { showFeedback } from '../components/toastHelper';
import { getLocalCategories, getLocalProducts, saveMenuToLocalDb } from '../database/db';
import { AuthContext } from './_layout';

interface UserProfile {
  name: string;
  email: string;
  store_id: number;
}

interface CartItem {
  id: number;
  name: string;
  price: number; 
  vat_rate: number;
  quantity: number;
}

export default function HomeScreen() {
  const auth = useContext(AuthContext);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncingMenu, setSyncingMenu] = useState(false);

  // SQLite data states
  const [sqliteCategories, setSqliteCategories] = useState<any[]>([]);
  const [sqliteProducts, setSqliteProducts] = useState<any[]>([]);

  // Selected state for product grid
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);

  // Shopping Cart state
  const [cart, setCart] = useState<CartItem[]>([]);

  // 1. Decoupled menu read helper (No dependency on selectedCategoryId)
  const refreshLocalMenuData = useCallback(() => {
    const localCats = getLocalCategories();
    const localProds = getLocalProducts();
    setSqliteCategories(localCats);
    setSqliteProducts(localProds);
  }, []);

  // 2. Decoupled sync helper
  const handleSyncMenu = useCallback(async () => {
    setSyncingMenu(true);
    try {
      const response = await apiClient.get('/menu');
      saveMenuToLocalDb(response.data);
      refreshLocalMenuData();
      showFeedback('Sync Success', 'Menu downloaded and saved offline!');
    } catch (error) {
      console.error('Sync failed:', error);
      showFeedback('Sync Failed', 'Could not sync menu. Check your connection.');
    } finally {
      setSyncingMenu(false);
    }
  }, [refreshLocalMenuData]);

  // 3. Main Bootstrap useEffect - RUNS EXACTLY ONCE ON MOUNT
// Load profile and automatically sync if database is empty
  useEffect(() => {
    const bootstrapData = async () => {
      try {
        // 1. Fetch user profile
        const response = await apiClient.get('/user');
        setProfile(response.data);

        // 2. Read local SQLite database
        const localCats = getLocalCategories();
        const localProds = getLocalProducts();

        if (localCats.length === 0) {
          console.log('Local database empty. Syncing...');
          await handleSyncMenu(); 
        } else {
          setSqliteCategories(localCats);
          setSqliteProducts(localProds);
          if (localCats.length > 0) {
            setSelectedCategoryId(localCats[0].id);
          }
        }
      } catch (error: any) {
        console.error('Failed to fetch user profile:', error);
        
        // 🚀 AUTO-LOGOUT: If the server says the token is invalid/wiped, clear it and return to Login
        if (error.response && error.response.status === 401) {
          showFeedback('Session Expired', 'Please sign in again.');
          auth?.signOut(); // Clears local SecureStore and returns to login screen
        }
      } finally {
        setLoading(false);
      }
    };

    bootstrapData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Runs exactly once on mount

  // ==========================================
  // 🛒 Cart Logic
  // ==========================================

  const addToCart = (product: any) => {
    setCart((currentCart) => {
      const existingIndex = currentCart.findIndex((item) => item.id === product.id);
      if (existingIndex > -1) {
        const newCart = [...currentCart];
        newCart[existingIndex].quantity += 1;
        return newCart;
      }
      return [...currentCart, {
        id: product.id,
        name: product.name,
        price: product.price,
        vat_rate: product.vat_rate,
        quantity: 1
      }];
    });
  };

  const removeFromCart = (productId: number) => {
    setCart((currentCart) => {
      const existingIndex = currentCart.findIndex((item) => item.id === productId);
      if (existingIndex > -1) {
        const newCart = [...currentCart];
        if (newCart[existingIndex].quantity > 1) {
          newCart[existingIndex].quantity -= 1;
          return newCart;
        } else {
          return newCart.filter((item) => item.id !== productId);
        }
      }
      return currentCart;
    });
  };

  const clearCart = () => {
    setCart([]);
  };

  const totals = useMemo(() => {
    let subtotalExclVat = 0; 
    let vatAmount = 0;        
    let totalInclVat = 0;     

    cart.forEach((item) => {
      const itemTotalTtc = item.price * item.quantity;
      const itemSubtotalHt = itemTotalTtc / (1 + item.vat_rate / 100);
      const itemVat = itemTotalTtc - itemSubtotalHt;

      subtotalExclVat += itemSubtotalHt;
      vatAmount += itemVat;
      totalInclVat += itemTotalTtc;
    });

    return {
      subtotalExclVat,
      vatAmount,
      totalInclVat,
    };
  }, [cart]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#2b6cb0" />
        <Text>Loading Cashier Terminal...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.mainContainer}>
      {/* 1. Header Row */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>🍔 Burger Palace</Text>
        {profile && (
          <View style={styles.headerProfile}>
            <Text style={styles.cashierText}>👤 {profile.name.split(' ')[0]}</Text>
            <TouchableOpacity style={styles.syncIconButton} onPress={handleSyncMenu} disabled={syncingMenu}>
              {syncingMenu ? <ActivityIndicator size="small" color="#3182ce" /> : <Text style={styles.syncBtnLabel}>🔄 Sync</Text>}
            </TouchableOpacity>
            <TouchableOpacity onPress={() => auth?.signOut()} style={styles.logoutButton}>
              <Text style={styles.logoutText}>Sign Out</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* 2. Split Screen Workspace */}
      <View style={styles.workspace}>
        
        {/* Left Column: Cart */}
        <View style={styles.cartColumn}>
          <Text style={styles.sectionHeader}>🛒 Current Ticket</Text>
          
          {cart.length === 0 ? (
            <View style={styles.emptyCartBox}>
              <Text style={styles.emptyCartText}>Ticket is empty. Tap items on the right to build order.</Text>
            </View>
          ) : (
            <ScrollView style={styles.cartItemsScroll}>
              {cart.map((item) => (
                <View key={item.id} style={styles.cartItemRow}>
                  <View style={styles.cartItemInfo}>
                    <Text style={styles.cartItemName}>{item.name}</Text>
                    <Text style={styles.cartItemDetails}>
                      {item.price.toFixed(2)} € (TVA {item.vat_rate}%)
                    </Text>
                  </View>
                  <View style={styles.cartItemActions}>
                    <TouchableOpacity style={styles.qtyButton} onPress={() => removeFromCart(item.id)}>
                      <Text style={styles.qtyButtonText}>-</Text>
                    </TouchableOpacity>
                    <Text style={styles.cartItemQty}>{item.quantity}</Text>
                    <TouchableOpacity style={styles.qtyButton} onPress={() => addToCart(item)}>
                      <Text style={styles.qtyButtonText}>+</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </ScrollView>
          )}

          {/* Totals Box */}
          <View style={styles.totalsBox}>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Subtotal (HT):</Text>
              <Text style={styles.totalVal}>{totals.subtotalExclVat.toFixed(2)} €</Text>
            </View>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>TVA (Tax):</Text>
              <Text style={styles.totalVal}>{totals.vatAmount.toFixed(2)} €</Text>
            </View>
            <View style={[styles.totalRow, styles.totalRowMain]}>
              <Text style={styles.totalLabelMain}>Total (TTC):</Text>
              <Text style={styles.totalValMain}>{totals.totalInclVat.toFixed(2)} €</Text>
            </View>

            <View style={styles.actionButtonsRow}>
              <TouchableOpacity style={styles.clearBtn} onPress={clearCart} disabled={cart.length === 0}>
                <Text style={styles.clearBtnText}>Clear</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.payBtn, cart.length === 0 && styles.disabledBtn]} 
                onPress={() => showFeedback('Order Processing', 'Proceeding to checkout...')}
                disabled={cart.length === 0}
              >
                <Text style={styles.payBtnText}>Pay Order</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* Right Column: Grid of Products */}
        <View style={styles.gridColumn}>
          
          {/* Categories Tab Bar */}
          <View style={styles.categoriesTabBar}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {sqliteCategories.map((category) => (
                <TouchableOpacity
                  key={category.id}
                  style={[
                    styles.categoryTab,
                    selectedCategoryId === category.id && styles.categoryTabActive,
                  ]}
                  onPress={() => setSelectedCategoryId(category.id)}
                >
                  <Text
                    style={[
                      styles.categoryTabText,
                      selectedCategoryId === category.id && styles.categoryTabTextActive,
                    ]}
                  >
                    {category.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          {/* Grid of Products */}
          <ScrollView contentContainerStyle={styles.productGrid}>
            {sqliteProducts
              .filter((product) => product.category_id === selectedCategoryId)
              .map((product) => (
                <TouchableOpacity
                  key={product.id}
                  style={styles.productCard}
                  onPress={() => addToCart(product)}
                >
                  <Text style={styles.productCardName}>{product.name}</Text>
                  <Text style={styles.productCardPrice}>{product.price.toFixed(2)} €</Text>
                </TouchableOpacity>
              ))}
          </ScrollView>
        </View>

      </View>
    </SafeAreaView>
  );
}

const { width } = Dimensions.get('window');
const isTablet = width > 768;

const styles = StyleSheet.create({
  mainContainer: {
    flex: 1,
    backgroundColor: '#1a202c', // Matches header to make notches seamless
    // paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  header: {
    height: 60,
    backgroundColor: '#1a202c',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 0,
  },
  headerTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  headerProfile: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cashierText: {
    color: '#e2e8f0',
    marginRight: 10,
    fontWeight: '500',
    fontSize: 14,
  },
  syncIconButton: {
    backgroundColor: '#fff',
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 5,
    marginRight: 10,
  },
  syncBtnLabel: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#4a5568',
  },
  logoutButton: {
    paddingVertical: 5,
    paddingHorizontal: 8,
  },
  logoutText: {
    color: '#fc8181',
    fontWeight: 'bold',
    fontSize: 14,
  },
  workspace: {
    flex: 1,
    flexDirection: isTablet ? 'row' : 'column',
    backgroundColor: '#fff', // Base background under header
  },
  
  // Left Column (Cart / Ticket)
  cartColumn: {
    flex: isTablet ? 0.4 : 0.55,
    backgroundColor: '#f7fafc',
    borderRightWidth: isTablet ? 1 : 0,
    borderRightColor: '#e2e8f0',
    borderBottomWidth: isTablet ? 0 : 1,
    borderBottomColor: '#e2e8f0',
    padding: 15,
    justifyContent: 'space-between',
  },
  sectionHeader: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#2d3748',
    marginBottom: 10,
  },
  emptyCartBox: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  emptyCartText: {
    color: '#a0aec0',
    textAlign: 'center',
    lineHeight: 22,
    fontSize: 14,
  },
  cartItemsScroll: {
    flex: 1,
  },
  cartItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 10,
    borderRadius: 6,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#edf2f7',
  },
  cartItemInfo: {
    flex: 0.65,
  },
  cartItemName: {
    fontWeight: 'bold',
    fontSize: 14,
    color: '#2d3748',
  },
  cartItemDetails: {
    fontSize: 11,
    color: '#718096',
    marginTop: 3,
  },
  cartItemActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    flex: 0.35,
  },
  qtyButton: {
    backgroundColor: '#edf2f7',
    width: 28,
    height: 28,
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  qtyButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#4a5568',
  },
  cartItemQty: {
    fontSize: 14,
    fontWeight: 'bold',
    marginHorizontal: 10,
    color: '#2d3748',
  },
  totalsBox: {
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    paddingTop: 10,
    backgroundColor: '#f7fafc',
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  totalRowMain: {
    borderTopWidth: 1,
    borderTopColor: '#cbd5e0',
    marginTop: 6,
    paddingTop: 8,
  },
  totalLabel: {
    color: '#718096',
    fontSize: 13,
  },
  totalVal: {
    fontWeight: '600',
    fontSize: 13,
    color: '#4a5568',
  },
  totalLabelMain: {
    fontWeight: 'bold',
    fontSize: 16,
    color: '#1a202c',
  },
  totalValMain: {
    fontWeight: 'bold',
    fontSize: 18,
    color: '#2b6cb0',
  },
  actionButtonsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  clearBtn: {
    flex: 0.35,
    backgroundColor: '#e2e8f0',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  clearBtnText: {
    color: '#4a5568',
    fontWeight: 'bold',
    fontSize: 14,
  },
  payBtn: {
    flex: 0.6,
    backgroundColor: '#48bb78',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  payBtnText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 15,
  },
  disabledBtn: {
    backgroundColor: '#cbd5e0',
  },

  // Right Column (Product Grid)
  gridColumn: {
    flex: isTablet ? 0.6 : 0.45,
    backgroundColor: '#fff',
    padding: 15,
  },
  categoriesTabBar: {
    height: 50,
    marginBottom: 10,
  },
  categoryTab: {
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 15,
    backgroundColor: '#f7fafc',
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    alignSelf: 'center',
  },
  categoryTabActive: {
    backgroundColor: '#2b6cb0',
    borderColor: '#2b6cb0',
  },
  categoryTabText: {
    color: '#4a5568',
    fontWeight: 'bold',
    fontSize: 13,
  },
  categoryTabTextActive: {
    color: '#fff',
  },
  productGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
  },
  productCard: {
    width: isTablet ? '31%' : '47%',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    padding: 15,
    marginRight: '2%',
    marginBottom: 10,
    height: 100,
    justifyContent: 'space-between',
    elevation: 1, // Android shadow
    shadowColor: '#000', // iOS shadow
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 1,
  },
  productCardName: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#2d3748',
  },
  productCardPrice: {
    fontSize: 13,
    fontWeight: '600',
    color: '#4a5568',
  },
});