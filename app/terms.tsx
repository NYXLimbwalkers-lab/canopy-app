import React from 'react';
import { View, Text, StyleSheet, ScrollView, Platform } from 'react-native';

export default function TermsOfService() {
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Terms of Service</Text>
      <Text style={styles.updated}>Last updated: March 27, 2026</Text>

      <Text style={styles.heading}>1. Acceptance of Terms</Text>
      <Text style={styles.body}>
        By accessing or using the Canopy web application (the "Service"), you agree to be bound
        by these Terms of Service. If you do not agree to these terms, do not use the Service.
      </Text>

      <Text style={styles.heading}>2. Description of Service</Text>
      <Text style={styles.body}>
        Canopy is a business management platform for tree service and landscaping companies.
        The Service provides tools for managing leads, creating estimates and contracts,
        monitoring online reviews and SEO rankings, creating marketing content, and
        managing advertising campaigns.
      </Text>

      <Text style={styles.heading}>3. Accounts</Text>
      <Text style={styles.body}>
        You are responsible for maintaining the confidentiality of your account credentials
        and for all activities that occur under your account. You must provide accurate and
        complete information when creating an account. You agree to notify us immediately of
        any unauthorized use of your account.
      </Text>

      <Text style={styles.heading}>4. Third-Party Integrations</Text>
      <Text style={styles.body}>
        The Service integrates with third-party platforms including Google Business Profile,
        Facebook, TikTok, YouTube, and Stripe. Your use of these integrations is subject to
        the respective third-party terms of service. We are not responsible for the availability
        or functionality of third-party services. You may disconnect any third-party integration
        at any time through the Settings page.
      </Text>

      <Text style={styles.heading}>5. AI-Generated Content</Text>
      <Text style={styles.body}>
        The Service uses artificial intelligence to generate content including business advice,
        marketing copy, contract language, and estimates. AI-generated content is provided as
        suggestions only and should be reviewed before use. You are solely responsible for any
        content you publish or send using the Service. We do not guarantee the accuracy,
        completeness, or legal sufficiency of AI-generated content.
      </Text>

      <Text style={styles.heading}>6. Payment Terms</Text>
      <Text style={styles.body}>
        Certain features of the Service require a paid subscription. Payment is processed through
        Stripe. Subscription fees are billed in advance on a recurring basis. You may cancel your
        subscription at any time, and cancellation will take effect at the end of the current
        billing period.
      </Text>

      <Text style={styles.heading}>7. User Data and Content</Text>
      <Text style={styles.body}>
        You retain ownership of all data and content you create or upload to the Service. By using
        the Service, you grant us a limited license to process, store, and display your data solely
        for the purpose of providing the Service to you. We will not use your business data for
        any other purpose without your consent.
      </Text>

      <Text style={styles.heading}>8. Prohibited Uses</Text>
      <Text style={styles.body}>
        You agree not to:{'\n'}
        {'\n'}{'\u2022'} Use the Service for any unlawful purpose
        {'\n'}{'\u2022'} Attempt to gain unauthorized access to the Service or its systems
        {'\n'}{'\u2022'} Interfere with or disrupt the Service
        {'\n'}{'\u2022'} Upload malicious code or content
        {'\n'}{'\u2022'} Use the Service to send spam or unsolicited communications
        {'\n'}{'\u2022'} Resell or redistribute the Service without authorization
      </Text>

      <Text style={styles.heading}>9. Limitation of Liability</Text>
      <Text style={styles.body}>
        The Service is provided "as is" without warranties of any kind. To the maximum extent
        permitted by law, Canopy shall not be liable for any indirect, incidental, special,
        consequential, or punitive damages arising from your use of the Service. Our total
        liability shall not exceed the amount you paid for the Service in the 12 months
        preceding the claim.
      </Text>

      <Text style={styles.heading}>10. Termination</Text>
      <Text style={styles.body}>
        We may suspend or terminate your access to the Service at any time for violation of
        these Terms. You may terminate your account at any time by contacting us. Upon
        termination, your right to use the Service ceases immediately.
      </Text>

      <Text style={styles.heading}>11. Changes to Terms</Text>
      <Text style={styles.body}>
        We reserve the right to modify these Terms at any time. We will notify you of material
        changes by posting the updated terms on this page. Continued use of the Service after
        changes constitutes acceptance of the modified terms.
      </Text>

      <Text style={styles.heading}>12. Contact</Text>
      <Text style={styles.body}>
        If you have questions about these Terms of Service, please contact us at
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
  body: {
    fontSize: 15,
    lineHeight: 24,
    color: '#444',
  },
  spacer: {
    height: 48,
  },
});
