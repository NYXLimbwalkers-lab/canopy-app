import React from 'react';
import { Tabs } from 'expo-router';
import { View, Text, StyleSheet } from 'react-native';
import { Colors } from '@/constants/Colors';
import { Theme } from '@/constants/Theme';

function TabIcon({ emoji, label, focused }: { emoji: string; label: string; focused: boolean }) {
  return (
    <View style={styles.tabIcon}>
      <Text style={styles.tabEmoji}>{emoji}</Text>
      <Text style={[styles.tabLabel, focused && styles.tabLabelActive]}>{label}</Text>
    </View>
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: styles.tabBar,
        tabBarShowLabel: false,
      }}>
      <Tabs.Screen
        name="index"
        options={{
          tabBarIcon: ({ focused }) => <TabIcon emoji="📊" label="Dashboard" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="leads"
        options={{
          tabBarIcon: ({ focused }) => <TabIcon emoji="📬" label="Leads" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="ads"
        options={{
          tabBarIcon: ({ focused }) => <TabIcon emoji="📣" label="Ads" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="content"
        options={{
          tabBarIcon: ({ focused }) => <TabIcon emoji="🎬" label="Content" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="seo"
        options={{
          tabBarIcon: ({ focused }) => <TabIcon emoji="🔍" label="SEO" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="billing"
        options={{
          href: null,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: Colors.surface,
    borderTopColor: Colors.border,
    borderTopWidth: 1,
    height: Theme.layout.tabBarHeight,
    paddingBottom: 8,
    paddingTop: 8,
  },
  tabIcon: { alignItems: 'center', gap: 2 },
  tabEmoji: { fontSize: 22 },
  tabLabel: { fontSize: 10, color: Colors.textTertiary, fontWeight: Theme.font.weight.medium },
  tabLabelActive: { color: Colors.primary },
});
