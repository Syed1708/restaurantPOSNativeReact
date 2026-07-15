import React, { useCallback, useContext, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Dimensions, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { apiClient } from '../api/client';
import POSHeader from '../components/POSHeader'; // Responsive Header Component
import { showFeedback } from '../components/toastHelper';
import {
  getLocalCategories,
  getLocalOrdersHistory,
  getLocalProducts,
  getUnsyncedOrders,
  markOrdersAsSynced,
  refundOrderLocally,
  saveMenuToLocalDb,
  saveOrderLocally
} from '../database/db';
import { useCart } from '../hooks/useCart'; // Custom Logic Hook
import { AuthContext } from './_layout';

interface UserProfile {
  name: string;
  email: string;
  store_id: number;
}



const generateUUID = (): string => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

export default function HomeScreen() {
  const auth = useContext(AuthContext);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncingMenu, setSyncingMenu] = useState(false);
  const [syncingOrders, setSyncingOrders] = useState(false);

   // SQLite data states
  const [sqliteCategories, setSqliteCategories] = useState<any[]>([]);
  const [sqliteProducts, setSqliteProducts] = useState<any[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);
  

    // App View Mode: 'register' (standard touchscreen) vs 'history' (past sales)
  const [viewMode, setViewMode] = useState<'register' | 'history'>('register');
  const [historyOrders, setHistoryOrders] = useState<any[]>([]);

 // 🚀 Clean Custom Hook for Cart State & Calculations
  const { cart, addToCart, removeFromCart, clearCart, totals } = useCart();

  const refreshLocalMenuData = useCallback(() => {
    const localCats = getLocalCategories();
    const localProds = getLocalProducts();
    setSqliteCategories(localCats);
    setSqliteProducts(localProds);
  }, []);

  const handleSyncMenu = useCallback(async () => {
    setSyncingMenu(true);
    try {
      const response = await apiClient.get('/menu');
      saveMenuToLocalDb(response.data);
      refreshLocalMenuData();
      showFeedback('Sync Success', 'Menu downloaded and saved offline!');
    } catch (error: any) {
      // console.error('Sync failed:', error);
            console.log('Menu sync failed:', error.message);

      showFeedback('Sync Failed', 'Could not sync menu. Check your connection.');
    } finally {
      setSyncingMenu(false);
    }
  }, [refreshLocalMenuData]);

  // Cloud Order Sync
  const handleSyncOrders = useCallback(async (isManual: boolean = false) => {
    const unsynced = getUnsyncedOrders();
    if (unsynced.length === 0) {
      if (isManual) {
        showFeedback('Sync Info', 'All tickets are already up to date!');
      }
      return; 
    }

    if (isManual) {
      setSyncingOrders(true);
    }

    try {
      const response = await apiClient.post('/orders/sync', { orders: unsynced });
      const { synced_uuids } = response.data;

      if (synced_uuids && synced_uuids.length > 0) {
        markOrdersAsSynced(synced_uuids);
        console.log(`Successfully synced ${synced_uuids.length} orders to cloud!`);
        
        if (isManual) {
          showFeedback('Sync Success', `${synced_uuids.length} tickets synchronized!`);
        }

        // Refresh history to update cloud sync checkmarks if looking at history screen
        loadOrdersHistory();
      }
    } catch (error: any) {
      // console.error('Failed to sync orders to server:', error);
      console.log('Silent background order sync failed (network offline):', error.message);

      if (isManual) {
        showFeedback('Sync Failed', 'Could not sync tickets. Check your network.');
      }
    } finally {
      setSyncingOrders(false);
    }
  }, []);

    // Reads the SQLite history table
  const loadOrdersHistory = () => {
    const history = getLocalOrdersHistory();
    setHistoryOrders(history);
  };

  useEffect(() => {
    const bootstrapData = async () => {
      try {
        const response = await apiClient.get('/user');
        setProfile(response.data);
      } catch (error: any) {
        console.error('Failed to fetch user profile:', error);
        if (error.response && error.response.status === 401) {
          showFeedback('Session Expired', 'Please sign in again.');
          auth?.signOut();
        }
      }

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

      await handleSyncOrders();
      loadOrdersHistory(); // Cache history on load
      setLoading(false);
    };

    bootstrapData();

    // Silent Background Auto-Sync Loop (60 seconds)
    const syncInterval = setInterval(() => {
      console.log('Automated background sync interval ticking...');
      handleSyncOrders(false).catch((syncError) => {
        console.log('Silent background auto-sync failed (network still offline):', syncError.message);
      });
    }, 60000);

    return () => clearInterval(syncInterval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  // Payment Logic
  const processCheckout = async (paymentMethod: string) => {
    try {
      const orderUuid = generateUUID();

      const receiptNumber = saveOrderLocally(
        orderUuid,
        totals.subtotalExclVat,
        totals.vatAmount,
        totals.totalInclVat,
        cart,
        paymentMethod
      );

      clearCart();
      showFeedback('Commande Enregistrée', `Ticket #${receiptNumber} enregistré hors-ligne.`);

      // Reload history and trigger background sync
      loadOrdersHistory();

      handleSyncOrders().catch((syncError) => {
        console.log('Background order sync failed:', syncError.message);
        
      });

    } catch (error: any) {
      console.log('Local checkout save failed:', error);
      showFeedback('Erreur', 'Impossible d\'enregistrer la commande.');
    }
  };

  // Payment Mode Selection Alert
  const handlePayOrder = () => {
    Alert.alert(
      'Sélect Mode de Paiement',
      `Total de la commande: ${totals.totalInclVat.toFixed(2)} €`,
      [
        { text: 'Espèces (Cash)', onPress: () => processCheckout('cash') },
        { text: 'Carte Bancaire (CB)', onPress: () => processCheckout('card') },
        { text: 'Ticket Resto', onPress: () => processCheckout('meal_voucher') },
        { text: 'Annuler', style: 'cancel' }
      ]
    );
  };

   // ==========================================
  // ⚖️ Legally Compliant Refund / Avoir Logic
  // ==========================================
  const handleRefundPress = (order: any) => {
    // Prevent double-refunding or refunding a refund ticket itself
    if (order.total_incl_vat < 0) {
      showFeedback('Info', 'Ce ticket est déjà un remboursement.');
      return;
    }

    Alert.alert(
      'Confirmer le Remboursement ?',
      `Voulez-vous générer un avoir de -${order.total_incl_vat.toFixed(2)} € pour le ticket #${order.sequence_number} ?`,
      [
        {
          text: 'Confirmer Remboursement',
          style: 'destructive',
          onPress: async () => {
            try {
              // Write a legally compliant negative order (Avoir)
              const refundReceiptNum = refundOrderLocally(
                order.uuid,
                order.total_incl_vat,
                order.subtotal_excl_vat,
                order.vat_amount,
                'cash' // Defaulting to refunding as cash
              );

              showFeedback('Remboursement Enregistré', `Avoir #${refundReceiptNum} créé.`);
              
              // Reload visual lists
              loadOrdersHistory();

              // Trigger background sync to upload the refund transaction
              await handleSyncOrders();
            } catch (error) {
              console.error('Refund creation failed:', error);
              showFeedback('Erreur', 'Impossible de procéder au remboursement.');
            }
          }
        },
        { text: 'Annuler', style: 'cancel' }
      ]
    );
  };

  // Render Logic loading state
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
      {/* 🚀 Render Modular and Responsive POSHeader */}
      <POSHeader
        profile={profile}
        viewMode={viewMode}
        setViewMode={(mode) => {
          if (mode === 'history') loadOrdersHistory();
          setViewMode(mode);
        }}
        syncingMenu={syncingMenu}
        syncingOrders={syncingOrders}
        onSync={async () => {
          await handleSyncMenu();
          await handleSyncOrders(true);
        }}
        onSignOut={() => auth?.signOut()}
      />

      {/* Workspace Area */}
      {viewMode === 'register' ? (
        <View style={styles.workspace}>
          {/* Cart Section */}
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
                  onPress={handlePayOrder}
                  disabled={cart.length === 0}
                >
                  <Text style={styles.payBtnText}>Pay Order</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>

          {/* Product Grid Section */}
          <View style={styles.gridColumn}>
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
      ) : (
        /* History Section */
        <View style={styles.historyContainer}>
          <Text style={styles.sectionHeader}>📁 Daily Sales & Synced Statuses</Text>
          
          {historyOrders.length === 0 ? (
            <View style={styles.emptyHistoryBox}>
              <Text style={styles.emptyHistoryText}>No transactions recorded today yet.</Text>
            </View>
          ) : (
            <ScrollView style={styles.historyScroll}>
              {historyOrders.map((order) => (
                <View key={order.uuid} style={[styles.historyRow, order.total_incl_vat < 0 && styles.historyRowRefunded]}>
                  <View style={styles.historyRowLeft}>
                    <Text style={styles.historyReceiptNum}>
                      {order.total_incl_vat < 0 ? '❌ REMBOURSEMENT' : '📄 Receipt'} #{order.sequence_number}
                    </Text>
                    <Text style={styles.historyTime}>
                      {new Date(order.completed_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                    </Text>
                    <Text style={styles.historyUuid}>UUID: {order.uuid.substring(0, 8)}...</Text>
                  </View>

                  <View style={styles.historyRowRight}>
                    <Text style={[styles.historyAmount, order.total_incl_vat < 0 && styles.historyAmountNegative]}>
                      {order.total_incl_vat.toFixed(2)} €
                    </Text>
                    
                    <View style={styles.historyStatusGroup}>
                      <Text style={order.is_synced === 1 ? styles.cloudIconSynced : styles.cloudIconOffline}>
                        {order.is_synced === 1 ? '☁️ Cloud OK' : '⚠️ Offline'}
                      </Text>

                      {order.total_incl_vat > 0 && (
                        <TouchableOpacity 
                          style={styles.refundRowBtn} 
                          onPress={() => handleRefundPress(order)}
                        >
                          <Text style={styles.refundRowBtnText}>Rembourser</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                </View>
              ))}
            </ScrollView>
          )}
        </View>
      )}
    </SafeAreaView>
  );
}

const { width } = Dimensions.get('window');
const isTablet = width > 768;

const styles = StyleSheet.create({
  mainContainer: {
    flex: 1,
    backgroundColor: '#1a202c', 
    
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  workspace: {
    flex: 1,
    flexDirection: isTablet ? 'row' : 'column',
    backgroundColor: '#fff', 
  },
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
    elevation: 1, 
    shadowColor: '#000', 
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
  historyContainer: {
    flex: 1,
    backgroundColor: '#fff',
    padding: 20,
  },
  emptyHistoryBox: {
    borderWidth: 2,
    borderColor: '#e2e8f0',
    borderStyle: 'dashed',
    borderRadius: 8,
    padding: 40,
    alignItems: 'center',
    marginTop: 20,
  },
  emptyHistoryText: {
    color: '#a0aec0',
    fontSize: 15,
  },
  historyScroll: {
    flex: 1,
    marginTop: 10,
  },
  historyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 15,
    borderRadius: 8,
    backgroundColor: '#f7fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 12,
  },
  historyRowRefunded: {
    backgroundColor: '#fff5f5',
    borderColor: '#fed7d7',
  },
  historyRowLeft: {
    flex: 0.6,
  },
  historyReceiptNum: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#2d3748',
  },
  historyTime: {
    fontSize: 13,
    color: '#718096',
    marginTop: 4,
  },
  historyUuid: {
    fontSize: 11,
    color: '#a0aec0',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    marginTop: 4,
  },
  historyRowRight: {
    flex: 0.4,
    alignItems: 'flex-end',
  },
  historyAmount: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#2d3748',
  },
  historyAmountNegative: {
    color: '#e53e3e',
  },
  historyStatusGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  cloudIconSynced: {
    fontSize: 13,
    color: '#38a169',
    fontWeight: '600',
    marginRight: 10,
  },
  cloudIconOffline: {
    fontSize: 13,
    color: '#dd6b20',
    fontWeight: '600',
    marginRight: 10,
  },
  refundRowBtn: {
    backgroundColor: '#e53e3e',
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 5,
  },
  refundRowBtnText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
});