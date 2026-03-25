import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, KeyboardAvoidingView, Platform } from 'react-native';
import { router } from 'expo-router';
import { Colors } from '@/constants/Colors';
import { Theme } from '@/constants/Theme';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useAuthStore } from '@/lib/stores/authStore';

export default function RegisterScreen() {
  const [name, setName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [emailSent, setEmailSent] = useState(false);

  const { signUp, isLoading } = useAuthStore();

  const validate = () => {
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = 'Your name is required';
    if (!companyName.trim()) e.companyName = 'Company name is required';
    if (!email.trim()) e.email = 'Email is required';
    else if (!/\S+@\S+\.\S+/.test(email)) e.email = 'Enter a valid email';
    if (!password) e.password = 'Password is required';
    else if (password.length < 8) e.password = 'At least 8 characters';
    if (confirmPassword !== password) e.confirmPassword = 'Passwords do not match';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleRegister = async () => {
    setSubmitError(null);
    if (!validate()) return;
    const { error } = await signUp(
      email.trim().toLowerCase(),
      password,
      name.trim(),
      companyName.trim()
    );
    if (error) setSubmitError(error);
    else setEmailSent(true);
  };

  if (emailSent) {
    return (
      <View style={styles.container}>
        <View style={styles.emailSentContainer}>
          <Text style={styles.emailSentIcon}>📬</Text>
          <Text style={styles.emailSentTitle}>Check your email</Text>
          <Text style={styles.emailSentBody}>
            We sent a confirmation link to{'\n'}<Text style={styles.emailSentEmail}>{email}</Text>
          </Text>
          <Text style={styles.emailSentHint}>Click the link in the email to activate your account and start your free trial.</Text>
          <TouchableOpacity onPress={() => router.back()} style={styles.backToLoginBtn}>
            <Text style={styles.backToLoginText}>Back to sign in</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Text style={styles.logo}>🌳</Text>
          <Text style={styles.appName}>Canopy</Text>
          <Text style={styles.tagline}>7-day free trial. No credit card required.</Text>
        </View>

        <View style={styles.form}>
          <Text style={styles.formTitle}>Create your account</Text>

          <Input label="Your name" value={name} onChangeText={setName} placeholder="Jane Smith" autoComplete="name" error={errors.name} />
          <Input label="Company name" value={companyName} onChangeText={setCompanyName} placeholder="Smith Tree Service" error={errors.companyName} />
          <Input label="Email address" value={email} onChangeText={setEmail} placeholder="jane@smithtrees.com" keyboardType="email-address" autoCapitalize="none" autoComplete="email" error={errors.email} />
          <Input label="Password" value={password} onChangeText={setPassword} placeholder="Min. 8 characters" secureTextEntry autoComplete="new-password" error={errors.password} />
          <Input label="Confirm password" value={confirmPassword} onChangeText={setConfirmPassword} placeholder="Re-enter your password" secureTextEntry error={errors.confirmPassword} />

          {submitError ? (
            <View style={styles.errorBanner}>
              <Text style={styles.errorBannerText}>⚠️ {submitError}</Text>
            </View>
          ) : null}

          <Button label="Start free trial →" onPress={handleRegister} loading={isLoading} size="lg" style={{ marginTop: 8 }} />

          <Text style={styles.terms}>By signing up you agree to our Terms of Service and Privacy Policy.</Text>
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>Already have an account?</Text>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.footerLink}> Sign in</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { flexGrow: 1, padding: Theme.layout.screenPadding, justifyContent: 'center' },
  header: { alignItems: 'center', marginBottom: 32 },
  logo: { fontSize: 56 },
  appName: { fontSize: Theme.font.size.display, fontWeight: Theme.font.weight.heavy, color: Colors.primary, marginTop: 8 },
  tagline: { fontSize: Theme.font.size.small, color: Colors.success, marginTop: 8, fontWeight: Theme.font.weight.medium },
  form: { gap: Theme.space.md, backgroundColor: Colors.surface, padding: 24, borderRadius: Theme.radius.xl, ...Theme.shadow.md },
  formTitle: { fontSize: Theme.font.size.title, fontWeight: Theme.font.weight.bold, color: Colors.text, marginBottom: 4 },
  terms: { fontSize: Theme.font.size.caption, color: Colors.textTertiary, textAlign: 'center', lineHeight: 18 },
  errorBanner: { backgroundColor: '#3D1515', borderRadius: 8, padding: 12, borderWidth: 1, borderColor: '#7A2020' },
  errorBannerText: { color: '#FF6B6B', fontSize: 14, textAlign: 'center' },
  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: 24, paddingBottom: 32 },
  footerText: { color: Colors.textSecondary, fontSize: Theme.font.size.body },
  footerLink: { color: Colors.primary, fontSize: Theme.font.size.body, fontWeight: Theme.font.weight.semibold },
  emailSentContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 16 },
  emailSentIcon: { fontSize: 64 },
  emailSentTitle: { fontSize: Theme.font.size.headline, fontWeight: Theme.font.weight.heavy, color: Colors.text },
  emailSentBody: { fontSize: Theme.font.size.body, color: Colors.textSecondary, textAlign: 'center', lineHeight: 24 },
  emailSentEmail: { color: Colors.primary, fontWeight: Theme.font.weight.semibold },
  emailSentHint: { fontSize: Theme.font.size.small, color: Colors.textTertiary, textAlign: 'center', lineHeight: 20 },
  backToLoginBtn: { marginTop: 8, backgroundColor: Colors.primary, paddingHorizontal: 32, paddingVertical: 14, borderRadius: Theme.radius.lg },
  backToLoginText: { color: Colors.textInverse, fontWeight: Theme.font.weight.semibold, fontSize: Theme.font.size.body },
});
