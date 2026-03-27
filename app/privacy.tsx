import React from 'react';
import { View, Text, StyleSheet, ScrollView, Platform } from 'react-native';

export default function PrivacyPolicy() {
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Privacy Policy</Text>
      <Text style={styles.updated}>Last updated: March 27, 2026</Text>

      <Text style={styles.heading}>1. Introduction</Text>
      <Text style={styles.body}>
        Canopy ("we", "our", or "us") operates the Canopy web application (the "Service").
        This Privacy Policy explains how we collect, use, disclose, and safeguard your information
        when you use our Service. By using Canopy, you agree to the collection and use of
        information in accordance with this policy.
      </Text>

      <Text style={styles.heading}>2. Information We Collect</Text>
      <Text style={styles.subheading}>Account Information</Text>
      <Text style={styles.body}>
        When you create an account, we collect your name, email address, and company information
        that you provide during registration and onboarding.
      </Text>
      <Text style={styles.subheading}>Google Business Profile Data</Text>
      <Text style={styles.body}>
        If you connect your Google Business Profile, we access your business profile information,
        reviews, and location data through the Google Business Profile API. This data is used solely
        to display your business information, sync reviews, and provide SEO insights within the app.
        We do not share this data with third parties.
      </Text>
      <Text style={styles.subheading}>Business Data</Text>
      <Text style={styles.body}>
        We collect and store business information you enter including customer details, estimates,
        contracts, lead information, and advertising campaign data. This data is stored securely
        and used only to provide the Service to you.
      </Text>

      <Text style={styles.heading}>3. How We Use Your Information</Text>
      <Text style={styles.body}>
        We use the information we collect to:{'\n'}
        {'\n'}{'\u2022'} Provide, maintain, and improve the Service
        {'\n'}{'\u2022'} Display your Google Business Profile reviews and rankings
        {'\n'}{'\u2022'} Generate estimates, contracts, and PDF documents
        {'\n'}{'\u2022'} Provide AI-powered business insights and content generation
        {'\n'}{'\u2022'} Send notifications about your account and business activity
        {'\n'}{'\u2022'} Process payments through our payment provider (Stripe)
      </Text>

      <Text style={styles.heading}>4. Data Sharing</Text>
      <Text style={styles.body}>
        We do not sell, trade, or rent your personal information to third parties. We may share
        information only in the following circumstances:{'\n'}
        {'\n'}{'\u2022'} With service providers who assist in operating our Service (Supabase for
        data storage, Stripe for payments, OpenRouter for AI features)
        {'\n'}{'\u2022'} To comply with legal obligations
        {'\n'}{'\u2022'} To protect our rights and prevent fraud
      </Text>

      <Text style={styles.heading}>5. Google API Services User Data Policy</Text>
      <Text style={styles.body}>
        Canopy's use and transfer of information received from Google APIs adheres to the
        Google API Services User Data Policy, including the Limited Use requirements. We only
        request access to the Google Business Profile scopes necessary to provide our Service.
        We do not use Google user data for advertising purposes. Access tokens are stored
        securely and can be revoked by disconnecting your Google account in Settings.
      </Text>

      <Text style={styles.heading}>6. Data Storage and Security</Text>
      <Text style={styles.body}>
        Your data is stored securely using Supabase, which provides encryption at rest and in
        transit. We implement appropriate technical and organizational measures to protect your
        data against unauthorized access, alteration, disclosure, or destruction.
      </Text>

      <Text style={styles.heading}>7. Data Retention and Deletion</Text>
      <Text style={styles.body}>
        We retain your data for as long as your account is active. You can request deletion of
        your account and associated data at any time by contacting us. Upon account deletion,
        we will remove your personal data within 30 days, except where retention is required
        by law.
      </Text>

      <Text style={styles.heading}>8. Your Rights</Text>
      <Text style={styles.body}>
        You have the right to:{'\n'}
        {'\n'}{'\u2022'} Access the personal data we hold about you
        {'\n'}{'\u2022'} Request correction of inaccurate data
        {'\n'}{'\u2022'} Request deletion of your data
        {'\n'}{'\u2022'} Revoke Google account access at any time through Settings
        {'\n'}{'\u2022'} Export your data
      </Text>

      <Text style={styles.heading}>9. Cookies and Analytics</Text>
      <Text style={styles.body}>
        We use essential cookies and local storage for authentication and session management.
        We do not use third-party tracking or advertising cookies.
      </Text>

      <Text style={styles.heading}>10. Changes to This Policy</Text>
      <Text style={styles.body}>
        We may update this Privacy Policy from time to time. We will notify you of any changes
        by posting the new policy on this page and updating the "Last updated" date.
      </Text>

      <Text style={styles.heading}>11. Contact Us</Text>
      <Text style={styles.body}>
        If you have questions about this Privacy Policy, please contact us at
        support@canopyapp.com.
      </Text>

      <View style={styles.spacer} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  content: {
    padding: 24,
    maxWidth: 720,
    ...(Platform.OS === 'web' ? { alignSelf: 'center' as any, width: '100%' } : {}),
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#111',
    marginBottom: 4,
  },
  updated: {
    fontSize: 14,
    color: '#666',
    marginBottom: 24,
  },
  heading: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111',
    marginTop: 24,
    marginBottom: 8,
  },
  subheading: {
    fontSize: 15,
    fontWeight: '600',
    color: '#333',
    marginTop: 12,
    marginBottom: 4,
  },
  body: {
    fontSize: 15,
    lineHeight: 24,
    color: '#444',
  },
  spacer: {
    height: 48,
  },
});
