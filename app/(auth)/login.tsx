import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, KeyboardAvoidingView, Platform } from 'react-native';
import { router } from 'expo-router';
import { Colors } from '@/constants/Colors';
import { Theme } from '@/constants/Theme';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useAuthStore } from '@/lib/stores/authStore';
import { supabase } from '@/lib/supabase';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [magicMode, setMagicMode] = useState(false);
  const [forgotMode, setForgotMode] = useState(false);
  const [magicSent, setMagicSent] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isResetting, setIsResetting] = useState(false);

  const { signIn, sendMagicLink, isLoading } = useAuthStore();

  const validate = () => {
    const e: typeof errors = {};
    if (!email.trim()) e.email = 'Email is required';
    else if (!/\S+@\S+\.\S+/.test(email)) e.email = 'Enter a valid email';
    if (!magicMode && !forgotMode && !password) e.password = 'Password is required';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleLogin = async () => {
    setSubmitError(null);
    if (!validate()) return;

    if (forgotMode) {
      setIsResetting(true);
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
        redirectTo: 'https://canopy-app-three.vercel.app/reset-password',
      });
      setIsResetting(false);
      if (error) setSubmitError(error.message);
      else setResetSent(true);
      return;
    }

    if (magicMode) {
      const { error } = await sendMagicLink(email.trim().toLowerCase());
      if (error) setSubmitError(error);
      else setMagicSent(true);
    } else {
      const { error } = await signIn(email.trim().toLowerCase(), password);
      if (error) setSubmitError(error);
    }
  };

  // Sent screens
  if (magicSent) {
    return (
      <View style={styles.container}>
        <View style={styles.centeredContent}>
          <Text style={styles.emoji}>📬</Text>
          <Text style={styles.title}>Check your email</Text>
          <Text style={styles.subtitle}>We sent a login link to {email}. Tap it to sign in.</Text>
          <Button label="Back to login" onPress={() => { setMagicSent(false); setMagicMode(false); }} variant="ghost" style={{ marginTop: 24 }} />
        </View>
      </View>
    );
  }

  if (resetSent) {
    return (
      <View style={styles.container}>
        <View style={styles.centeredContent}>
          <Text style={styles.emoji}>🔑</Text>
          <Text style={styles.title}>Password reset sent</Text>
          <Text style={styles.subtitle}>Check {email} for a link to reset your password.</Text>
          <Button label="Back to login" onPress={() => { setResetSent(false); setForgotMode(false); }} variant="ghost" style={{ marginTop: 24 }} />
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
          <Text style={styles.tagline}>More customers for your tree company</Text>
        </View>

        <View style={styles.form}>
          <Text style={styles.formTitle}>
            {forgotMode ? 'Reset your password' : magicMode ? 'Sign in with email link' : 'Welcome back'}
          </Text>

          <Input
            label="Email address"
            value={email}
            onChangeText={setEmail}
            placeholder="you@company.com"
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            error={errors.email}
          />

          {!magicMode && !forgotMode && (
            <Input
              label="Password"
              value={password}
              onChangeText={setPassword}
              placeholder="••••••••"
              secureTextEntry
              autoComplete="current-password"
              error={errors.password}
            />
          )}

          {submitError ? (
            <View style={styles.errorBanner}>
              <Text style={styles.errorBannerText}>⚠️ {submitError}</Text>
            </View>
          ) : null}

          <Button
            label={forgotMode ? 'Send reset link' : magicMode ? 'Send magic link' : 'Sign in'}
            onPress={handleLogin}
            loading={isLoading || isResetting}
            size="lg"
            style={{ marginTop: 8 }}
          />

          {!forgotMode && (
            <TouchableOpacity onPress={() => { setMagicMode(!magicMode); setErrors({}); setSubmitError(null); }} style={styles.toggleRow}>
              <Text style={styles.toggleText}>
                {magicMode ? 'Sign in with password instead' : 'Sign in with email link (no password)'}
              </Text>
            </TouchableOpacity>
          )}

          {!magicMode && (
            <TouchableOpacity onPress={() => { setForgotMode(!forgotMode); setErrors({}); setSubmitError(null); }} style={styles.toggleRow}>
              <Text style={styles.toggleText}>
                {forgotMode ? '← Back to sign in' : 'Forgot password?'}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>Don't have an account?</Text>
          <TouchableOpacity onPress={() => router.push('/(auth)/register')}>
            <Text style={styles.footerLink}> Sign up free</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { flexGrow: 1, padding: Theme.layout.screenPadding, justifyContent: 'center' },
  centeredContent: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 16 },
  header: { alignItems: 'center', marginBottom: 40 },
  logo: { fontSize: 64 },
  appName: { fontSize: Theme.font.size.hero, fontWeight: Theme.font.weight.heavy, color: Colors.primary, marginTop: 8 },
  tagline: { fontSize: Theme.font.size.body, color: Colors.textSecondary, marginTop: 8, textAlign: 'center' },
  form: { gap: Theme.space.md, backgroundColor: Colors.surface, padding: 24, borderRadius: Theme.radius.xl, ...Theme.shadow.md },
  formTitle: { fontSize: Theme.font.size.title, fontWeight: Theme.font.weight.bold, color: Colors.text, marginBottom: 8 },
  toggleRow: { alignItems: 'center', paddingVertical: 6 },
  toggleText: { color: Colors.primary, fontSize: Theme.font.size.small, fontWeight: Theme.font.weight.medium },
  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: 32, paddingBottom: 24 },
  footerText: { color: Colors.textSecondary, fontSize: Theme.font.size.body },
  footerLink: { color: Colors.primary, fontSize: Theme.font.size.body, fontWeight: Theme.font.weight.semibold },
  errorBanner: { backgroundColor: '#3D1515', borderRadius: 8, padding: 12, borderWidth: 1, borderColor: '#7A2020' },
  errorBannerText: { color: '#FF6B6B', fontSize: 14, textAlign: 'center' },
  emoji: { fontSize: 48 },
  title: { fontSize: Theme.font.size.headline, fontWeight: Theme.font.weight.bold, color: Colors.text, textAlign: 'center' },
  subtitle: { fontSize: Theme.font.size.body, color: Colors.textSecondary, textAlign: 'center', lineHeight: 24 },
});
