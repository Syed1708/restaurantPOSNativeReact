// components/POSHeader.tsx
import React from 'react';
import { ActivityIndicator, Dimensions, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

interface HeaderProps {
  profile: any;
  viewMode: 'register' | 'history';
  setViewMode: (mode: 'register' | 'history') => void;
  syncingMenu: boolean;
  syncingOrders: boolean;
  onSync: () => void;
  onSignOut: () => void;
  onCloseDay: () => void; // 🚀 NEW: Close Day trigger prop
}

const { width } = Dimensions.get('window');
const isTablet = width > 768;

export default function POSHeader({
  profile,
  viewMode,
  setViewMode,
  syncingMenu,
  syncingOrders,
  onSync,
  onSignOut,
  onCloseDay, // 🚀 NEW
}: HeaderProps) {
  return (
    <View style={styles.header}>
      
      {/* Left Column: Toggles & Title */}
      <View style={styles.headerLeft}>
        {isTablet && <Text style={styles.headerTitle}>🍔 Burger Palace</Text>}
        
        <TouchableOpacity 
          style={[styles.toggleBtn, viewMode === 'register' && styles.toggleBtnActive]}
          onPress={() => setViewMode('register')}
        >
          <Text style={[styles.toggleBtnText, viewMode === 'register' && styles.toggleBtnTextActive]}>
            {isTablet ? '⌨️ Register' : '⌨️ POS'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.toggleBtn, viewMode === 'history' && styles.toggleBtnActive]}
          onPress={() => setViewMode('history')}
        >
          <Text style={[styles.toggleBtnText, viewMode === 'history' && styles.toggleBtnTextActive]}>
            {isTablet ? '📁 Past Sales' : '📁 Sales'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Right Column: Actions & Sync/Logout */}
      {profile && (
        <View style={styles.headerProfile}>
          {isTablet && <Text style={styles.cashierText}>👤 {profile.name.split(' ')[0]}</Text>}
          
          {/* 🚀 NEW: CLOSE DAY BUTTON */}
          <TouchableOpacity onPress={onCloseDay} style={styles.closeDayButton}>
            <Text style={styles.closeDayText}>🔒 Close Day</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.syncIconButton} 
            onPress={onSync} 
            disabled={syncingMenu || syncingOrders}
          >
            {syncingMenu || syncingOrders ? (
              <ActivityIndicator size="small" color="#3182ce" />
            ) : (
              <Text style={styles.syncBtnLabel}>🔄 Sync</Text>
            )}
          </TouchableOpacity>
          
          <TouchableOpacity onPress={onSignOut} style={styles.logoutButton}>
            <Text style={styles.logoutText}>Sign Out</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    height: 60,
    backgroundColor: '#1a202c',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: isTablet ? 15 : 8,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    marginRight: 20,
  },
  toggleBtn: {
    paddingVertical: 6,
    paddingHorizontal: isTablet ? 12 : 8,
    borderRadius: 6,
    backgroundColor: '#2d3748',
    marginRight: 6,
  },
  toggleBtnActive: {
    backgroundColor: '#3182ce',
  },
  toggleBtnText: {
    color: '#a0aec0',
    fontSize: 12,
    fontWeight: 'bold',
  },
  toggleBtnTextActive: {
    color: '#fff',
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
  closeDayButton: {
    backgroundColor: '#e53e3e',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
    marginRight: 10,
  },
  closeDayText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  syncIconButton: {
    backgroundColor: '#fff',
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderRadius: 5,
    marginRight: 8,
  },
  syncBtnLabel: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#4a5568',
  },
  logoutButton: {
    paddingVertical: 5,
    paddingHorizontal: 6,
  },
  logoutText: {
    color: '#fc8181',
    fontWeight: 'bold',
    fontSize: 13,
  },
});